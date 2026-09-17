import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import type {
  ConversionTask,
  ConversionResult,
} from '../../function-executor/function-executor.interface';
import { FileStatus } from '../../common/enums/file-status.enum';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { FileDownloadExportService } from '../../file-system/file-download/file-download-export.service';
import { CadDownloadFormat } from '../../file-system/dto/download-node.dto';
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

    const srcPath = node.path ? await this.resolveNodePath(node.path) : '';

    const task: ConversionTask = {
      id: taskId,
      type: 'convertFile',
      params: {
        srcPath,
        fileHash: node.fileHash || nodeId,
        createPreloadingData: true,
        outname: undefined,
        debugNodeId: nodeId,
      },
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
      select: { fileStatus: true, ownerId: true },
    });
    await this.nodeStatusTransitioner.transition(
      nodeId,
      (node?.fileStatus as FileStatus | null) ?? null,
      status
    );
    // S4-3：终态（COMPLETED/FAILED）变更后推送 SSE，面板实时刷新（best-effort，
    // 失败不影响状态迁移）。per-user 通道按 ownerId 分（面板数据源=当前用户可访问任务）。
    this.emitTaskStatusChange(node?.ownerId ?? null, nodeId, status);
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

  private async resolveNodePath(nodePath: string): Promise<string> {
    const { default: path } = await import('path');
    const { default: os } = await import('os');
    const filesDataPath =
      process.env.FILES_DATA_PATH || path.join(os.homedir(), 'filesData');
    return path.resolve(filesDataPath, nodePath);
  }
}
