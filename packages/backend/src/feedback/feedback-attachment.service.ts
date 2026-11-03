///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 附件服务（ADR-0085）
//
// 两种形态：
//  - FILE：上传的图片/文档/图纸副本
//  - REFERENCE：引用图纸（项目/个人空间/当前 hash），统一转真实附件副本（同样落
//    attachmentRoot()，带 downloadUrl）——fileHash 不稳定，不能只存引用
// 物理文件内容寻址：storagePath = attachmentRoot()/{contentHash[:2]}/{contentHash}
//  （无扩展名；原始文件名/类型存记录），相同内容跨用户/匿名共享一份（去重，见 storeContent）；
//  记录层仍独立（归属/绑定/删除互不影响）。附件根刻意不落 FILES_DATA_PATH（SVN 工作副本）。
// 图纸类附件复用现有 mxcad 图纸上传通道（分片/秒传去重/转换缓存）——本服务只负责
// 注册（copy 副本 / reference 引用）与附件资源管理，不重造大文件通道。
// 下载鉴权：登录（提交者/上传者）/ 管理员（权限守卫）/ 匿名（短期签名 token，code 上下文）。
///////////////////////////////////////////////////////////////////////////////

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'path';
import {
  FeedbackAttachmentKind as PrismaAttachmentKind,
  FeedbackAttachmentType as PrismaAttachmentType,
  Prisma,
} from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { PublicFileService } from '../public-file/public-file.service';
import { Audit } from '../common/decorators/audit.decorator';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { FileUtils } from '../common/utils/file-utils';
import {
  FEEDBACK_DOCUMENT_MIME_TYPES,
  FEEDBACK_DRAWING_EXTENSIONS,
  FEEDBACK_IMAGE_MIME_TYPES,
  hashAnonToken,
  isImageMagicValid,
} from './feedback.constants';
import {
  FeedbackAttachmentKind,
  FeedbackAttachmentType,
} from './feedback.enums';
import { RegisterDrawingAttachmentDto } from './dto/feedback.dto';
import { FeedbackAttachmentDto } from './dto/feedback-response.dto';
import { SystemPermission } from '../common/enums/permissions.enum';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { ThumbnailGenerationService } from '../mxcad/infra/thumbnail-generation.service';
import { decodeMojibakeFileName } from '../fonts/mojibake.utils';

const t = (key: string, fallback: string): string =>
  (I18nContext.current()?.t(key) as string | undefined) ?? fallback;

/** 下载签名 token 有效期（秒） */
const DOWNLOAD_TOKEN_TTL_SEC = 600;

/** 附件上传上下文 */
export interface AttachmentContext {
  userId?: string;
  anonToken?: string;
  ip?: string;
}

/** 附件行（投影用） */
export type AttachmentRow = {
  id: string;
  feedbackId: string | null;
  type: PrismaAttachmentType;
  kind: PrismaAttachmentKind;
  storagePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  nodeId: string | null;
  fileHash: string | null;
  contentHash: string | null;
  region: string | null;
  thumbnailPath: string | null;
  uploadedById: string | null;
  uploaderTokenHash: string | null;
  ip: string | null;
  createdAt: Date;
  uploadedBy?: { username: string } | null;
  feedback?: { feedbackCode: string; submitterId: string | null } | null;
};

@Injectable()
export class FeedbackAttachmentService {
  private readonly logger = new Logger(FeedbackAttachmentService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly configService: ConfigService,
    private readonly publicFileService: PublicFileService,
    @Inject(IPERMISSION_SERVICE)
    private readonly permissionService: IPermissionService,
    private readonly thumbnailService: ThumbnailGenerationService
  ) {}

  // ─────────────────────────────────────────────
  // 上传图片/文档（multipart，diskStorage 临时落盘）
  // ─────────────────────────────────────────────

  @Audit(AuditAction.FEEDBACK_ATTACHMENT_UPLOAD, ResourceType.FEEDBACK, {
    resourceId: (result) => (result as FeedbackAttachmentDto)?.id,
    userId: (_result, args) => (args[1] as AttachmentContext)?.userId,
    details: (_result, args) => {
      const file = args[0] as Express.Multer.File;
      return { fileName: file?.originalname, size: file?.size, mimeType: file?.mimetype };
    },
  })
  async uploadFile(
    file: Express.Multer.File,
    ctx: AttachmentContext
  ): Promise<FeedbackAttachmentDto> {
    if (!file) {
      throw new BadRequestException(t('error.feedback.attachment_missing', '请选择要上传的文件'));
    }
    // 防御性修复：个别客户端/代理不遵循 defParamCharset:'utf8' 时 originalname 仍可能乱码
    // （fonts 同款防御，见 fonts.service.ts）。就地重写保证 detectType/落盘/审计全用正确名。
    file.originalname = decodeMojibakeFileName(file.originalname || '');
    const mime = file.mimetype || '';
    const type = this.detectType(mime, file.originalname || '');
    if (!type) {
      throw new BadRequestException(
        t('error.feedback.attachment_type_unsupported', '不支持的附件类型')
      );
    }

    const maxBytes = await this.getMaxSizeBytes(type);
    if (file.size > maxBytes) {
      throw new BadRequestException(
        t(
          'error.feedback.attachment_too_large',
          `附件大小超过上限（${Math.floor(maxBytes / 1024 / 1024)}MB）`
        )
      );
    }

    // 图片魔数校验（mimetype 可伪造，防伪造扩展名）；顺带算 MD5（buf 已整读，不二次读）
    let contentHash: string;
    if (type === FeedbackAttachmentType.IMAGE) {
      const buf = await fs.readFile(file.path);
      if (!isImageMagicValid(buf, mime)) {
        await this.unlinkQuiet(file.path);
        throw new BadRequestException(
          t('error.feedback.attachment_invalid_image', '图片文件无效，请重新上传')
        );
      }
      contentHash = this.hashBuffer(buf);
    } else {
      // 文档/图纸：stream 算 MD5（大文件不整读，避免内存峰值）
      contentHash = await this.hashFileStream(file.path);
    }

    // 内容寻址存储（同内容命中已有物理文件 → 跳过拷贝，deduped=true；记录仍独立建行）
    const { relativePath, deduped } = await this.storeContent(file.path, contentHash);
    await this.unlinkQuiet(file.path); // multipart 临时文件用完即清（无论是否去重）
    const fileName = this.sanitizeName(file.originalname, `att_${contentHash.slice(0, 8)}`);
    // 上传图纸：后端用 MxWebDwg2Jpg.exe 生成缩略图（仅 Windows + dwg/dxf；mxweb/失败回落无缩略图）
    let thumbnailPath: string | null = null;
    if (type === FeedbackAttachmentType.DRAWING && this.isDwgRenderable(extname(fileName))) {
      thumbnailPath = await this.generateDrawingThumbnail(
        join(this.attachmentRoot(), relativePath)
      );
    }
    const att = await this.prisma.feedbackAttachment.create({
      data: {
        type: type as PrismaAttachmentType,
        kind: PrismaAttachmentKind.FILE,
        storagePath: relativePath,
        fileName,
        mimeType: mime,
        size: file.size,
        contentHash,
        thumbnailPath,
        uploadedById: ctx.userId ?? null,
        uploaderTokenHash: ctx.userId || !ctx.anonToken ? null : hashAnonToken(ctx.anonToken),
        ip: ctx.ip || null,
      },
    });
    const dto = this.toDto(att, { mode: 'none' });
    return deduped ? { ...dto, deduped: true } : dto;
  }

  // ─────────────────────────────────────────────
  // 注册图纸附件（copy 副本 / reference 引用）
  // ─────────────────────────────────────────────

  @Audit(AuditAction.FEEDBACK_ATTACHMENT_UPLOAD, ResourceType.FEEDBACK, {
    resourceId: (result) => (result as FeedbackAttachmentDto)?.id,
    userId: (_result, args) => (args[1] as AttachmentContext)?.userId,
    details: (_result, args) => {
      const dto = args[0] as RegisterDrawingAttachmentDto;
      return { nodeId: dto?.nodeId, kind: dto?.kind };
    },
  })
  /**
   * 注册图纸附件（统一转真实附件副本）。
   *
   * 源定位二选一：
   * - nodeId：FileSystemNode.id（登录空间/项目图纸）→ resolveNodeAbsPath
   * - fileHash：未登录 CAD 编辑器当前图纸（无 nodeId，内存导出内容寻址 uploads/）
   *   → PublicFileService.findMxwebFile
   *
   * 用户 Q4 拍板：所有图纸（copy/reference/hash 当前）都 copyToStorage 到附件存储区、
   * 带 downloadUrl——fileHash 不稳定，不能只存引用。缩略图由前端引擎内生成/指定区域后
   * 以 base64 thumbnailData 上传，落附件缩略图区（thumbnailPath）。
   */
  async registerDrawing(
    dto: RegisterDrawingAttachmentDto,
    ctx: AttachmentContext
  ): Promise<FeedbackAttachmentDto> {
    if (!dto.nodeId && !dto.fileHash) {
      throw new BadRequestException(
        t('error.feedback.attachment_drawing_missing', '缺少图纸标识')
      );
    }

    let srcAbs: string | null = null;
    let fileHash: string | null = null;
    let node: { id: string; name: string | null } | null = null;
    let targetName = dto.fileName || '';

    if (dto.nodeId) {
      const found = await this.prisma.fileSystemNode.findUnique({
        where: { id: dto.nodeId },
        select: { id: true, name: true, path: true, fileHash: true },
      });
      if (!found) {
        throw new NotFoundException(t('error.feedback.attachment_drawing_not_found', '图纸不存在'));
      }
      srcAbs = this.resolveNodeAbsPath(found.path);
      fileHash = found.fileHash ?? null;
      targetName = found.name || targetName;
      node = { id: found.id, name: found.name };
    } else if (dto.fileHash) {
      srcAbs = await this.publicFileService.findMxwebFile(dto.fileHash);
      fileHash = dto.fileHash;
    }

    if (!srcAbs) {
      throw new NotFoundException(t('error.feedback.attachment_file_missing', '图纸文件不存在'));
    }

    const ext = extname(targetName || '') || extname(srcAbs);
    if (!this.isDrawingExt(ext)) {
      throw new BadRequestException(
        t('error.feedback.attachment_type_unsupported', '不支持的图纸格式')
      );
    }

    // 内容寻址 hash：优先取图纸节点已有 fileHash（MD5，mxcad 通道口径），
    // 缺失（node 无 fileHash）才 stream 重算；相同内容命中已有物理文件 → 跳过拷贝
    let contentHash = fileHash;
    if (!contentHash) {
      contentHash = await this.hashFileStream(srcAbs);
    }
    const { relativePath, deduped } = await this.storeContent(srcAbs, contentHash);
    const size = await this.statSize(join(this.attachmentRoot(), relativePath));
    const fileName = this.sanitizeName(
      targetName || `drawing${ext}`,
      `drawing_${contentHash.slice(0, 8)}`
    );
    // REFERENCE 引用图纸不落缩略图（用户拍板：引用无缩略图，只有查看）；FILE 副本保留前端缩略图
    const thumbnailPath =
      dto.kind === 'reference'
        ? null
        : await this.persistThumbnail(dto.thumbnailData);

    const att = await this.prisma.feedbackAttachment.create({
      data: {
        type: PrismaAttachmentType.DRAWING,
        kind:
          dto.kind === 'reference'
            ? PrismaAttachmentKind.REFERENCE
            : PrismaAttachmentKind.FILE,
        nodeId: node?.id ?? null,
        fileHash,
        contentHash,
        storagePath: relativePath,
        fileName,
        mimeType: this.mimeForDrawing(ext),
        size,
        thumbnailPath,
        region: dto.region ?? null,
        uploadedById: ctx.userId ?? null,
        uploaderTokenHash: ctx.userId || !ctx.anonToken ? null : hashAnonToken(ctx.anonToken),
        ip: ctx.ip || null,
      },
    });
    const result = this.toDto(att, { mode: 'none' });
    return deduped ? { ...result, deduped: true } : result;
  }

  // ─────────────────────────────────────────────
  // 提交反馈时绑定归属（校验所有权 + 事务内设 feedbackId）
  // ─────────────────────────────────────────────

  /** 校验附件归属当前用户/匿名 token，返回可绑定附件（含类型，供数量上限校验 + 绑定）；已绑定跳过 */
  async assertOwned(
    attachmentIds: string[],
    ctx: AttachmentContext
  ): Promise<Array<{ id: string; type: FeedbackAttachmentType }>> {
    const valid: Array<{ id: string; type: FeedbackAttachmentType }> = [];
    for (const id of attachmentIds) {
      const att = await this.prisma.feedbackAttachment.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          feedbackId: true,
          uploadedById: true,
          uploaderTokenHash: true,
        },
      });
      if (!att) {
        throw new BadRequestException(t('error.feedback.attachment_not_found', '附件不存在'));
      }
      if (att.feedbackId) continue; // 已绑定，跳过（防重复绑定）
      const owned = ctx.userId
        ? att.uploadedById === ctx.userId
        : Boolean(ctx.anonToken && att.uploaderTokenHash === hashAnonToken(ctx.anonToken));
      if (!owned) {
        throw new ForbiddenException(
          t('error.feedback.attachment_not_owner', '附件不属于当前用户')
        );
      }
      valid.push({ id: att.id, type: att.type as FeedbackAttachmentType });
    }
    return valid;
  }

  /**
   * 校验附件数量上限（runtime config feedback.max*Count，后端最终防线）。
   * 语义与前端一致：最多可拥有「上限」个，最终数量 > 上限 即拒绝。
   */
  async assertCountLimits(
    owned: Array<{ id: string; type: FeedbackAttachmentType }>
  ): Promise<void> {
    if (!owned.length) return;
    const [maxTotal, maxImage, maxDrawing, maxDocument] = await Promise.all([
      this.runtimeConfig.getValue<number>('feedback.maxAttachmentCount'),
      this.runtimeConfig.getValue<number>('feedback.maxImageCount'),
      this.runtimeConfig.getValue<number>('feedback.maxDrawingCount'),
      this.runtimeConfig.getValue<number>('feedback.maxDocumentCount'),
    ]);
    const imageCount = owned.filter(
      (a) => a.type === FeedbackAttachmentType.IMAGE
    ).length;
    const drawingCount = owned.filter(
      (a) => a.type === FeedbackAttachmentType.DRAWING
    ).length;
    const documentCount = owned.filter(
      (a) => a.type === FeedbackAttachmentType.DOCUMENT
    ).length;
    if (owned.length > Math.max(1, maxTotal)) {
      throw new BadRequestException(
        t('error.feedback.attachment_total_exceeded', '附件总数超过上限')
      );
    }
    if (imageCount > Math.max(1, maxImage)) {
      throw new BadRequestException(
        t('error.feedback.attachment_image_exceeded', '图片附件数量超过上限')
      );
    }
    if (drawingCount > Math.max(1, maxDrawing)) {
      throw new BadRequestException(
        t('error.feedback.attachment_drawing_exceeded', '图纸附件数量超过上限')
      );
    }
    if (documentCount > Math.max(1, maxDocument)) {
      throw new BadRequestException(
        t('error.feedback.attachment_document_exceeded', '文档附件数量超过上限')
      );
    }
  }

  /** 事务内绑定附件到反馈（提交反馈的 $transaction 内调用） */
  async bindInTx(
    tx: Prisma.TransactionClient,
    ids: string[],
    feedbackId: string
  ): Promise<void> {
    if (!ids.length) return;
    await tx.feedbackAttachment.updateMany({
      where: { id: { in: ids }, feedbackId: null },
      data: { feedbackId },
    });
  }

  // ─────────────────────────────────────────────
  // 列表 / 下载 / 删除 / 清理
  // ─────────────────────────────────────────────

  /** 管理端附件资源管理页列表（按 type/kind/时间/关键词筛选） */
  async adminList(
    query: {
      page: number;
      pageSize: number;
      type?: string;
      kind?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
    },
    requesterId?: string
  ): Promise<{ items: FeedbackAttachmentDto[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.FeedbackAttachmentWhereInput = {};
    if (query.type) where.type = query.type as PrismaAttachmentType;
    if (query.kind) where.kind = query.kind as PrismaAttachmentKind;
    if (query.search) {
      where.OR = [
        { fileName: { contains: query.search, mode: 'insensitive' } },
        { feedback: { feedbackCode: { contains: query.search, mode: 'insensitive' } } },
        { uploadedBy: { username: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }
    const canManage = requesterId
      ? await this.permissionService.checkSystemPermission(
          requesterId,
          SystemPermission.SYSTEM_FEEDBACK_MANAGE
        )
      : false;
    const [total, rows] = await Promise.all([
      this.prisma.feedbackAttachment.count({ where }),
      this.prisma.feedbackAttachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        // feedback 关联必须取：toDto 依赖 row.feedback.feedbackCode 生成签名 viewUrl/缩略图
        // token，缺失时 withCode=false → 管理端所有附件 URL 全为 null（查看/下载按钮不渲染）
        include: {
          uploadedBy: { select: { username: true } },
          feedback: { select: { feedbackCode: true, submitterId: true } },
        },
      }),
    ]);
    return {
      items: rows.map((r) => this.toDto(r, { mode: 'admin', canManage })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 获取查看（鉴权后返回绝对路径，控制器内联下发）。
   * 权限模型：REFERENCE 仅管理员（READ）可查看；FILE 提交者（签名 token/归属）+ 管理员（READ）可查看。
   * 提交者不可下载（downloadUrl 恒 null，见 toDto）；此处只管「查看」。
   */
  async getDownload(
    id: string,
    ctx: { userId?: string; token?: string; code?: string }
  ): Promise<{ absPath: string; fileName: string | null; mimeType: string | null }> {
    const att = await this.prisma.feedbackAttachment.findUnique({
      where: { id },
      include: { feedback: { select: { feedbackCode: true, submitterId: true } } },
    });
    if (!att) {
      throw new NotFoundException(t('error.feedback.attachment_not_found', '附件不存在'));
    }
    await this.assertCanView(att, ctx);
    return this.resolveStorageFile(att);
  }

  /**
   * 获取缩略图（FILE 图纸预览；REFERENCE 无缩略图）。
   * 鉴权同查看（提交者/匿名签名 token/管理员 READ）。
   */
  async getThumbnail(
    id: string,
    ctx: { userId?: string; token?: string; code?: string }
  ): Promise<{ absPath: string; mimeType: string | null }> {
    const att = await this.prisma.feedbackAttachment.findUnique({
      where: { id },
      include: { feedback: { select: { feedbackCode: true, submitterId: true } } },
    });
    if (!att) {
      throw new NotFoundException(t('error.feedback.attachment_not_found', '附件不存在'));
    }
    if (att.kind === PrismaAttachmentKind.REFERENCE || !att.thumbnailPath) {
      throw new NotFoundException(t('error.feedback.attachment_file_missing', '附件缩略图不存在'));
    }
    await this.assertCanView(att, ctx);
    const absPath = FileUtils.resolveWithinRoot(this.attachmentRoot(), att.thumbnailPath);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) {
      throw new NotFoundException(t('error.feedback.attachment_file_missing', '附件缩略图不存在'));
    }
    return { absPath, mimeType: att.mimeType?.startsWith('image/') ? att.mimeType : 'image/jpeg' };
  }

  /** 管理端删除（REFERENCE 只删记录；FILE 删物理文件 + 缩略图 + 记录） */
  @Audit(AuditAction.FEEDBACK_ATTACHMENT_DELETE, ResourceType.FEEDBACK, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[1] as string,
    details: (_result, args) => args[2] as Record<string, unknown>,
  })
  async adminDelete(
    id: string,
    operatorId: string,
    detail?: Record<string, unknown>
  ): Promise<void> {
    const att = await this.prisma.feedbackAttachment.findUnique({ where: { id } });
    if (!att) {
      throw new NotFoundException(t('error.feedback.attachment_not_found', '附件不存在'));
    }
    // 内容寻址共享：物理文件可能被其他记录引用（同内容去重），仍有引用则不删物理文件
    if (att.storagePath) {
      const refs = await this.prisma.feedbackAttachment.count({
        where: { storagePath: att.storagePath, id: { not: att.id } },
      });
      if (refs === 0) {
        await this.unlinkQuiet(join(this.attachmentRoot(), att.storagePath.replace(/\\/g, '/')));
      }
    }
    if (att.thumbnailPath) {
      await this.unlinkQuiet(join(this.attachmentRoot(), att.thumbnailPath.replace(/\\/g, '/')));
    }
    await this.prisma.feedbackAttachment.delete({ where: { id } });
    this.logger.log(`附件已删除：${id}，操作者=${operatorId}`);
  }

  /**
   * 管理端批量删除（复用 adminDelete 逐条执行，每条留审计）。
   *
   * 不存在的 ID 不抛错、记入 notFoundIds；返回实际删除数与未找到 ID，
   * 供前端提示「部分附件不存在」。单条物理文件删除失败会向上抛错（与单删一致）。
   */
  async adminDeleteMany(
    ids: string[],
    operatorId: string
  ): Promise<{ deleted: number; notFoundIds: string[] }> {
    // DTO 层已拦空数组，此处防御性短路避免空 in 查询
    if (ids.length === 0) return { deleted: 0, notFoundIds: [] };
    const existing = await this.prisma.feedbackAttachment.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, kind: true },
    });
    const existingById = new Map(existing.map((a) => [a.id, a]));
    const notFoundIds = ids.filter((id) => !existingById.has(id));

    let deleted = 0;
    for (const id of ids) {
      const att = existingById.get(id);
      if (!att) continue;
      // 复用 adminDelete：REFERENCE 只删记录，FILE 删物理文件 + 缩略图 + 记录，
      // 每条经 @Audit 方法装饰器留一条审计（装饰器包装方法体，内部调用同样触发）
      await this.adminDelete(id, operatorId, { type: att.type, kind: att.kind });
      deleted += 1;
    }
    return { deleted, notFoundIds };
  }

  /** 管理端下载（SYSTEM_FEEDBACK_MANAGE 守卫；所有附件都落附件存储，直接返回） */
  async adminDownload(
    id: string
  ): Promise<{ absPath: string; fileName: string | null; mimeType: string | null }> {
    const att = await this.prisma.feedbackAttachment.findUnique({
      where: { id },
    });
    if (!att) {
      throw new NotFoundException(t('error.feedback.attachment_not_found', '附件不存在'));
    }
    return this.resolveStorageFile(att);
  }

  /** 供审计 details 取附件 type/kind */
  async findForAudit(id: string): Promise<{ type: string; kind: string } | null> {
    const att = await this.prisma.feedbackAttachment.findUnique({
      where: { id },
      select: { type: true, kind: true },
    });
    return att ? { type: att.type, kind: att.kind } : null;
  }

  /** 清理孤儿附件（feedbackId=null 且超 TTL），返回删除数 */
  async cleanupOrphans(): Promise<number> {    const ttlHours = await this.runtimeConfig.getValue<number>(
      'feedback.attachmentOrphanTtlHours'
    );
    const ttlMs = Math.max(1, ttlHours) * 3600 * 1000;
    const cutoff = new Date(Date.now() - ttlMs);
    const orphans = await this.prisma.feedbackAttachment.findMany({
      where: { feedbackId: null, createdAt: { lt: cutoff } },
    });
    for (const att of orphans) {
      // 内容寻址共享：物理文件可能仍被其他（含已绑定）记录引用，有引用则不删
      if (att.storagePath) {
        const refs = await this.prisma.feedbackAttachment.count({
          where: { storagePath: att.storagePath, id: { not: att.id } },
        });
        if (refs === 0) {
          await this.unlinkQuiet(join(this.attachmentRoot(), att.storagePath.replace(/\\/g, '/')));
        }
      }
      if (att.thumbnailPath) {
        await this.unlinkQuiet(join(this.attachmentRoot(), att.thumbnailPath.replace(/\\/g, '/')));
      }
      await this.prisma.feedbackAttachment.delete({ where: { id: att.id } });
    }
    if (orphans.length) {
      this.logger.log(`已清理孤儿附件 ${orphans.length} 个`);
    }
    return orphans.length;
  }

  // ─────────────────────────────────────────────
  // 投影 / 签名
  // ─────────────────────────────────────────────

  /**
   * 附件投影。
   *
   * 权限模型（用户拍板，ADR-0085 修订）：
   * - viewUrl：查看（内联打开附件文件）。管理员（READ）全部可看；提交者仅图片/文档可看
   *   （图纸打开会触发浏览器下载，提交者无权下载，只能看缩略图）；REFERENCE 仅管理员可看。
   * - downloadUrl：仅管理员且具备 SYSTEM_FEEDBACK_MANAGE；提交者恒 null。
   * - thumbnailUrl：仅 FILE 图纸（REFERENCE 不落缩略图）。
   *
   * @param mode none=未绑定反馈（上传瞬间），admin=管理员上下文，submitter=提交者/匿名查询
   */
  toDto(
    row: AttachmentRow,
    opts: { mode: 'admin' | 'submitter' | 'none'; canManage?: boolean }
  ): FeedbackAttachmentDto {
    const code = row.feedback?.feedbackCode;
    const isReference = row.kind === PrismaAttachmentKind.REFERENCE;
    const withCode = Boolean(code && row.storagePath);
    const tokenUrl = (id: string) =>
      `/api/v1/feedback/attachments/${id}/download?token=${this.signDownloadToken(id, code as string)}&code=${encodeURIComponent(code as string)}`;
    // 图纸框选区域非空 → 查看链接带 ?region=（打开图纸时编辑器据此 zoom 到该区域，
    // 与分享二维码同款）。非图纸无 region，原样返回。
    const withRegion = (url: string) =>
      row.region ? `${url}&region=${encodeURIComponent(row.region)}` : url;

    let viewUrl: string | null = null;
    let downloadUrl: string | null = null;
    const thumbnailUrl =
      row.thumbnailPath && !isReference
        ? `/api/v1/feedback/attachments/${row.id}/thumbnail${
            withCode
              ? `?token=${this.signDownloadToken(row.id, code as string)}&code=${encodeURIComponent(code as string)}`
              : ''
          }`
        : null;

    if (opts.mode === 'admin' && withCode) {
      viewUrl = withRegion(tokenUrl(row.id));
      if (opts.canManage) {
        downloadUrl = `/api/v1/admin/feedback/attachments/${row.id}/download`;
      }
    } else if (opts.mode === 'submitter' && withCode) {
      // 提交者：图纸只能看缩略图（打开图纸文件=浏览器下载，提交者无权）
      if (row.type !== PrismaAttachmentType.DRAWING) {
        viewUrl = withRegion(tokenUrl(row.id));
      }
    }

    return {
      id: row.id,
      feedbackId: row.feedbackId,
      type: row.type as FeedbackAttachmentType,
      kind: row.kind as FeedbackAttachmentKind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
      nodeId: row.nodeId,
      fileHash: row.fileHash,
      contentHash: row.contentHash,
      region: row.region,
      thumbnailUrl,
      viewUrl,
      downloadUrl,
      uploadedByName: row.uploadedBy?.username ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** 短期签名下载 token：`${exp}.${hmac}`，exp=now+TTL */
  signDownloadToken(attachmentId: string, code: string): string {
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SEC;
    const sig = createHmac('sha256', this.tokenSecret())
      .update(`${attachmentId}:${code}:${exp}`)
      .digest('hex');
    return `${exp}.${sig}`;
  }

  /** 校验下载签名 token（防枚举：code 上下文 + 过期 + 恒时比较） */
  verifyDownloadToken(token: string, attachmentId: string, code: string): boolean {
    const [exp, sig] = token.split('.');
    if (!exp || !sig) return false;
    if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return false;
    const expect = createHmac('sha256', this.tokenSecret())
      .update(`${attachmentId}:${code}:${exp}`)
      .digest('hex');
    const a = Buffer.from(expect, 'hex');
    const b = Buffer.from(sig, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ─────────────────────────────────────────────
  // 私有辅助
  // ─────────────────────────────────────────────

  /**
   * 查看鉴权（kind 感知）：
   * - REFERENCE（图纸引用）：仅管理员（SYSTEM_FEEDBACK_READ）可查看；签名 token/归属不足。
   * - FILE：签名 token（匿名查询）→ 归属（上传者/提交者）→ 管理员（READ）。
   */
  private async assertCanView(
    att: AttachmentRow,
    ctx: { userId?: string; token?: string; code?: string }
  ): Promise<void> {
    if (att.kind === PrismaAttachmentKind.REFERENCE) {
      if (
        ctx.userId &&
        (await this.permissionService.checkSystemPermission(
          ctx.userId,
          SystemPermission.SYSTEM_FEEDBACK_READ
        ))
      ) {
        return;
      }
      throw new ForbiddenException(
        t('error.feedback.attachment_forbidden', '无权查看该附件')
      );
    }
    // 查询码是查看凭据：先验短期签名 token（登录与否皆可，匿名查询主场景）。
    if (ctx.token && ctx.code && att.feedback?.feedbackCode) {
      if (this.verifyDownloadToken(ctx.token, att.id, att.feedback.feedbackCode)) {
        return;
      }
    }
    if (ctx.userId) {
      if (att.uploadedById === ctx.userId || att.feedback?.submitterId === ctx.userId) {
        return;
      }
      if (
        await this.permissionService.checkSystemPermission(
          ctx.userId,
          SystemPermission.SYSTEM_FEEDBACK_READ
        )
      ) {
        return;
      }
    }
    throw new ForbiddenException(
      t('error.feedback.attachment_forbidden', '无权查看该附件')
    );
  }

  /** 附件存储文件解析（防穿越 + 存在性），供查看/下载共用 */
  private async resolveStorageFile(
    att: AttachmentRow
  ): Promise<{ absPath: string; fileName: string | null; mimeType: string | null }> {
    if (!att.storagePath) {
      throw new NotFoundException(t('error.feedback.attachment_file_missing', '附件文件不存在'));
    }
    // 兼容历史数据：早期 join() 在 Windows 写入反斜杠分隔，统一转 posix 再解析（Linux 部署可读）
    const storagePath = att.storagePath.replace(/\\/g, '/');
    const absPath = FileUtils.resolveWithinRoot(this.attachmentRoot(), storagePath);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) {
      throw new NotFoundException(t('error.feedback.attachment_file_missing', '附件文件不存在'));
    }
    return { absPath, fileName: att.fileName, mimeType: att.mimeType };
  }

  private detectType(mime: string, fileName: string): FeedbackAttachmentType | null {
    if ((FEEDBACK_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
      return FeedbackAttachmentType.IMAGE;
    }
    if ((FEEDBACK_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) {
      return FeedbackAttachmentType.DOCUMENT;
    }
    if (this.isDrawingExt(extname(fileName))) {
      return FeedbackAttachmentType.DRAWING;
    }
    return null;
  }

  private isDrawingExt(ext: string): boolean {
    return (FEEDBACK_DRAWING_EXTENSIONS as readonly string[]).includes(
      ext.toLowerCase()
    );
  }

  /** MxWebDwg2Jpg.exe 可渲染的扩展名（dwg/dxf；mxweb 不支持，跳过生成避免 60s 超时） */
  private isDwgRenderable(ext: string): boolean {
    const e = ext.toLowerCase();
    return e === '.dwg' || e === '.dxf';
  }

  /**
   * 为上传图纸生成缩略图（Windows + MxWebDwg2Jpg.exe；任何失败回落 null，不阻断上传）。
   * 返回相对 filesDataPath 的缩略图路径。
   */
  private async generateDrawingThumbnail(absDrawingPath: string): Promise<string | null> {
    try {
      const outputDir = dirname(absDrawingPath);
      const result = await this.thumbnailService.generateThumbnail(
        absDrawingPath,
        outputDir
      );
      if (!result.success || !result.thumbnailPath) {
        this.logger.debug(`图纸缩略图未生成: ${result.error ?? '未知原因'}`);
        return null;
      }
      const rel = relative(this.attachmentRoot(), result.thumbnailPath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        this.logger.warn(`图纸缩略图路径越界: ${result.thumbnailPath}`);
        return null;
      }
      return this.toPosix(rel);
    } catch (err) {
      this.logger.warn(
        `图纸缩略图生成失败: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  private mimeForDrawing(ext: string): string {
    const e = ext.toLowerCase();
    if (e === '.dwg') return 'application/acad';
    if (e === '.dxf') return 'application/dxf';
    return 'application/octet-stream';
  }

  private async getMaxSizeBytes(type: FeedbackAttachmentType): Promise<number> {
    const key =
      type === FeedbackAttachmentType.IMAGE
        ? 'feedback.maxImageSize'
        : type === FeedbackAttachmentType.DRAWING
          ? 'feedback.maxDrawingSize'
          : 'feedback.maxDocumentSize';
    const mb = await this.runtimeConfig.getValue<number>(key);
    return Math.max(1, mb) * 1024 * 1024;
  }

  private filesDataPath(): string {
    return this.configService.get<string>('filesDataPath') || '';
  }

  /** 附件存储根（feedbackAttachmentPath；刻意不落 filesDataPath——那是 SVN 工作副本） */
  private attachmentRoot(): string {
    return this.configService.get<string>('feedbackAttachmentPath') || '';
  }

  private tokenSecret(): string {
    return (
      this.configService.get<string>('jwt.secret') ||
      'dev-only-jwt-secret-change-me'
    );
  }

  /** 图纸节点 path（相对 filesDataPath）→ 绝对路径（防穿越） */
  private resolveNodeAbsPath(nodePath: string | null): string | null {
    if (!nodePath) return null;
    try {
      return FileUtils.resolveWithinRoot(this.filesDataPath(), nodePath);
    } catch {
      return null;
    }
  }

  private sanitizeName(name: string, fallback: string): string {
    const safe = basename(name || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();
    return safe || fallback;
  }

  /**
   * 内容寻址存储：目标 = attachmentRoot()/{contentHash[:2]}/{contentHash}（无扩展名，
   * 原始文件名/类型存记录）。相同内容（同 hash）命中已有物理文件 → 跳过拷贝
   * （deduped=true），记录层仍独立建行（归属/绑定/删除互不影响）。
   * 调用方负责清理临时源（multipart 临时文件用完即删；registerDrawing 的源是图纸本体，不删）。
   */
  private async storeContent(
    srcAbs: string,
    contentHash: string
  ): Promise<{ relativePath: string; deduped: boolean }> {
    const dirRel = `${contentHash.slice(0, 2)}/${contentHash}`;
    const target = FileUtils.resolveWithinRoot(this.attachmentRoot(), dirRel);
    let deduped = false;
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) {
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.copyFile(srcAbs, target);
    } else {
      deduped = true;
    }
    return { relativePath: dirRel, deduped };
  }

  private hashBuffer(buf: Buffer): string {
    return createHash('md5').update(buf).digest('hex');
  }

  /** 文件流 MD5（大文件不整读，避免内存峰值）；与 mxcad 通道 fileHash 同口径 */
  private hashFileStream(absPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(absPath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * 持久化图纸缩略图（base64 dataURL → 附件缩略图区），返回相对路径（相对 filesDataPath）。
   * 非法/缺失输入返回 null（缩略图是增强项，失败不应阻断图纸注册）。
   */
  private async persistThumbnail(
    thumbnailData?: string
  ): Promise<string | null> {
    if (!thumbnailData) return null;
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(thumbnailData);
    if (!m) return null;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const buf = Buffer.from(m[2], 'base64');
    const assetId = randomBytes(8).toString('hex');
    const dirRel = join('attachments', this.todayMonth(), assetId);
    const baseDir = FileUtils.resolveWithinRoot(this.attachmentRoot(), dirRel);
    await fs.mkdir(baseDir, { recursive: true });
    const fileName = `thumbnail_${assetId}.${ext}`;
    await fs.writeFile(join(baseDir, fileName), buf);
    return this.toPosix(join(dirRel, fileName));
  }

  private todayMonth(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}`;
  }

  private async statSize(absPath: string): Promise<number | null> {
    const stat = await fs.stat(absPath).catch(() => null);
    return stat?.size ?? null;
  }

  private async unlinkQuiet(p: string): Promise<void> {
    await fs.unlink(p).catch(() => undefined);
  }

  /** DB 内相对路径统一 posix（`/`）分隔，保证 Windows 写入、Linux 部署可读（path.join 对 `/` 两端通用） */
  private toPosix(p: string): string {
    return p.split(sep).join('/');
  }
}
