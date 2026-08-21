import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import type {
  ConversionTask,
  ConversionResult,
} from '../../function-executor/function-executor.interface';
import { FileStatus } from '../../common/enums/file-status.enum';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';

@Injectable()
export class AsyncConversionService {
  private readonly logger = new Logger(AsyncConversionService.name);

  constructor(
    @Inject(IFunctionExecutor)
    private readonly executor: IFunctionExecutor,
    private readonly prisma: DatabaseService,
    private readonly nodeStatusTransitioner: NodeStatusTransitioner
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
      select: { fileStatus: true },
    });
    await this.nodeStatusTransitioner.transition(
      nodeId,
      (node?.fileStatus as FileStatus | null) ?? null,
      status
    );
  }

  private async resolveNodePath(nodePath: string): Promise<string> {
    const { default: path } = await import('path');
    const { default: os } = await import('os');
    const filesDataPath =
      process.env.FILES_DATA_PATH || path.join(os.homedir(), 'filesData');
    return path.resolve(filesDataPath, nodePath);
  }
}
