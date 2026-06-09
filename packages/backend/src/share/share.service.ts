import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { PermissionService } from '../common/services/permission.service';
import { SystemPermission, ProjectPermission } from '../common/enums/permissions.enum';
import { CreateShareDto, UpdateShareDto } from './dto';

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly projectPermissionService: ProjectPermissionService,
    private readonly systemPermissionService: PermissionService,
  ) {}

  async createShare(dto: CreateShareDto, userId: string) {
    const { fileId, expiresIn } = dto;

    const fileNode = await this.prisma.fileSystemNode.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, projectId: true, ownerId: true, libraryKey: true },
    });
    if (!fileNode) {
      throw new BadRequestException('文件不存在');
    }

    await this.checkSharePermission(userId, fileNode);

    let expiresAt: Date | null = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    const share = await this.prisma.$transaction(async (tx) => {
      return tx.fileShare.create({
        data: {
          fileId,
          createdBy: userId,
          expiresAt,
        },
      });
    });

    this.logger.log(
      `创建分享: fileId=${fileId}, token=${share.token}, userId=${userId}`
    );

    return {
      token: share.token,
      url: `/share/${share.token}`,
      expiresAt: share.expiresAt,
    };
  }

  private async checkSharePermission(
    userId: string,
    fileNode: { id: string; projectId: string | null; ownerId: string; libraryKey: string | null },
  ): Promise<void> {
    if (fileNode.libraryKey === 'drawing') {
      const hasPerm = await this.systemPermissionService.checkSystemPermission(
        userId,
        SystemPermission.LIBRARY_DRAWING_MANAGE,
      );
      if (!hasPerm) {
        throw new ForbiddenException('没有资源库图纸的分享权限');
      }
      return;
    }

    if (fileNode.libraryKey === 'block') {
      const hasPerm = await this.systemPermissionService.checkSystemPermission(
        userId,
        SystemPermission.LIBRARY_BLOCK_MANAGE,
      );
      if (!hasPerm) {
        throw new ForbiddenException('没有资源库图块的分享权限');
      }
      return;
    }

    if (fileNode.projectId) {
      const isOwner = await this.projectPermissionService.isProjectOwner(
        userId,
        fileNode.projectId,
      );
      if (isOwner) {
        return;
      }

      const hasPerm = await this.projectPermissionService.checkPermission(
        userId,
        fileNode.projectId,
        ProjectPermission.FILE_SHARE,
      );
      if (!hasPerm) {
        throw new ForbiddenException('没有文件分享权限');
      }
      return;
    }

    if (fileNode.ownerId !== userId) {
      throw new ForbiddenException('只有文件所有者可以分享');
    }
  }

  async resolveShare(token: string) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在');
    }

    if (share.deletedAt) {
      throw new NotFoundException('分享链接已撤销');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('分享链接已过期');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { usedCount: { increment: 1 } },
    });

    return {
      fileId: share.fileId,
    };
  }

  async revokeShare(token: string, userId: string) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在');
    }

    if (share.createdBy !== userId) {
      throw new ForbiddenException('只有创建者可以撤销分享');
    }

    if (share.deletedAt) {
      throw new NotFoundException('分享链接已撤销');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`撤销分享: token=${token}, userId=${userId}`);
  }

  async resolveShareNode(token: string) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在');
    }

    if (share.deletedAt) {
      throw new NotFoundException('分享链接已撤销');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('分享链接已过期');
    }

    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: share.fileId },
      select: {
        id: true,
        name: true,
        fileHash: true,
        path: true,
        parentId: true,
        deletedAt: true,
        updatedAt: true,
      },
    });

    if (!fileNode) {
      throw new NotFoundException('文件不存在');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { usedCount: { increment: 1 } },
    });

    return {
      name: fileNode.name,
      fileHash: fileNode.fileHash,
      path: fileNode.path,
      parentId: fileNode.parentId,
      id: fileNode.id,
      deletedAt: fileNode.deletedAt?.toISOString() ?? null,
      updatedAt: fileNode.updatedAt.toISOString(),
    };
  }

  async listShares(userId: string, query: {
    page?: number;
    pageSize?: number;
    fileId?: string;
    search?: string;
    sortBy?: 'createdAt' | 'expiresAt' | 'usedCount';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: any = {
      createdBy: userId,
      deletedAt: null,
    };

    if (query.fileId) {
      where.fileId = query.fileId;
    }

    const [total, shares] = await Promise.all([
      this.prisma.fileShare.count({ where }),
      this.prisma.fileShare.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const fileIds = [...new Set(shares.map((s) => s.fileId))];
    const fileNodes = await this.prisma.fileSystemNode.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, name: true },
    });
    const fileNameMap = new Map(fileNodes.map((n) => [n.id, n.name]));

    let items = shares.map((share) => ({
      id: share.id,
      token: share.token,
      url: `/share/${share.token}`,
      fileId: share.fileId,
      fileName: fileNameMap.get(share.fileId) ?? '未知文件',
      expiresAt: share.expiresAt?.toISOString() ?? null,
      usedCount: share.usedCount,
      createdAt: share.createdAt.toISOString(),
    }));

    if (query.search) {
      const keyword = query.search.toLowerCase();
      items = items.filter((item) => item.fileName.toLowerCase().includes(keyword));
    }

    return { items, total, page, pageSize };
  }

  async getFileShares(fileId: string, userId: string) {
    const fileNode = await this.prisma.fileSystemNode.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, projectId: true, ownerId: true, libraryKey: true },
    });
    if (!fileNode) {
      throw new NotFoundException('文件不存在');
    }

    await this.checkSharePermission(userId, fileNode);

    const shares = await this.prisma.fileShare.findMany({
      where: {
        fileId,
        deletedAt: null,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares.map((share) => ({
      token: share.token,
      url: `/share/${share.token}`,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      createdAt: share.createdAt.toISOString(),
      createdBy: share.createdBy,
    }));
  }

  /**
   * 验证分享令牌是否有权访问指定的存储路径
   * @param token 分享令牌
   * @param storagePath 请求的文件存储路径（如 202506/nodeId/filename.dwg）
   */
  async validateShareFileAccess(token: string, storagePath: string): Promise<void> {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在');
    }

    if (share.deletedAt) {
      throw new NotFoundException('分享链接已撤销');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('分享链接已过期');
    }

    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: share.fileId },
      select: { id: true, path: true, deletedAt: true },
    });

    if (!fileNode) {
      throw new NotFoundException('文件不存在');
    }

    if (fileNode.deletedAt) {
      throw new NotFoundException('文件已被删除');
    }

    if (fileNode.path !== storagePath) {
      this.logger.warn(
        `分享令牌路径不匹配: token=${token}, expected=${fileNode.path}, requested=${storagePath}`
      );
      throw new ForbiddenException('分享令牌与请求的文件不匹配');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  async updateShare(token: string, userId: string, dto: UpdateShareDto) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在');
    }

    if (share.createdBy !== userId) {
      throw new ForbiddenException('只有创建者可以修改分享设置');
    }

    if (share.deletedAt) {
      throw new NotFoundException('分享链接已撤销');
    }

    const data: any = {};
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt === null ? null : new Date(dto.expiresAt);
    }

    const updated = await this.prisma.fileShare.update({
      where: { id: share.id },
      data,
    });

    this.logger.log(
      `更新分享: token=${token}, userId=${userId}`
    );

    return {
      token: updated.token,
      url: `/share/${updated.token}`,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
  }
}
