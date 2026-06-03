import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShareDto } from './dto';

@Injectable()
export class CooperateService {
  private readonly logger = new Logger(CooperateService.name);

  constructor(private readonly prisma: DatabaseService) {}

  async createShare(dto: CreateShareDto, userId: string) {
    const { fileId, expiresIn } = dto;

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
        },
      });
    });

    this.logger.log(
      `创建协同分享: fileId=${fileId}, token=${share.token}, userId=${userId}`
    );

    return {
      token: share.token,
      url: `/share/${share.token}`,
      expiresAt: share.expiresAt,
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

    return { fileId: share.fileId };
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

    this.logger.log(`撤销协同分享: token=${token}, userId=${userId}`);
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
}
