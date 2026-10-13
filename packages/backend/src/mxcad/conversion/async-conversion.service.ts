import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import type {
  ConversionTask,
  ConversionResult,
} from '../../function-executor/function-executor.interface';
import { FileStatus } from '../../common/enums/file-status.enum';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { FileDownloadExportService } from '../../file-system/file-download/file-download-export.service';
import { CadDownloadFormat } from '../../file-system/dto/download-node.dto';
import { FileSystemService } from '../infra/file-system.service';
import { FileConversionService } from './file-conversion.service';
import { resolveMxcadUploadDir } from '../../common/utils/mxcad-upload-dir';
import { findReadyArtifactByHash } from '../utils/conversion-artifact';
import { buildIngestConversionOptions } from '../utils/ingest-conversion-options';
import {
  CONVERSION_TASK_CHANNEL,
  type ConversionTaskSseEvent,
} from './conversion-task-sse.constants';

@Injectable()
export class AsyncConversionService {
  private readonly logger = new Logger(AsyncConversionService.name);

  constructor(
    @Inject(IFunctionExecutor)
    private readonly executor: IFunctionExecutor,
    private readonly prisma: DatabaseService,
    private readonly nodeStatusTransitioner: NodeStatusTransitioner,
    private readonly storageManager: StorageManager,
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async convertNode(nodeId: string, priority: 1 | 2 | 3 = 1): Promise<string> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
    });
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 去重守卫：节点已有在途任务时直接返回已有 taskId，不覆盖 node.taskId——
    // 重复提交（用户连点转换）不再让在途旧任务失去面板跟踪（只能靠对账兜底）。
    const inFlight = this.inFlightTaskId(node);
    if (inFlight) {
      this.logger.log(
        `Node ${nodeId} already has in-flight conversion task ${inFlight}; returning existing taskId without overwriting`
      );
      return inFlight;
    }

    // 已是 mxweb（原生格式）的节点无需转换：引擎对 .mxweb 源按「导出方向」处理，
    // 无目标格式时必然失败（content-error），会把节点打成 FAILED——这正是「打开
    // mxweb 却进转换队列且立刻失败」的根因。产物已就位（path 非空）时直接置
    // COMPLETED，打开链路据此秒开，不再拉起注定失败的转换。仅对非在途态短路：
    // PROCESSING/UPLOADING 表示确有在途转换（或刚建节点），交由既有流程结算。
    if (
      node.name?.toLowerCase().endsWith('.mxweb') &&
      node.path &&
      node.fileStatus !== FileStatus.PROCESSING &&
      node.fileStatus !== FileStatus.UPLOADING
    ) {
      if (node.fileStatus !== FileStatus.COMPLETED) {
        await this.nodeStatusTransitioner.transition(
          nodeId,
          (node.fileStatus as FileStatus | null) ?? null,
          FileStatus.COMPLETED
        );
      }
      this.logger.log(
        `Node ${nodeId} is already mxweb (path=${node.path}); no conversion needed`
      );
      return node.taskId ?? `async_${nodeId}_noop`;
    }

    const taskId = `async_${nodeId}_${Date.now()}`;

    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { taskId },
    });

    await this.nodeStatusTransitioner.transition(
      nodeId,
      (node.fileStatus as FileStatus | null) ?? null,
      FileStatus.PROCESSING
    );

    // node.path（相对存储根）→ 绝对路径走 StorageManager 正典，与其他 node.path
    // 消费方（缩略图/外参照/保存）同一 base，禁再自配 fallback（旧 homedir 兜底
    // 与权威配置默认值不相等，自托管模式下错误路径会跨 HTTP 传给转换服务）
    const srcPath = node.path ? this.storageManager.getFullPath(node.path) : '';

    const task: ConversionTask = {
      id: taskId,
      type: 'convertFile',
      params: buildIngestConversionOptions({
        srcPath,
        fileHash: node.fileHash || nodeId,
        debugNodeId: nodeId,
      }),
      priority,
      createdAt: new Date(),
    };

    this.executor
      .invoke(task)
      .then((result) => this.handleResult(nodeId, taskId, result))
      .catch((error: unknown) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Background conversion failed for node ${nodeId}: ${errMsg}`
        );
        this.updateNodeStatus(nodeId, FileStatus.FAILED).catch((e) =>
          this.logger.error(
            `Failed to update node ${nodeId} to FAILED: ${e.message}`
          )
        );
      });

    return taskId;
  }

  /**
   * 注册后台转换任务（S5-2 上传链路统一）：写 node.taskId + 置 PROCESSING，
   * **不触发 executor.invoke**（转换由调用方自行执行——上传链路用同步 convertFile，
   * 打开/导出链路用 convertNode 的 executor.invoke）。
   *
   * 使上传图纸进面板「云端」列表（node.taskId 非空 = 云端任务），前端据此可见 + 轮询。
   * 与 convertNode 共享 taskId 生成规则（async_{nodeId}_{ts}），面板统一展示。
   *
   * @returns 生成的 taskId（调用方完成转换后可据此清 taskId 或保留供面板跟踪）
   */
  async registerTask(nodeId: string): Promise<string> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
    });
    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    const taskId = `async_${nodeId}_${Date.now()}`;

    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { taskId },
    });

    // 节点已 PROCESSING（上传链路在建节点时置态），此处仅确保 PROCESSING（幂等）。
    if (node.fileStatus !== FileStatus.PROCESSING) {
      await this.nodeStatusTransitioner.transition(
        nodeId,
        (node.fileStatus as FileStatus | null) ?? null,
        FileStatus.PROCESSING
      );
    }

    this.logger.log(
      `Registered background conversion task for node ${nodeId} (task ${taskId})`
    );
    return taskId;
  }

  /**
   * 导出/下载类型转换（#474）：把节点 mxweb 后台预转换成目标格式（dwg/dxf/pdf），
   * 使统一提交端点立即返回 202 + taskId，前端轮询队列状态到完成后再调现有 downloadNodeWithFormat
   * 命中新鲜缓存秒回。
   *
   * v1 取舍（见 #428 决策）：复用 node 状态（node.taskId + fileStatus=PROCESSING）跟踪；
   * 完成后 fileStatus=COMPLETED。FileDownloadExportService 经 ModuleRef 惰性解析，
   * 规避 mxcad/conversion ↔ file-system 模块循环依赖。
   */
  async convertNodeForExport(
    nodeId: string,
    format: string,
    userId: string,
    priority: 1 | 2 | 3 = 2
  ): Promise<string> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
    });
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 同 convertNode 的去重守卫：节点已有在途任务（打开转换或前一次导出）时
    // 返回已有 taskId，不覆盖——双击下载不再丢失在途任务跟踪。
    const inFlight = this.inFlightTaskId(node);
    if (inFlight) {
      this.logger.log(
        `Node ${nodeId} already has in-flight task ${inFlight}; returning existing taskId without overwriting`
      );
      return inFlight;
    }

    const taskId = `async_export_${nodeId}_${Date.now()}`;

    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { taskId },
    });

    await this.nodeStatusTransitioner.transition(
      nodeId,
      (node.fileStatus as FileStatus | null) ?? null,
      FileStatus.PROCESSING
    );

    const exportService = this.moduleRef.get(FileDownloadExportService, {
      strict: false,
    });
    exportService
      .precomputeExport(nodeId, userId, format as CadDownloadFormat)
      .then(() => this.updateNodeStatus(nodeId, FileStatus.COMPLETED))
      .catch((error: unknown) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Background export failed for node ${nodeId}: ${errMsg}`
        );
        this.updateNodeStatus(nodeId, FileStatus.FAILED).catch((e) =>
          this.logger.error(
            `Failed to update node ${nodeId} to FAILED: ${e.message}`
          )
        );
      });

    this.logger.log(
      `Export conversion queued for node ${nodeId} (task ${taskId}, format ${format}, priority ${priority})`
    );
    return taskId;
  }

  /**
   * 重新转换（#4c）：对已 COMPLETED 的 CAD 节点，从**原始源文件**（dwg/dxf）重跑引擎，
   * 把新 mxweb 覆盖到节点既有 path（不重新分配存储），再置 COMPLETED。
   *
   * 与 convertNode 的区别：convertNode 以 node.path（mxweb 产物）为源，对已转换的 CAD
   * 节点会按「导出方向」喂给引擎而必然失败；重新转换必须回到原始源文件。原始源优先取
   * uploads 目录 {hash}.{ext}（原始上传），回退节点目录 {nodeId}.{ext} 灾难恢复备份；
   * 两者都不可用时报错（无法凭空重转）。mxweb 节点本就是原生格式，重转无意义，直接 no-op。
   *
   * 走 fire-and-forget（同 convertNode）：立即返回 taskId，后台重转 + 覆盖产物 + 状态迁移。
   */
  async reconvertNode(nodeId: string): Promise<string> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
    });
    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    // mxweb 节点本就是原生格式，重转无意义（同 convertNode 的 mxweb 短路）
    if (node.name?.toLowerCase().endsWith('.mxweb')) {
      return node.taskId ?? `async_${nodeId}_noop`;
    }

    // 去重守卫：节点已有在途任务时直接返回（同 convertNode）
    const inFlight = this.inFlightTaskId(node);
    if (inFlight) {
      this.logger.log(
        `Node ${nodeId} already has in-flight task ${inFlight}; reconvert returns existing taskId`
      );
      return inFlight;
    }

    const originalSource = await this.resolveOriginalSource(node);
    if (!originalSource) {
      throw new BadRequestException(`原始文件不可用，无法重新转换: ${nodeId}`);
    }

    const taskId = `async_re_${nodeId}_${Date.now()}`;
    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { taskId },
    });
    await this.nodeStatusTransitioner.transition(
      nodeId,
      (node.fileStatus as FileStatus | null) ?? null,
      FileStatus.PROCESSING
    );

    const fileHash = node.fileHash || nodeId;
    const nodePath = node.path;
    void this.runReconversion(nodeId, fileHash, originalSource, nodePath).catch(
      (error: unknown) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Reconversion failed for node ${nodeId}: ${errMsg}`);
        this.updateNodeStatus(nodeId, FileStatus.FAILED).catch((e) =>
          this.logger.error(
            `Failed to update node ${nodeId} to FAILED: ${e.message}`
          )
        );
      }
    );

    this.logger.log(
      `Reconversion queued for node ${nodeId} (task ${taskId}, source=${originalSource})`
    );
    return taskId;
  }

  /**
   * 定位原始源文件（dwg/dxf）：优先 uploads 目录 {hash}.{ext}（原始上传），
   * 回退节点目录 {nodeDir}/{nodeId}.{ext}（writeOriginalBackup 的灾难恢复副本）。
   * 都不可用返回 null。
   */
  private async resolveOriginalSource(node: {
    id: string;
    name: string | null;
    fileHash: string | null;
    path: string | null;
  }): Promise<string | null> {
    const hash = node.fileHash;
    if (!hash) return null;
    const ext = path.extname(node.name || '').replace('.', '').toLowerCase();
    if (!ext) return null;
    const fileSystemService = this.moduleRef.get(FileSystemService, {
      strict: false,
    });
    // 1) uploads 目录 {hash}.{ext}（原始上传文件）
    const uploadOriginal = fileSystemService.getMd5Path(`${hash}.${ext}`);
    if (await fileSystemService.exists(uploadOriginal)) return uploadOriginal;
    // 2) 节点目录备份 {nodeDir}/{nodeId}.{ext}（灾难恢复副本）
    if (node.path) {
      const backupRelative = path.join(
        path.dirname(node.path),
        `${node.id}.${ext}`
      );
      const backupAbs = this.storageManager.getFullPath(backupRelative);
      if (await fileSystemService.exists(backupAbs)) return backupAbs;
    }
    return null;
  }

  /**
   * 后台重新转换：从原始源重跑引擎（forceConvert 绕过产物就位短路）→ 成功后把新 mxweb
   * 覆盖到节点既有 path（不重新分配存储）→ 置 COMPLETED。任何失败向上抛（由调用方
   * 的 catch 置 FAILED）。
   */
  private async runReconversion(
    nodeId: string,
    fileHash: string,
    originalSource: string,
    nodePath: string | null
  ): Promise<void> {
    const fileConversionService = this.moduleRef.get(FileConversionService, {
      strict: false,
    });
    const result = await fileConversionService.convertFile(
      buildIngestConversionOptions({
        srcPath: originalSource,
        fileHash,
        forceConvert: true,
        debugNodeId: nodeId,
      })
    );
    if (!result.isOk) {
      throw new Error(result.error || '重新转换失败');
    }
    if (nodePath) {
      await this.copyNewArtifactToNode(nodeId, fileHash, nodePath);
    }
    await this.updateNodeStatus(nodeId, FileStatus.COMPLETED);
  }

  /**
   * 把重转产出的新 mxweb 覆盖到节点既有 path（同名覆盖，不重新分配存储）。
   * 产物未就位（引擎 isOk 但产物缺失，理论上不应发生）时保留既有 mxweb，仅告警。
   */
  private async copyNewArtifactToNode(
    nodeId: string,
    fileHash: string,
    nodePath: string
  ): Promise<void> {
    const configService = this.moduleRef.get(ConfigService, { strict: false });
    const uploadDir = resolveMxcadUploadDir(configService);
    const artifactName = findReadyArtifactByHash(uploadDir, fileHash, '.mxweb');
    if (!artifactName) {
      this.logger.warn(
        `Reconversion artifact not found for node ${nodeId} (hash=${fileHash}); keeping existing mxweb`
      );
      return;
    }
    const srcPath = path.join(uploadDir, artifactName);
    const destPath = this.storageManager.getFullPath(nodePath);
    await fsPromises.copyFile(srcPath, destPath);
    this.logger.log(`Reconversion: overwrote node ${nodeId} mxweb at ${nodePath}`);
  }

  async getNodeConversionStatus(nodeId: string): Promise<{
    fileStatus: string;
    taskId?: string;
    taskStatus?: string;
    error?: string;
  }> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
    });
    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    const fileStatus = node.fileStatus || FileStatus.COMPLETED;

    let taskStatus: string | undefined;
    let error: string | undefined;

    if (
      node.taskId &&
      (fileStatus === FileStatus.PROCESSING ||
        fileStatus === FileStatus.UPLOADING)
    ) {
      try {
        const status = await this.executor.getTaskStatus(node.taskId);
        taskStatus = status.status;
        error = status.error;
      } catch {
        taskStatus = 'UNKNOWN';
      }
    }

    return {
      fileStatus,
      taskId: node.taskId || undefined,
      taskStatus,
      error,
    };
  }

  private async handleResult(
    nodeId: string,
    taskId: string,
    result: ConversionResult
  ): Promise<void> {
    this.logger.log(
      `Async conversion completed for node ${nodeId} (task ${taskId}): ${result.status}`
    );
    if (result.status === 'COMPLETED') {
      await this.updateNodeStatus(nodeId, FileStatus.COMPLETED);
    } else {
      this.logger.error(
        `Async conversion failed for node ${nodeId}: ${result.error}`
      );
      await this.updateNodeStatus(nodeId, FileStatus.FAILED);
    }
  }

  private async updateNodeStatus(
    nodeId: string,
    status: FileStatus
  ): Promise<void> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { fileStatus: true, ownerId: true, deletedAt: true },
    });
    if (!node) {
      // 节点已被永久删除（物理删行）：无状态可回写，静默返回，
      // 否则 transition 抛错会触发 updateNodeStatusWithRetry 的 3 次无意义重试
      this.logger.warn(
        `Node ${nodeId} no longer exists; dropping terminal status ${status}`
      );
      return;
    }
    if (node.deletedAt) {
      // 节点在转换在途时被删除：不回写终态。
      // - DELETED → COMPLETED 是状态机的合法边（回收站恢复用），照写会让已删除的文件
      //   静默「复活」为 COMPLETED，而 deletedAt 仍在 → 状态与软删标记互相矛盾。
      // - DELETED → FAILED 非法，transition 抛 BadRequestException，
      //   上层 updateNodeStatusWithRetry 会白白重试 3 次并报 ERROR。
      // 清 taskId 停止面板跟踪（节点已不在 listTasks 范围内，此处仅是清理残留引用）。
      this.logger.warn(
        `Node ${nodeId} was deleted during conversion; dropping terminal status ${status} and clearing taskId`
      );
      await this.prisma.fileSystemNode
        .update({ where: { id: nodeId }, data: { taskId: null } })
        .catch((e: unknown) =>
          this.logger.error(
            `Failed to clear taskId for deleted node ${nodeId}: ${(e as Error).message}`
          )
        );
      return;
    }
    await this.nodeStatusTransitioner.transition(
      nodeId,
      node.fileStatus as FileStatus,
      status
    );
    // S4-3：终态（COMPLETED/FAILED）变更后推送 SSE，面板实时刷新（best-effort，
    // 失败不影响状态迁移）。per-user 通道按 ownerId 分（面板数据源=当前用户可访问任务）。
    this.emitTaskStatusChange(node.ownerId, nodeId, status);
  }

  /** S4-3：向 per-user 通道 emit 终态变更（无 ownerId 或 emit 失败时静默降级，不影响主链路） */
  private emitTaskStatusChange(
    ownerId: string | null,
    nodeId: string,
    status: FileStatus
  ): void {
    if (!ownerId) return;
    try {
      this.eventEmitter.emit(CONVERSION_TASK_CHANNEL(ownerId), {
        nodeId,
        status,
      } satisfies ConversionTaskSseEvent);
    } catch (err) {
      this.logger.warn(
        `Failed to emit conversion-task SSE event for node ${nodeId}: ${(err as Error).message}`
      );
    }
  }

  /**
   * 去重守卫判据（convertNode / convertNodeForExport 共用）：
   * 节点已有在途任务时返回其 taskId，否则 null。
   *
   * 在途判定与 listTasks 的 inProgress 一致：taskId 非空且 fileStatus ∈
   * {PROCESSING, UPLOADING}。终态（FAILED/COMPLETED）的残留 taskId 不算在途，
   * 不阻塞重新提交（retryTask 走 convertNode，要求 FAILED，同样不受阻）。
   */
  private inFlightTaskId(node: {
    taskId: string | null;
    fileStatus: string | null;
  }): string | null {
    if (!node.taskId) return null;
    if (
      node.fileStatus !== FileStatus.PROCESSING &&
      node.fileStatus !== FileStatus.UPLOADING
    ) {
      return null;
    }
    return node.taskId;
  }
}
