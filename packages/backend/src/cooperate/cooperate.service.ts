import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShareDto, UpdateShareDto } from './dto';

@Injectable()
export class CooperateService {
  private readonly logger = new Logger(CooperateService.name);

  constructor(private readonly prisma: DatabaseService) {}

  async createShare(dto: CreateShareDto, userId: string) {
    const { fileId, expiresIn, collaborationEnabled } = dto;

    let expiresAt: Date | null = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    const share = await this.prisma.$transaction(async (tx) => {
      const fileNode = await tx.fileSystemNode.findFirst({
        where: { id: fileId, deletedAt: null },
        select: { id: true },
      });
      if (!fileNode) {
        throw new BadRequestException('文件不存在');
      }

      return tx.cooperateShare.create({
        data: {
          fileId,
          createdBy: userId,
          expiresAt,
          collaborationEnabled: collaborationEnabled ?? false,
        },
      });
    });

    this.logger.log(
      `创建分享: fileId=${fileId}, token=${share.token}, userId=${userId}, collaborationEnabled=${share.collaborationEnabled}`
    );

    return {
      token: share.token,
      url: `/share/${share.token}`,
      expiresAt: share.expiresAt,
      collaborationEnabled: share.collaborationEnabled,
    };
  }

  async resolveShare(token: string) {
    const share = await this.prisma.cooperateShare.findUnique({
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

    await this.prisma.cooperateShare.update({
      where: { id: share.id },
      data: { usedCount: { increment: 1 } },
    });

    return {
      fileId: share.fileId,
      collaborationEnabled: share.collaborationEnabled,
    };
  }

  async revokeShare(token: string, userId: string) {
    const share = await this.prisma.cooperateShare.findUnique({
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

    await this.prisma.cooperateShare.update({
      where: { id: share.id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`撤销分享: token=${token}, userId=${userId}`);
  }

  async resolveShareNode(token: string) {
    const share = await this.prisma.cooperateShare.findUnique({
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

    await this.prisma.cooperateShare.update({
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
      collaborationEnabled: share.collaborationEnabled,
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
      this.prisma.cooperateShare.count({ where }),
      this.prisma.cooperateShare.findMany({
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
      collaborationEnabled: share.collaborationEnabled,
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

  async updateShare(token: string, userId: string, dto: UpdateShareDto) {
    const share = await this.prisma.cooperateShare.findUnique({
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
    if (dto.collaborationEnabled !== undefined) {
      data.collaborationEnabled = dto.collaborationEnabled;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt === null ? null : new Date(dto.expiresAt);
    }

    const updated = await this.prisma.cooperateShare.update({
      where: { id: share.id },
      data,
    });

    this.logger.log(
      `更新分享: token=${token}, userId=${userId}, collaborationEnabled=${updated.collaborationEnabled}`
    );

    return {
      token: updated.token,
      url: `/share/${updated.token}`,
      collaborationEnabled: updated.collaborationEnabled,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
  }
}
