import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { AsyncConversionService } from './async-conversion.service';
import { FileStatus } from '../../common/enums/file-status.enum';
import { NodeType, Prisma } from '@cloudcad/db';
import {
  SubmitConversionTaskDto,
  SubmitConversionTaskResponseDto,
  ConversionTaskItemDto,
  ConversionTaskListResponseDto,
  ConversionHistoryResponseDto,
  RetryConversionTaskResponseDto,
  ConversionQuotaDto,
} from './dto/conversion-task.dto';

/** 面板云端列表上限（#469）：只取最近的任务，避免全表扫描 */
const MAX_LIST = 50;

/** 历史分页：每页默认 / 上限（#476） */
const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 50;

/**
 * 统一转换任务服务（#467 / #468 / #469）
 *
 * 面板「云端」数据源：只有真正存到数据库、影响 node 状态的转换
 * （node.taskId 非空）才记录到服务器。本服务提供：
 * - 统一提交端点（#468）：打开类型（open + nodeId）复用 AsyncConversionService.convertNode
 * - 统一状态查询端点（#469）：列出当前用户可访问的、taskId 非空的节点转换及其实时任务状态
 *
 * 本地（localStorage）数据源由前端负责（游客 / 公开图纸等无 nodeId 关联的转换），
 * 不经过本服务。
 */
@Injectable()
export class UnifiedConversionService {
  private readonly logger = new Logger(UnifiedConversionService.name);

  constructor(
    private readonly asyncConversionService: AsyncConversionService,
    @Inject(IFunctionExecutor) private readonly executor: IFunctionExecutor,
    private readonly prisma: DatabaseService,
    private readonly restrictionEngine: RestrictionEngine
  ) {}

  /**
   * 统一提交转换任务（#468 / #474）。
   * - 打开类型（open，默认）+ nodeId：复用 convertNode（建 node.taskId + PROCESSING + 后台转换）。
   * - 下载类型（download）+ nodeId + format：复用 convertNodeForExport（后台预转换目标格式，
   *   前端轮询到完成后调现有 downloadNodeWithFormat 命中缓存秒回）。
   * 返回 taskId 供前端轮询 / 面板展示。无 nodeId（游客 / 公开图纸）由前端本地记录，此处显式 400。
   *
   * @param userId 当前用户 id（download 类型用于配额占位 + 导出服务鉴权；open 类型可选）
   */
  async submitTask(
    dto: SubmitConversionTaskDto,
    userId?: string
  ): Promise<SubmitConversionTaskResponseDto> {
    const nodeId = dto.target?.nodeId;
    if (!nodeId) {
      // 无 nodeId（游客 / 公开图纸）：本地记录，不经服务器统一提交端点
      throw new BadRequestException(
        I18nContext.current()?.t('error.conversion_task.no_node_id') ??
          '统一提交端点仅支持节点关联的转换（open/download + nodeId）；无节点关联的转换由前端本地记录'
      );
    }

    if (dto.type === 'download') {
      const format = dto.target?.format;
      if (!format) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.conversion_task.download_requires_format') ??
            '下载类型（download）必须提供目标格式（dwg/dxf/mxweb/pdf）'
        );
      }
      if (!userId) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.conversion_task.download_requires_user') ??
            '下载类型（download）需要登录用户（用于配额占位）'
        );
      }
      const taskId = await this.asyncConversionService.convertNodeForExport(
        nodeId,
        format,
        userId,
        dto.priority ?? 2
      );
      return { taskId, nodeId, async: true };
    }

    // 打开类型（open，默认）
    const taskId = await this.asyncConversionService.convertNode(
      nodeId,
      dto.priority ?? 1
    );
    return { taskId, nodeId, async: true };
  }

  /**
   * 取消任务（#463）。仅 conversion-service 模式支持（executor.cancelTask 存在）；
   * process-pool / cloud-faas 模式返回 ok=false + reason（前端据此隐藏取消入口）。
   */
  async cancelTask(taskId: string): Promise<{
    ok: boolean;
    status?: string;
    reason?: string;
  }> {
    if (!this.executor.cancelTask) {
      return {
        ok: false,
        reason:
          I18nContext.current()?.t('error.conversion_task.cancel_not_supported') ??
          '当前执行模式不支持取消（仅独立转换服务支持）',
      };
    }
    // 节点已进回收站：不要再去杀在途任务，给出精确原因。
    const deleted = await this.prisma.fileSystemNode.findFirst({
      where: { taskId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      return {
        ok: false,
        reason:
          I18nContext.current()?.t('error.conversion_task.node_deleted') ??
          '文件已删除，无法取消',
      };
    }
    return this.executor.cancelTask(taskId);
  }

  /**
   * 重试失败的转换任务：原图纸**原地重新排队**——不重新上传文件、节点保留、不占配额，
   * 无上限次数。仅接受 FAILED 状态的节点（fileStatus 为终态真相）。
   *
   * 返回新 taskId + 原 nodeId，前端按 nodeId 合并同一节点的任务。
   */
  async retryTask(
    taskId: string,
    userId: string
  ): Promise<RetryConversionTaskResponseDto> {
    const node = await this.findNodeByTaskId(taskId, userId);
    if (!node) {
      throw new NotFoundException(
        I18nContext.current()?.t(
          'error.conversion_task.not_found_or_no_access'
        ) ?? '转换任务不存在或您没有访问权限'
      );
    }
    if (node.deletedAt) {
      // 文件已进回收站（在途转换未取消时，面板可能仍残留该行被点重试）：
      // 重试已删除节点无意义，给出精确原因而非笼统的「任务不存在或无权操作」。
      throw new BadRequestException(
        I18nContext.current()?.t('error.conversion_task.node_deleted') ??
          '文件已删除，无法重试'
      );
    }
    if (node.fileStatus !== FileStatus.FAILED) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.conversion_task.retry_not_failed') ??
          '只有失败的转换任务可以重试'
      );
    }
    // 重试 = 原图纸重新排队：convertNode 只换 taskId + 置 PROCESSING，
    // 不重新上传、不删节点、不占配额。
    // priority 2：用户显式请求重跑，低于打开命脉 1、高于后台 3。
    const newTaskId = await this.asyncConversionService.convertNode(node.id, 2);
    return { taskId: newTaskId, nodeId: node.id };
  }

  /**
   * 当前调用者的转换配额只读状态（ADR-0043）：委托 RestrictionEngine 解析窗口归属
   * （登录用户按 userId、游客按 IP）后映射为 7 字段 DTO。limit <= 0 视为不限额。
   */
  async getQuota(userId?: string, ip?: string): Promise<ConversionQuotaDto> {
    const state = await this.restrictionEngine.getConversionQuotaState(
      userId,
      ip
    );
    const unlimited = state.limit <= 0;
    return {
      limit: state.limit,
      used: state.used,
      remaining: unlimited ? 0 : Math.max(0, state.limit - state.used),
      windowHours: state.windowHours,
      unlimited,
      resetsAt: state.resetsAt?.toISOString() ?? null,
      scope: state.scope,
    };
  }

  /**
   * 统一状态查询（#469）：当前用户可访问的、taskId 非空且处于进行中/失败的节点转换。
   * 对进行中（PROCESSING/UPLOADING）的节点解析实时任务状态（executor.getTaskStatus）。
   */
  async listTasks(
    userId: string
  ): Promise<ConversionTaskListResponseDto> {
    const nodes = await this.prisma.fileSystemNode.findMany({
      where: {
        deletedAt: null,
        deletedByCascade: false,
        taskId: { not: null },
        fileStatus: {
          in: [FileStatus.PROCESSING, FileStatus.UPLOADING, FileStatus.FAILED],
        },
        OR: this.buildAccessFilter(userId),
      },
      select: {
        id: true,
        name: true,
        fileStatus: true,
        taskId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_LIST,
    });

    const tasks: ConversionTaskItemDto[] = [];
    for (const node of nodes) {
      const fileStatus = node.fileStatus || FileStatus.COMPLETED;
      let taskStatus: string | undefined;
      let error: string | undefined;
      let progress: number | undefined;
      let queuePosition: number | undefined;
      if (node.taskId) {
        const inProgress =
          fileStatus === FileStatus.PROCESSING ||
          fileStatus === FileStatus.UPLOADING;
        try {
          const status = await this.executor.getTaskStatus(node.taskId);
          if (inProgress) {
            // 进行中节点：解析实时任务状态（状态 + 进度 + 错误）
            taskStatus = status.status;
            error = status.error;
            // S4-2：透传转换进度（黑盒未上报时为 undefined）
            progress = status.progress;
            // S6-5：透传排队位置（仅排队中任务有意义，运行中/未入队为 undefined）
            queuePosition = status.queuePosition;
          } else if (fileStatus === FileStatus.FAILED) {
            // FAILED 节点据任务记录取 error。节点 fileStatus 为终态真相（taskStatus
            // 不覆盖，面板据 fileStatus 展示「失败」）；任务记录丢失（404）时 catch 降级。
            error = status.error;
          }
        } catch {
          if (inProgress) taskStatus = 'UNKNOWN';
          // FAILED 节点任务记录丢失：降级为普通失败（error 保持 undefined）
        }
      }
      tasks.push({
        nodeId: node.id,
        name: node.name,
        fileStatus,
        taskId: node.taskId || undefined,
        taskStatus,
        progress,
        error,
        queuePosition,
        updatedAt: node.updatedAt.toISOString(),
      });
    }

    return { tasks, total: tasks.length };
  }

  /**
   * 转换历史分页查询（#476）：当前用户**自己账号**名下、已 COMPLETED 的**文件**节点。
   * 供面板「转换·历史」区块滚动加载（offset 分页）。
   *
   * 范围语义（#478 收窄）：历史只列**归当前用户所有**（ownerId = userId）的文件，
   * 不含"所在项目的他人文件"——面板要展示的是"我的转换记录 + 本地任务"，而非整个可访问文件库。
   *
   * 注意：历史 = 可打开的已完成文件（nodeType=FILE），**不要求 taskId 非空**——
   * 绝大多数文件转换走同步路径，完成后 taskId 为 null（仅异步任务路径会写 taskId）。
   * 若沿用 listTasks 的 `taskId: { not: null }` 会过滤掉几乎全部已完成文件，导致历史为空。
   * 已完成为只读终态数据，无需解析实时任务状态。
   *
   * `search`（可选）：按文件名模糊匹配（DB 侧 contains），用于面板搜索框跨分页检索
   * （前端只持有已加载页，无法搜到未加载数据，故搜索须下推到 DB）。
   */
  async listHistory(
    userId: string,
    limit?: number,
    offset?: number,
    search?: string
  ): Promise<ConversionHistoryResponseDto> {
    const clampedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(1, Math.floor(limit)), HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT;
    const clampedOffset = Number.isFinite(offset)
      ? Math.max(0, Math.floor(offset))
      : 0;
    // 按文件名模糊搜索（DB 侧 contains，参数化无注入风险；空=不过滤）。
    // Prisma 类型安全 API 无 iLike，contains 在 PG 上大小写敏感；如需不敏感后续用 raw ILIKE。
    const trimmedSearch = search?.trim();

    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      deletedByCascade: false,
      nodeType: NodeType.FILE,
      fileStatus: FileStatus.COMPLETED,
      ownerId: userId,
      ...(trimmedSearch ? { name: { contains: trimmedSearch } } : {}),
    };

    // 排序加 id 兜底，避免同 updatedAt 跨页重复/遗漏
    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        select: {
          id: true,
          name: true,
          fileStatus: true,
          taskId: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: clampedOffset,
        take: clampedLimit,
      }),
      this.prisma.fileSystemNode.count({ where }),
    ]);

    const tasks: ConversionTaskItemDto[] = nodes.map((node) => ({
      nodeId: node.id,
      name: node.name,
      fileStatus: node.fileStatus || FileStatus.COMPLETED,
      taskId: node.taskId || undefined,
      updatedAt: node.updatedAt.toISOString(),
    }));

    return {
      tasks,
      total,
      hasMore: clampedOffset + tasks.length < total,
    };
  }

  /**
   * 按 taskId 定位归属节点（retryTask 的归属校验用）。
   *
   * 刻意**不**过滤 `deletedAt`：删除发生在转换在途时，面板可能仍残留该行并被用户点
   * 「重试」，若一并过滤会把「文件已删除」误报成「任务不存在」。
   * 越权面不受影响——可访问范围仍由 `OR: buildAccessFilter(userId)` 约束，
   * 调用方拿到已删除节点后自行短路。
   */
  private async findNodeByTaskId(taskId: string, userId: string) {
    return this.prisma.fileSystemNode.findFirst({
      where: {
        taskId,
        OR: this.buildAccessFilter(userId),
      },
      select: { id: true, fileStatus: true, deletedAt: true },
    });
  }

  /**
   * 当前用户可访问节点的范围过滤（listTasks 实时任务用）：
   * 项目文件（属主或成员）或个人空间（属主或成员）。
   */
  private buildAccessFilter(userId: string): Prisma.FileSystemNodeWhereInput[] {
    const accessibleProjectFilter: Prisma.FileSystemNodeWhereInput = {
      nodeType: NodeType.PROJECT,
      OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
    };
    const userAccessFilter = [
      { ownerId: userId },
      { projectMembers: { some: { userId } } },
    ];
    return [
      { project: accessibleProjectFilter },
      { nodeType: NodeType.PROJECT, ...accessibleProjectFilter },
      { nodeType: NodeType.PERSONAL_SPACE, OR: userAccessFilter },
    ];
  }
}
