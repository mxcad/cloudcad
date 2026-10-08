import { ForbiddenException, Injectable, Inject, Logger } from '@nestjs/common';
import { IStorageProvider } from '../../storage/interfaces/storage-provider.interface';
import { DatabaseService } from '../../database/database.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

@Injectable()
export class CrossNodeDownloadService {
  private readonly logger = new Logger(CrossNodeDownloadService.name);

  constructor(
    @Inject(IStorageProvider)
    private readonly storageProvider: IStorageProvider,
    private readonly prisma: DatabaseService,
    private readonly fileSystemPermissionService: FileSystemPermissionService
  ) {}

  async createBatchZip(
    nodeIds: string[],
    userId: string
  ): Promise<{ stream: PassThrough; filename: string }> {
    const archive = archiver.create('zip', { zlib: { level: 1 } });
    const stream = new PassThrough();

    archive.pipe(stream);

    for (const nodeId of nodeIds) {
      try {
        const node = await this.prisma.fileSystemNode.findUnique({
          where: { id: nodeId, deletedAt: null },
        });
        if (!node || !node.path) {
          this.logger.warn(`Skipping node ${nodeId}: not found or no path`);
          continue;
        }

        // 节点级访问校验（IDOR 防线）：统一走 assertNodeAccess（与单文件下载同口径，
        // fail-closed，库/个人空间/项目上下文由其内部判定）
        await this.fileSystemPermissionService.assertNodeAccess(
          userId,
          node.id,
          ProjectPermission.FILE_DOWNLOAD
        );

        const fileStream = await this.storageProvider.read(node.path);
        archive.append(fileStream, { name: node.name });
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw error;
        }
        this.logger.warn(
          `Failed to add node ${nodeId} to batch zip: ${error.message}`
        );
        archive.append(Buffer.from(`Error: ${error.message}`), {
          name: `errors/${nodeId}.txt`,
        });
      }
    }

    archive.finalize();

    const filename = `batch-${Date.now()}.zip`;
    return { stream, filename };
  }
}
