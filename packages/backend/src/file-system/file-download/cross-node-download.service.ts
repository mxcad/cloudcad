import { ForbiddenException, Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeType } from '@cloudcad/db';
import { IStorageProvider } from '../../storage/interfaces/storage-provider.interface';
import { DatabaseService } from '../../database/database.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import {
  IPROJECT_PERMISSION_SERVICE,
  IProjectPermissionService,
} from '../../roles/interfaces/project-permission-service.interface';
import { I18nContext } from 'nestjs-i18n';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

@Injectable()
export class CrossNodeDownloadService {
  private readonly logger = new Logger(CrossNodeDownloadService.name);

  constructor(
    @Inject(IStorageProvider)
    private readonly storageProvider: IStorageProvider,
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    @Inject(IPROJECT_PERMISSION_SERVICE)
    private readonly projectPermissionService: IProjectPermissionService
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

        await this.assertDownloadPermission(node, userId);

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

  private async assertDownloadPermission(
    node: { id: string; nodeType: NodeType; projectId: string | null },
    userId: string
  ): Promise<void> {
    const targetProjectId =
      node.nodeType === NodeType.PROJECT ? node.id : node.projectId;
    if (!targetProjectId) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.file.batch_download_project_unknown') ?? `无法确定节点 ${node.id} 所属项目`,
      );
    }
    const isOwner = await this.projectPermissionService.isProjectOwner(
      userId,
      targetProjectId
    );
    if (isOwner) {
      return;
    }
    const hasPermission = await this.projectPermissionService.checkPermission(
      userId,
      targetProjectId,
      ProjectPermission.FILE_DOWNLOAD
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ?? '您没有权限执行此操作',
      );
    }
  }
}
