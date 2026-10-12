import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { CreateShareDto, UpdateShareDto } from './dto';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-system/file-permission/file-system-permission.service';

import { I18nContext } from 'nestjs-i18n';
@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileSystemPermissionService: FileSystemPermissionService,
    private readonly auditLogService: AuditLogService,
    private readonly storageManager: StorageManager,
  ) {}

  async createShare(dto: CreateShareDto, userId: string) {
    const { fileId, expiresIn } = dto;

    const fileNode = await this.prisma.fileSystemNode.findFirst({
      where: { id: fileId, deletedAt: null },
      // 仅审计/URL 需要 projectId+name；授权判定已委托 assertNodeAccess（内部自取节点）
      select: { id: true, projectId: true, name: true },
    });
    if (!fileNode) {
      throw new BadRequestException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
    }

    await this.checkSharePermission(userId, fileId);

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

    // #207 阶段 2：文件公开分享埋点（FILE_SHARE，带项目维度 + 名称快照）
    await this.auditLogService.log({
      action: AuditAction.FILE_SHARE,
      resourceType: ResourceType.FILE,
      resourceId: fileId,
      userId,
      success: true,
      projectId: fileNode.projectId ?? undefined,
      resourceName: fileNode.name,
      params: {
        fileName: fileNode.name,
        shareToken: share.token,
        expiresAt: share.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      token: share.token,
      url: `/cad-editor/${dto.fileId}?shareToken=${share.token}&fileName=${encodeURIComponent(fileNode.name)}`,
      expiresAt: share.expiresAt,
    };
  }

  private async checkSharePermission(
    userId: string,
    fileId: string,
  ): Promise<void> {
    // 节点级分享授权统一委托 assertNodeAccess（服务层节点访问断言唯一出口，按 TreeWalker
    // 解析的根类型判定，fail-closed）。旧实现按节点自身 nodeType 走四段梯子：库内子文件
    // nodeType=FILE 但根为 LIBRARY_*，会漏判库两段、只剩 ownerId 段 → 另存进库的普通成员
    // 绕过 LIBRARY_*_MANAGE、库管理员分享他人图纸反被 403（唯一授权绕过，第三次复发）。
    // 与批量下载/跨节点下载/文件夹展开同口径。
    await this.fileSystemPermissionService.assertNodeAccess(
      userId,
      fileId,
      ProjectPermission.FILE_SHARE,
    );
  }

  /**
   * 分享令牌可用性校验（resolveShare / resolveShareNode / validateShareFileAccess
   * 三处共用）：token 存在 → 未撤销 → 未过期，返回 share 行。
   * 节点存活判定各调用方按自身语义处理——resolveShareNode 需感知已删节点以回吐
   * deletedAt（供调用方提示「文件已被删除」），故节点过滤不在此处。
   */
  private async assertShareUsable(token: string) {
    const share = await this.prisma.fileShare.findUnique({ where: { token } });
    if (!share) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.not_found') ?? '分享链接不存在');
    }
    if (share.deletedAt) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.revoked') ?? '分享链接已撤销');
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.expired') ?? '分享链接已过期');
    }
    return share;
  }

  /** 分享属主校验（revokeShare / updateShare 共用），errorKey/fallback 区分撤销与修改文案。 */
  private assertShareOwner(
    share: { createdBy: string },
    userId: string,
    errorKey: 'error.share.only_creator_can_revoke' | 'error.share.only_creator_can_modify',
    fallback: string,
  ): void {
    if (share.createdBy !== userId) {
      throw new ForbiddenException(I18nContext.current()?.t(errorKey) ?? fallback);
    }
  }

  async resolveShare(token: string) {
    const share = await this.assertShareUsable(token);

    const fileNode = await this.prisma.fileSystemNode.findFirst({
      where: { id: share.fileId, deletedAt: null },
      select: { id: true },
    });
    if (!fileNode) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.file_not_found') ?? '分享的文件不存在');
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
      throw new NotFoundException(I18nContext.current()?.t('error.share.not_found') ?? '分享链接不存在');
    }

    this.assertShareOwner(share, userId, 'error.share.only_creator_can_revoke', '只有创建者可以撤销分享');

    if (share.deletedAt) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.revoked') ?? '分享链接已撤销');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`撤销分享: token=${token}, userId=${userId}`);

    // 撤销分享审计（FILE_SHARE + shareAction=revoke）：仅项目内节点记录（统一入口
    // logProjectNodeAction 内部判断 projectId，查询/写库失败不阻塞主流程）
    await this.auditLogService.logProjectNodeAction(
      AuditAction.FILE_SHARE,
      share.fileId,
      userId,
      { shareAction: 'revoke', shareToken: token },
    );
  }

  async resolveShareNode(token: string) {
    const share = await this.assertShareUsable(token);

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
      throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
    }

    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { usedCount: { increment: 1 } },
    });

    // 已入回收站的节点：回吐 deletedAt 供调用方提示「文件已被删除」（移动端
    // useFileLoader 先判 deletedAt 再判 fileHash，依赖此 200 而非 404），但不再
    // 泄漏存储定位字段 path/fileHash——与 resolveShare/validateShareFileAccess 的
    // 「已删节点不可用」口径对齐，避免同一 token 对已删文件在兄弟端点 404、此处却回吐路径。
    const isDeleted = !!fileNode.deletedAt;
    return {
      name: fileNode.name,
      fileHash: isDeleted ? null : fileNode.fileHash,
      path: isDeleted ? null : fileNode.path,
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
    status?: 'active' | 'expired';
    sortBy?: 'createdAt' | 'expiresAt' | 'usedCount';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.FileShareWhereInput = {
      createdBy: userId,
      deletedAt: null,
    };

    if (query.fileId) {
      where.fileId = query.fileId;
    }

    if (query.search) {
      const matchingFiles = await this.prisma.fileSystemNode.findMany({
        where: {
          name: { contains: query.search, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true },
      });
      where.fileId = { in: matchingFiles.map((f) => f.id) };
    }

    // 状态筛选下推到 DB（与 ip-blacklist/ip-whitelist 的「未过期」判据同款）：
    // active = 永不过期（expiresAt 为 null）或未到期；expired = 已过期。
    // 必须下推：否则 total 是未过滤总数，客户端按过滤后列表翻页会出现「还能加载但已无有效项」。
    // 未声明全局 ValidationPipe 的枚举转换，未知值按「全部」处理而非当作筛选。
    if (query.status === 'active' || query.status === 'expired') {
      const now = new Date();
      where.OR =
        query.status === 'expired'
          ? [{ expiresAt: { lte: now } }]
          : [{ expiresAt: null }, { expiresAt: { gt: now } }];
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

    const items = shares.map((share) => {
      const shareFileName = fileNameMap.get(share.fileId) ?? '';
      return {
        id: share.id,
        token: share.token,
        url: `/cad-editor/${share.fileId}?shareToken=${share.token}${shareFileName ? `&fileName=${encodeURIComponent(shareFileName)}` : ''}`,
        fileId: share.fileId,
        fileName: shareFileName || '未知文件',
        expiresAt: share.expiresAt?.toISOString() ?? null,
        usedCount: share.usedCount,
        createdAt: share.createdAt.toISOString(),
      };
    });

    return { items, total, page, pageSize };
  }

  async getFileShares(fileId: string, userId: string) {
    const fileNode = await this.prisma.fileSystemNode.findFirst({
      where: { id: fileId, deletedAt: null },
      // 仅 URL/fileName 需要 name；授权判定已委托 assertNodeAccess（内部自取节点）
      select: { id: true, name: true },
    });
    if (!fileNode) {
      throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
    }

    await this.checkSharePermission(userId, fileId);

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
      url: `/cad-editor/${share.fileId}?shareToken=${share.token}&fileName=${encodeURIComponent(fileNode.name)}`,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      createdAt: share.createdAt.toISOString(),
      createdBy: share.createdBy,
      fileName: fileNode.name,
    }));
  }

  /**
   * 验证分享令牌是否有权访问指定的存储路径
   * @param token 分享令牌
   * @param storagePath 请求的文件存储路径（如 202506/nodeId/filename.dwg）
   */
  async validateShareFileAccess(token: string, storagePath: string): Promise<void> {
    const share = await this.assertShareUsable(token);

    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: share.fileId },
      select: { id: true, path: true, deletedAt: true },
    });

    if (!fileNode) {
      throw new NotFoundException(I18nContext.current()?.t('error.file.not_found') ?? '文件不存在');
    }

    if (fileNode.deletedAt) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.file_deleted') ?? '文件已被删除');
    }

    if (fileNode.path !== storagePath) {
      // 外部参照文件（如 A1.dwg.mxweb）不是分享的主文件，而是主文件的关联文件
      // 只要 shareToken 有效，且请求的文件与主文件在同一 nodeId 目录下，就允许访问。
      // 路径比较收口 StorageManager.isSameNodeStoragePath（带尾部 / 比较，防同月前缀
      // 兄弟目录 YYYYMM/<nodeId>-evil/… 被误判为同节点；storagePath 来自 URL 路径参数，攻击者可控）
      if (!this.storageManager.isSameNodeStoragePath(storagePath, fileNode.path)) {
        this.logger.warn(
          `分享令牌路径不匹配: token=${token}, expected=${fileNode.path}, requested=${storagePath}`
        );
        throw new ForbiddenException(I18nContext.current()?.t('error.share.token_mismatch') ?? '分享令牌与请求的文件不匹配');
      }
    }
  }

  async updateShare(token: string, userId: string, dto: UpdateShareDto) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
    });

    if (!share) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.not_found') ?? '分享链接不存在');
    }

    this.assertShareOwner(share, userId, 'error.share.only_creator_can_modify', '只有创建者可以修改分享设置');

    if (share.deletedAt) {
      throw new NotFoundException(I18nContext.current()?.t('error.share.revoked') ?? '分享链接已撤销');
    }

    const data: Prisma.FileShareUpdateInput = {};
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt === null ? null : new Date(dto.expiresAt);
    }

    const updated = await this.prisma.fileShare.update({
      where: { id: share.id },
      data,
    });

    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: share.fileId },
      select: { name: true },
    });

    this.logger.log(
      `更新分享: token=${token}, userId=${userId}`
    );

    return {
      token: updated.token,
      url: `/cad-editor/${share.fileId}?shareToken=${updated.token}&fileName=${encodeURIComponent(fileNode?.name ?? '')}`,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
  }
}
