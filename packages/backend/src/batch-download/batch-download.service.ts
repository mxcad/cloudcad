import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { DiskMonitorService } from '../storage-management/services/disk-monitor.service';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../common/enums/permissions.enum';
import { NodeType, BatchJobStatus } from '@cloudcad/db';
import { SseManager } from './sse-manager';
import { BatchDownloadJob } from './batch-download-job';
import { ArchiveWriter, type ArchiveEntry } from './archive-writer';
import { FolderExpanderService } from './folder-expander.service';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import type {
  BatchProgressEvent,
  BatchDownloadTaskPage,
} from './batch-download.types';
import type {
  BatchFileItem,
  CreateBatchDownloadDto,
} from './dto/create-batch-download.dto';
import { isInUploadsCache } from './upload-cache.util';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

@Injectable()
export class BatchDownloadService {
  private readonly logger = new Logger(BatchDownloadService.name);
  private readonly exportDir: string;
  private readonly minDiskSpace: number;
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly diskMonitor: DiskMonitorService,
    @Inject(IPERMISSION_SERVICE)
    private readonly systemPermissionService: IPermissionService,
    private readonly sseManager: SseManager,
    private readonly batchDownloadJob: BatchDownloadJob,
    private readonly folderExpander: FolderExpanderService,
    private readonly archiveWriter: ArchiveWriter,
    private readonly restrictionEngine: RestrictionEngine
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.exportDir = batchConfig.exportDir;
    this.minDiskSpace = batchConfig.minDiskSpace;
    this.mxcadUploadPath =
      this.configService.get<string>('mxcadUploadPath') || '';
    fsPromises.mkdir(this.exportDir, { recursive: true }).catch(() => {});
  }

  async createTask(
    userId: string,
    dto: CreateBatchDownloadDto
  ): Promise<{ taskId: string }> {
    const { fileList, projectId, libraryType } = dto;
    // DTO 历史上就声明了 'zip' | 'individual'，individual 现已实现：单文件直出（不打包 ZIP）
    const mode = dto.mode === 'individual' ? 'individual' : 'zip';

    if (!fileList || fileList.length === 0) {
      throw new BadRequestException('File list is empty');
    }

    // 每项须有 nodeId（已保存节点）或 fileHash（CAD 编辑器内存导出上传的临时文件）之一
    for (const item of fileList) {
      if (!item.nodeId && !item.fileHash) {
        throw new BadRequestException(
          'Each file item requires nodeId or fileHash'
        );
      }
    }

    // 导出下载方向（dwg/dxf/pdf）会员门控：非 VIP 且开关未开放时同步 403（VIP_FEATURE_REQUIRED），
    // 前端据此弹购买引导。必须在此（创建任务前）显式检查——否则任务创建后在后台 job 中才失败，
    // 错误消息被 job 级 catch 吞掉，前端只能看到笼统的「批量下载失败」，丢失 VIP 原因。
    // 纯 mxweb/original 下载不受门控（与 orchestrator 的 tryAddOriginal 分支一致）。
    if (this.hasExportFormat(fileList)) {
      await this.restrictionEngine.assertExportDownloadAllowed(userId);
    }

    let effectiveProjectId = projectId;

    if (libraryType) {
      const requiredPermission =
        libraryType === 'drawing'
          ? SystemPermission.LIBRARY_DRAWING_MANAGE
          : SystemPermission.LIBRARY_BLOCK_MANAGE;
      const hasPermission =
        await this.systemPermissionService.checkSystemPermission(
          userId,
          requiredPermission
        );
      if (!hasPermission) {
        throw new ForbiddenException(
          `Insufficient permissions for ${libraryType} library download`
        );
      }
      effectiveProjectId =
        projectId || (await this.getLibraryRootId(libraryType));
    } else {
      // 普通项目校验：确保所有文件属于同一个项目
      const projectIds = new Set<string>();
      let hasNodeItem = false;
      for (const item of fileList) {
        // fileHash-only 项（CAD 编辑器内存导出）：无 DB 节点，跳过节点校验与项目归属
        if (!item.nodeId) continue;
        hasNodeItem = true;
        const node = await this.prisma.fileSystemNode.findUnique({
          where: { id: item.nodeId },
          select: { projectId: true, nodeType: true },
        });
        if (!node) {
          throw new NotFoundException(`Node not found: ${item.nodeId}`);
        }
        if (node.projectId) {
          projectIds.add(node.projectId);
        }
      }

      if (projectIds.size > 1) {
        throw new BadRequestException(
          'All files must belong to the same project'
        );
      }

      effectiveProjectId =
        effectiveProjectId ||
        (projectIds.size === 1 ? [...projectIds][0] : null);
      // 仅当存在 nodeId 项时才要求项目归属；纯 fileHash 任务（内存导出）允许无项目
      if (hasNodeItem && !effectiveProjectId) {
        throw new BadRequestException('Project ID is required');
      }
    }

    const diskStatus = this.diskMonitor.getDiskStats(this.exportDir);
    if (diskStatus.free < this.minDiskSpace) {
      throw new ServiceUnavailableException(
        `Insufficient disk space: ${diskStatus.free} bytes available, ${this.minDiskSpace} bytes required`
      );
    }

    const totalFormatCount = fileList.reduce(
      (sum, item) => sum + item.formats.length,
      0
    );

    const job = await this.prisma.batchDownloadJob.create({
      data: {
        userId,
        projectId: effectiveProjectId,
        status: BatchJobStatus.PENDING,
        fileList: fileList as any,
        mode,
        totalCount: totalFormatCount,
        completedCount: 0,
        errorCount: 0,
        errors: null,
      },
    });

    this.batchDownloadJob.start(job.id).catch((err) => {
      this.logger.error(
        `Job processing failed: ${job.id} - ${(err as Error).message}`
      );
    });

    this.logger.log(
      `Batch download task created: ${job.id} by user ${userId} (${totalFormatCount} formats across ${fileList.length} files)`
    );

    return { taskId: job.id };
  }

  async getProgress(
    taskId: string,
    userId: string
  ): Promise<BatchProgressEvent> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    return {
      taskId: job.id,
      status: job.status,
      mode: job.mode === 'individual' ? 'individual' : 'zip',
      totalCount: job.totalCount,
      completedCount: job.completedCount,
      errorCount: job.errorCount,
      errors: (job.errors as any) || undefined,
      zipPath: job.zipPath || undefined,
      zipSize: job.zipSize || undefined,
      itemNames: this.deriveItemNames(job),
    };
  }

  async cancelTask(taskId: string, userId: string): Promise<void> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (BatchDownloadJob.isTerminal(job.status)) {
      throw new BadRequestException(`Task already ${job.status.toLowerCase()}`);
    }
    const cancelled = await this.batchDownloadJob.cancel(taskId);
    if (!cancelled) {
      throw new BadRequestException(`Task already ${job.status.toLowerCase()}`);
    }
    this.logger.log(
      `Batch download task cancelled: ${taskId} by user ${userId}`
    );
  }

  /**
   * 重试 FAILED 任务：fileList + mode 已持久化，复位到 PENDING 后重新 start。
   * 仅 FAILED 任务可重试（COMPLETED 无需重试，CANCELLED/进行中不可）。
   *
   * 复位经 BatchDownloadJob.resetForRetry（ADR-0038：状态写入一律经 transition），
   * 用 updateMany + where status=FAILED 做原子条件更新：并发双重试只有第一个
   * 成功，第二个拿 409，不再出现两条独立 processJob 写同一行。
   */
  async retryTask(
    taskId: string,
    userId: string
  ): Promise<{ taskId: string }> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== BatchJobStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can be retried');
    }
    // 导出下载方向会员门控：任务可能因非 VIP 失败，重试前同步校验（用户仍非 VIP 时 403）
    const fileList = (job.fileList as unknown as BatchFileItem[]) ?? [];
    if (this.hasExportFormat(fileList)) {
      await this.restrictionEngine.assertExportDownloadAllowed(userId);
    }
    const reset = await this.batchDownloadJob.resetForRetry(taskId);
    if (!reset) {
      throw new ConflictException('Task is no longer in a retryable state');
    }
    this.batchDownloadJob.start(taskId).catch((err) => {
      this.logger.error(
        `Job retry failed: ${taskId} - ${(err as Error).message}`
      );
    });
    this.logger.log(`Batch download task retried: ${taskId} by user ${userId}`);
    return { taskId };
  }

  /**
   * 部分失败重试：仅重跑 FAILED 任务中失败的文件项（individual 模式常见——
   * 部分文件转换失败，成功项无需重跑）。从 job.errors 提取失败 nodeId，
   * 过滤原 fileList 后创建**新任务**（同 mode/projectId）并 start，返回新任务 ID。
   * 原任务保持 FAILED 终态（其成功产物仍可下载）。
   */
  async retryFailedItems(
    taskId: string,
    userId: string
  ): Promise<{ newTaskId: string }> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== BatchJobStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can retry failed items');
    }

    const failedNodeIds = new Set(
      ((job.errors as unknown as Array<{ nodeId: string }> | null) ?? []).map(
        (e) => e.nodeId
      )
    );
    if (failedNodeIds.size === 0) {
      throw new BadRequestException('No failed items to retry');
    }

    const failedFileList = (job.fileList as unknown as BatchFileItem[]).filter(
      (item) => failedNodeIds.has(item.nodeId)
    );
    if (failedFileList.length === 0) {
      throw new BadRequestException('No matching failed items in file list');
    }

    // 导出下载方向会员门控：重试失败项前同步校验（用户仍非 VIP 时 403）
    if (this.hasExportFormat(failedFileList)) {
      await this.restrictionEngine.assertExportDownloadAllowed(userId);
    }

    const diskStatus = this.diskMonitor.getDiskStats(this.exportDir);
    if (diskStatus.free < this.minDiskSpace) {
      throw new ServiceUnavailableException(
        `Insufficient disk space: ${diskStatus.free} bytes available, ${this.minDiskSpace} bytes required`
      );
    }

    const totalFormatCount = failedFileList.reduce(
      (sum, item) => sum + item.formats.length,
      0
    );

    const newJob = await this.prisma.batchDownloadJob.create({
      data: {
        userId,
        projectId: job.projectId,
        status: BatchJobStatus.PENDING,
        fileList: failedFileList as any,
        mode: job.mode,
        totalCount: totalFormatCount,
        completedCount: 0,
        errorCount: 0,
        errors: null,
      },
    });

    this.batchDownloadJob.start(newJob.id).catch((err) => {
      this.logger.error(
        `Retry-failed job processing failed: ${newJob.id} - ${(err as Error).message}`
      );
    });

    this.logger.log(
      `Batch download failed items retried: ${taskId} -> ${newJob.id} (${totalFormatCount} formats) by user ${userId}`
    );
    return { newTaskId: newJob.id };
  }

  async getDownloadPath(taskId: string, userId: string): Promise<string> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== BatchJobStatus.COMPLETED)
      throw new ConflictException('Task not completed yet');
    if (!job.zipPath) throw new NotFoundException('ZIP file not found');
    const fullPath = path.resolve(this.exportDir, job.zipPath);
    if (!fs.existsSync(fullPath))
      throw new NotFoundException('ZIP file has expired or been deleted');
    return fullPath;
  }

  /**
   * individual 模式：按 index 解析单文件产物。
   * 失败项（转换失败未进 manifest）与已过期删除的产物返回 null，调用方转为 404，
   * 前端据此跳过失败项继续下载其余文件。
   */
  async getItemDownload(
    taskId: string,
    userId: string,
    itemIndex: number
  ): Promise<{ fullPath: string; name: string; temp: boolean } | null> {
    const job = await this.prisma.batchDownloadJob.findUnique({
      where: { id: taskId },
    });
    if (!job) throw new NotFoundException('Task not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== BatchJobStatus.COMPLETED)
      throw new ConflictException('Task not completed yet');
    if (job.mode !== 'individual')
      throw new BadRequestException('Task is not an individual download');

    const manifest = (job.itemsManifest as any[]) || [];
    const item = manifest.find((m) => m.index === itemIndex);
    if (!item || !item.sourcePath) return null;
    if (!fs.existsSync(item.sourcePath)) return null;
    return {
      fullPath: item.sourcePath,
      name: item.name,
      // uploads/ 下产物是内容寻址共享缓存：历史行可能存了 temp:true，
      // 按路径重判避免下载端点把共享缓存条目提前 unlink
      temp:
        !!item.temp && !isInUploadsCache(item.sourcePath, this.mxcadUploadPath),
    };
  }

  /**
   * 合并多个 COMPLETED 任务为单个 ZIP（临时按需产物，调用方流式下载后负责清理）。
   * - zip 模式任务：其 zip 文件作为嵌套条目内嵌（无 zip 读取库，不引入新依赖）；
   * - individual 模式任务：展开 itemsManifest 各文件（跳过已失效/不存在的产物）。
   * 返回合并 zip 的绝对路径。
   */
  async mergeZip(taskIds: string[], userId: string): Promise<string> {
    if (!taskIds || taskIds.length === 0) {
      throw new BadRequestException('Task list is empty');
    }
    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length > 20) {
      throw new BadRequestException('Too many tasks to merge (max 20)');
    }

    const entries: ArchiveEntry[] = [];
    const usedNames = new Set<string>();

    for (const taskId of uniqueTaskIds) {
      const job = await this.prisma.batchDownloadJob.findUnique({
        where: { id: taskId },
      });
      if (!job) throw new NotFoundException(`Task not found: ${taskId}`);
      if (job.userId !== userId) throw new ForbiddenException('Access denied');
      if (job.status !== BatchJobStatus.COMPLETED) {
        throw new ConflictException(`Task not completed: ${taskId}`);
      }

      if (job.mode === 'individual') {
        const manifest = (job.itemsManifest as any[]) || [];
        for (const item of manifest) {
          if (!item.sourcePath || !item.name) continue;
          if (!fs.existsSync(item.sourcePath)) continue;
          entries.push({
            name: this.uniqueZipEntryName(item.name, usedNames),
            stream: fs.createReadStream(item.sourcePath),
          });
        }
      } else {
        if (!job.zipPath) throw new NotFoundException('ZIP file not found');
        const fullPath = path.resolve(this.exportDir, job.zipPath);
        if (!fs.existsSync(fullPath)) {
          throw new NotFoundException('ZIP file has expired or been deleted');
        }
        entries.push({
          name: this.uniqueZipEntryName(path.basename(fullPath), usedNames),
          stream: fs.createReadStream(fullPath),
        });
      }
    }

    if (entries.length === 0) {
      throw new BadRequestException('No downloadable files in the selected tasks');
    }

    const archiveName = `merged-${Date.now()}`;
    const zipPath = await this.archiveWriter.createArchive(
      entries,
      this.exportDir,
      archiveName,
      1
    );
    this.logger.log(
      `Merged ZIP created: ${zipPath} (${entries.length} entries from ${uniqueTaskIds.length} tasks)`
    );
    return zipPath;
  }

  /** 合并 zip 内条目名去重：同名时追加「 (n)」后缀，避免相互覆盖 */
  private uniqueZipEntryName(name: string, used: Set<string>): string {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    let candidate = `${base} (${i})${ext}`;
    while (used.has(candidate)) {
      i += 1;
      candidate = `${base} (${i})${ext}`;
    }
    used.add(candidate);
    return candidate;
  }

  async getFolderFilesRecursive(
    nodeId: string,
    userId: string
  ): Promise<{
    nodeId: string;
    fileName: string;
    isFolder: boolean;
    children?: any[];
  }> {
    return this.folderExpander.getFolderFilesRecursive(nodeId, userId);
  }

  async getUserTasks(
    userId: string,
    opts?: { page?: number; pageSize?: number }
  ): Promise<BatchDownloadTaskPage> {
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 20, 50);
    const jobs = await this.prisma.batchDownloadJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    const hasMore = jobs.length > pageSize;
    const tasks = jobs.slice(0, pageSize).map((job) => ({
      taskId: job.id,
      status: job.status,
      mode: (job.mode === 'individual' ? 'individual' : 'zip') as
        'individual' | 'zip',
      totalCount: job.totalCount,
      completedCount: job.completedCount,
      errorCount: job.errorCount,
      errors: (job.errors as any) || undefined,
      zipPath: job.zipPath || undefined,
      zipSize: job.zipSize || undefined,
      itemNames: this.deriveItemNames(job),
    }));
    return { tasks, hasMore };
  }

  /**
   * 是否含导出下载方向格式（dwg/dxf/pdf，非 mxweb/original）。
   * 纯 mxweb/original 下载走 orchestrator 的 tryAddOriginal（不转换、不受会员门控），
   * 仅当任一 item 请求非 mxweb/original 格式时才触发导出下载会员门控。
   */
  private hasExportFormat(fileList: BatchFileItem[]): boolean {
    return fileList.some((item) =>
      item.formats.some((f) => f !== 'mxweb' && f !== 'original')
    );
  }

  /**
   * individual 模式从持久化 fileList 派生 index → 下载文件名，与前端
   * useBatchDownload.createIndividualTask 的展开顺序规则一致
   * （nameWithoutExt + '.' + formats[0]，逐 item）。
   * zip 模式或 fileList 缺失时返回 undefined。
   */
  private deriveItemNames(
    job: { mode: string; fileList: unknown } | null
  ): string[] | undefined {
    if (!job || job.mode !== 'individual' || !job.fileList) return undefined;
    const fileList = job.fileList as Array<{
      fileName?: string;
      formats?: string[];
    }>;
    return fileList.map((item) => {
      const nameWithoutExt = (item.fileName || '').replace(/\.[^.]+$/, '');
      const format = item.formats?.[0] || 'mxweb';
      return `${nameWithoutExt}.${format}`;
    });
  }

  async getProgressForSse(taskId: string, res: any, req: any): Promise<void> {
    await this.sseManager.streamProgress(taskId, res, req, (userId: string) =>
      this.getProgress(taskId, userId)
    );
  }

  private async getLibraryRootId(
    libraryType: 'drawing' | 'block'
  ): Promise<string> {
    const nodeType =
      libraryType === 'drawing'
        ? NodeType.LIBRARY_DRAWING
        : NodeType.LIBRARY_BLOCK;
    const root = await this.prisma.fileSystemNode.findFirst({
      where: { nodeType, deletedAt: null },
      select: { id: true },
    });
    if (!root) {
      throw new NotFoundException(`Public library not found: ${libraryType}`);
    }
    return root.id;
  }
}
