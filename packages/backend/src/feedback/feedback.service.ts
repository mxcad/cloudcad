///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 主服务（用户侧 + 管理侧列表/详情/状态）
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  FeedbackAttachmentKind as PrismaFeedbackAttachmentKind,
  FeedbackAttachmentType as PrismaFeedbackAttachmentType,
  FeedbackSource as PrismaFeedbackSource,
  FeedbackStatus as PrismaFeedbackStatus,
  FeedbackType as PrismaFeedbackType,
  Prisma,
  RewardStatus as PrismaRewardStatus,
} from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { FeedbackRateLimitService } from './feedback-rate-limit.service';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Audit } from '../common/decorators/audit.decorator';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import {
  FEEDBACK_CODE_ALPHABET,
  FEEDBACK_CODE_LENGTH,
  FEEDBACK_CODE_PREFIX,
  FEEDBACK_CODE_RETRY,
  hashAnonToken,
  todayStamp,
} from './feedback.constants';
import { FeedbackStatus, RewardStatus } from './feedback.enums';
import { FeedbackAttachmentService } from './feedback-attachment.service';
import { CreateFeedbackDto } from './dto/feedback.dto';
import {
  FeedbackListResponseDto,
  FeedbackQueryResultDto,
  FeedbackResponseDto,
  FeedbackRewardListResponseDto,
  FeedbackRewardResponseDto,
  SubmitFeedbackResultDto,
} from './dto/feedback-response.dto';

const t = (key: string, fallback: string): string =>
  (I18nContext.current()?.t(key) as string | undefined) ?? fallback;

/** 反馈行（含 reward + submitter 的 include 形状） */
type FeedbackRow = {
  id: string;
  type: PrismaFeedbackType;
  status: PrismaFeedbackStatus;
  title: string;
  content: string;
  source: PrismaFeedbackSource;
  submitterId: string | null;
  contact: string | null;
  pageUrl: string | null;
  ip: string | null;
  feedbackCode: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  adoptNote: string | null;
  rejectReason: string | null;
  rewardStatus: PrismaRewardStatus;
  claimRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
  reward?: {
    id: string;
    feedbackId: string;
    userId: string | null;
    user?: { id: string; username: string; nickname: string | null; email: string } | null;
    vipTierLevel: number;
    durationDays: number;
    status: PrismaRewardStatus;
    issuedById: string | null;
    issuedAt: Date | null;
    remark: string | null;
    createdAt: Date;
    feedback?: {
      feedbackCode: string;
      title: string;
      type: PrismaFeedbackType;
      submitter?: {
        id: string;
        username: string;
        nickname: string | null;
        email: string;
      } | null;
    } | null;
  } | null;
  submitter?: { username: string; nickname: string | null } | null;
  attachments?: {
    id: string;
    feedbackId: string | null;
    type: PrismaFeedbackAttachmentType;
    kind: PrismaFeedbackAttachmentKind;
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
  }[];
};

export interface FeedbackListQuery {
  page: number;
  pageSize: number;
  type?: string;
  status?: string;
  rewardStatus?: string;
  source?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export interface FeedbackCreateContext {
  userId?: string;
  ip: string;
  userAgent?: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly rateLimit: FeedbackRateLimitService,
    private readonly attachmentService: FeedbackAttachmentService,
    @Inject(IPERMISSION_SERVICE)
    private readonly permissionService: IPermissionService
  ) {}

  /** 提交反馈（匿名/登录） */
  async create(
    dto: CreateFeedbackDto,
    ctx: FeedbackCreateContext
  ): Promise<SubmitFeedbackResultDto> {
    const limits = await this.rateLimit.getContentLimits();
    const contentError = this.rateLimit.validateContent(dto.content, limits);
    if (contentError) {
      throw new BadRequestException(contentError);
    }

    if (ctx.userId) {
      await this.rateLimit.assertUserAllowed(ctx.userId);
    } else {
      await this.rateLimit.assertAnonymousAllowed(ctx.ip);
    }

    const feedbackCode = await this.generateUniqueCode();
    const anonTokenHash =
      ctx.userId || !dto.anonToken ? null : hashAnonToken(dto.anonToken);

    const created = await this.prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          type: dto.type as PrismaFeedbackType,
          title: dto.title.trim(),
          content: dto.content,
          source: dto.source as PrismaFeedbackSource,
          submitterId: ctx.userId ?? null,
          contact: dto.contact?.trim() || null,
          anonTokenHash,
          ip: ctx.ip || null,
          userAgent: ctx.userAgent || null,
          pageUrl: dto.pageUrl || null,
          feedbackCode,
          status: PrismaFeedbackStatus.PENDING,
          rewardStatus: PrismaRewardStatus.NONE,
          claimRequired: false,
        },
      });
      // 绑定已上传/已注册的附件（校验归属 + 数量上限 + 事务内设 feedbackId）
      if (dto.attachmentIds?.length) {
        const owned = await this.attachmentService.assertOwned(dto.attachmentIds, ctx);
        await this.attachmentService.assertCountLimits(owned);
        await this.attachmentService.bindInTx(tx, owned.map((a) => a.id), feedback.id);
      }
      return feedback;
    });

    return this.toSubmitResult(created);
  }

  /** 我的反馈列表（登录） */
  async listMine(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<FeedbackListResponseDto> {
    const where = { submitterId: userId };
    const [total, rows] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.feedbackInclude(),
      }),
    ]);
    return {
      items: rows.map((r) => this.toResponse(r as FeedbackRow, { mode: 'submitter' })),
      total,
      page,
      pageSize,
    };
  }

  /** 我的奖励记录（登录；含已采纳待发放 + 已发放） */
  async listMineRewards(userId: string): Promise<FeedbackRewardListResponseDto> {
    const rows = await this.prisma.feedbackReward.findMany({
      where: { feedback: { submitterId: userId } },
      orderBy: { createdAt: 'desc' },
      include: {
        feedback: {
          select: {
            id: true,
            title: true,
            feedbackCode: true,
            type: true,
          },
        },
      },
    });
    return {
      items: rows.map((r) => this.toRewardResponse(r)),
      total: rows.length,
    };
  }

  /** 匿名凭码查询（限流 + contact 二次校验） */
  async queryByCode(code: string, contact?: string): Promise<FeedbackQueryResultDto> {
    const row = await this.prisma.feedback.findUnique({
      where: { feedbackCode: code },
      include: { attachments: true },
    });
    if (!row) {
      throw new NotFoundException(
        t('error.feedback.code_not_found', '反馈不存在或查询码无效')
      );
    }
    if (row.contact && (!contact || row.contact.toLowerCase() !== contact.toLowerCase())) {
      throw new NotFoundException(
        t('error.feedback.code_not_found', '反馈不存在或查询码无效')
      );
    }
    return {
      feedbackCode: row.feedbackCode,
      type: row.type as FeedbackResponseDto['type'],
      status: row.status as FeedbackResponseDto['status'],
      title: row.title,
      content: row.content,
      rewardStatus: row.rewardStatus as FeedbackResponseDto['rewardStatus'],
      claimRequired: row.claimRequired,
      adoptNote: row.adoptNote,
      rejectReason: row.rejectReason,
      attachments: (row.attachments ?? []).map((att) =>
        this.attachmentService.toDto(
          { ...att, feedback: { feedbackCode: row.feedbackCode, submitterId: row.submitterId } },
          { mode: 'submitter' }
        )
      ),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** 管理端：列表（筛选 + 分页） */
  async adminList(
    query: FeedbackListQuery,
    requesterId?: string
  ): Promise<FeedbackListResponseDto> {
    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type as PrismaFeedbackType;
    if (query.status) where.status = query.status as PrismaFeedbackStatus;
    if (query.rewardStatus) where.rewardStatus = query.rewardStatus as PrismaRewardStatus;
    if (query.source) where.source = query.source as PrismaFeedbackSource;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
        { feedbackCode: { contains: query.search, mode: 'insensitive' } },
        // 账号搜索：认领后 submitter 即绑定账号（匿名反馈发放时回填 submitterId）
        { submitter: { username: { contains: query.search, mode: 'insensitive' } } },
        { submitter: { nickname: { contains: query.search, mode: 'insensitive' } } },
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
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: this.feedbackInclude(),
      }),
    ]);
    return {
      items: rows.map((r) =>
        this.toResponse(r as FeedbackRow, { mode: 'admin', canManage })
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 管理端：详情 */
  async adminDetail(
    id: string,
    requesterId?: string
  ): Promise<FeedbackResponseDto> {
    const row = await this.prisma.feedback.findUnique({
      where: { id },
      include: this.feedbackInclude(),
    });
    if (!row) {
      throw new NotFoundException(
        t('error.feedback.not_found', '反馈不存在')
      );
    }
    const canManage = requesterId
      ? await this.permissionService.checkSystemPermission(
          requesterId,
          SystemPermission.SYSTEM_FEEDBACK_MANAGE
        )
      : false;
    return this.toResponse(row as FeedbackRow, { mode: 'admin', canManage });
  }

  /** 管理端：改状态（REVIEWING/REJECTED/CLOSED） */
  async adminUpdateStatus(
    id: string,
    status: FeedbackStatus,
    reason: string | undefined,
    operatorId: string
  ): Promise<FeedbackResponseDto> {
    const row = await this.prisma.feedback.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(
        t('error.feedback.not_found', '反馈不存在')
      );
    }
    if (row.status === PrismaFeedbackStatus.ADOPTED) {
      // 已采纳反馈不可再改为驳回/关闭，只能走奖励撤销
      // 资源已找到（上方已判 not_found），此处是业务规则拒绝 → 400 而非 404
      throw new BadRequestException(
        t('error.feedback.status_locked_adopted', '已采纳的反馈不可改状态，如需撤销请处理奖励')
      );
    }
    if (status === FeedbackStatus.REJECTED && !reason) {
      // 校验错误（缺驳回原因）→ 400
      throw new BadRequestException(
        t('error.feedback.reject_reason_required', '驳回必须填写原因')
      );
    }
    const updated = await this.prisma.feedback.update({
      where: { id },
      data: {
        status: status as PrismaFeedbackStatus,
        rejectReason: status === FeedbackStatus.REJECTED ? reason || null : null,
        reviewedById: operatorId,
        reviewedAt: new Date(),
      },
      include: this.feedbackInclude(),
    });
    const canManage = await this.permissionService.checkSystemPermission(
      operatorId,
      SystemPermission.SYSTEM_FEEDBACK_MANAGE
    );
    return this.toResponse(updated as FeedbackRow, { mode: 'admin', canManage });
  }

  /**
   * 管理端删除单条反馈（级联删奖励凭据与附件记录；附件物理文件经附件服务清理，
   * 每条留审计。已发放的会员不回收——会员在 UserMembership，凭据删除不影响已发权益）。
   */
  @Audit(AuditAction.FEEDBACK_DELETE, ResourceType.FEEDBACK, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[1] as string,
    details: (_result, args) => args[2] as Record<string, unknown>,
  })
  async adminDelete(
    id: string,
    operatorId: string,
    detail?: Record<string, unknown>
  ): Promise<{ success: boolean }> {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(t('error.feedback.not_found', '反馈不存在'));
    }
    // 先清附件（物理文件 + 记录 + 审计），再删反馈（级联删奖励凭据与剩余附件记录）。
    // 附件删除复用附件服务 adminDelete：FILE 形态删物理文件（内容寻址引用检查），
    // REFERENCE 只删记录；反馈删除时附件记录由级联一并删除。
    const attachments = await this.prisma.feedbackAttachment.findMany({
      where: { feedbackId: id },
      select: { id: true, type: true, kind: true },
    });
    for (const att of attachments) {
      await this.attachmentService.adminDelete(att.id, operatorId, {
        type: att.type,
        kind: att.kind,
      });
    }
    await this.prisma.feedback.delete({ where: { id } });
    this.logger.log(`反馈已删除：${id}，操作者=${operatorId}`);
    return { success: true };
  }

  /**
   * 管理端批量删除（复用 adminDelete 逐条执行，每条留审计）。
   *
   * 不存在的 ID 不抛错、记入 notFoundIds；返回实际删除数与未找到 ID，
   * 供前端提示「部分反馈不存在」。删除反馈会级联删奖励凭据与附件（含物理文件）。
   */
  async adminDeleteMany(
    ids: string[],
    operatorId: string
  ): Promise<{ deleted: number; notFoundIds: string[] }> {
    // DTO 层已拦空数组，此处防御性短路避免空 in 查询
    if (ids.length === 0) return { deleted: 0, notFoundIds: [] };
    const existing = await this.prisma.feedback.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        rewardStatus: true,
        _count: { select: { attachments: true } },
      },
    });
    const existingById = new Map(existing.map((f) => [f.id, f]));
    const notFoundIds = ids.filter((id) => !existingById.has(id));

    let deleted = 0;
    for (const id of ids) {
      const fb = existingById.get(id);
      if (!fb) continue;
      await this.adminDelete(id, operatorId, {
        status: fb.status,
        rewardStatus: fb.rewardStatus,
        attachmentCount: fb._count.attachments,
      });
      deleted += 1;
    }
    return { deleted, notFoundIds };
  }

  /** 管理端：奖励记录列表（可按状态/分类筛选，可按查询码/标题/账号搜索） */
  async listRewards(query: {
    status?: string;
    type?: string;
    search?: string;
  }): Promise<FeedbackRewardListResponseDto> {
    const where: Prisma.FeedbackRewardWhereInput = {};
    if (query.status) where.status = query.status as PrismaRewardStatus;
    if (query.type) where.feedback = { type: query.type as PrismaFeedbackType };
    if (query.search) {
      where.OR = [
        { feedback: { feedbackCode: { contains: query.search, mode: 'insensitive' } } },
        { feedback: { title: { contains: query.search, mode: 'insensitive' } } },
        { user: { username: { contains: query.search, mode: 'insensitive' } } },
        { user: { nickname: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.feedbackReward.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, nickname: true, email: true } },
        feedback: {
          select: {
            id: true,
            title: true,
            feedbackCode: true,
            type: true,
            submitterId: true,
            contact: true,
            submitter: {
              select: { id: true, username: true, nickname: true, email: true },
            },
          },
        },
      },
    });
    return {
      items: rows.map((r) => this.toRewardResponse(r)),
      total: rows.length,
    };
  }

  // ───────────────────────── 内部工具 ─────────────────────────

  private feedbackInclude() {
    return {
      // reward 需带 feedback 关联：列表行经 toRewardResponse 透出
      // feedbackCode/feedbackTitle/submitter（发放弹窗信息框与账号预选依赖）
      reward: {
        include: {
          // user=发放目标账号（列表「发放账号」列与详情弹窗显示账号名）
          user: { select: { id: true, username: true, nickname: true, email: true } },
          feedback: {
            select: {
              feedbackCode: true,
              title: true,
              type: true,
              submitter: {
                select: { id: true, username: true, nickname: true, email: true },
              },
            },
          },
        },
      },
      submitter: { select: { username: true, nickname: true } },
      attachments: true,
    } as const;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < FEEDBACK_CODE_RETRY; i++) {
      const code = this.buildCode();
      const exists = await this.prisma.feedback.findUnique({
        where: { feedbackCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    // 碰撞概率极低（40bit 熵），此处兜底
    throw new Error('feedback code generation failed');
  }

  private buildCode(): string {
    const bytes = randomBytes(FEEDBACK_CODE_LENGTH);
    const body = Array.from(bytes)
      .map((b) => FEEDBACK_CODE_ALPHABET[b % 32])
      .join('');
    return `${FEEDBACK_CODE_PREFIX}-${todayStamp()}-${body}`;
  }

  private toSubmitResult(row: {
    id: string;
    feedbackCode: string;
    status: PrismaFeedbackStatus;
    rewardStatus: PrismaRewardStatus;
    claimRequired: boolean;
    createdAt: Date;
  }): SubmitFeedbackResultDto {
    return {
      id: row.id,
      feedbackCode: row.feedbackCode,
      status: row.status as SubmitFeedbackResultDto['status'],
      rewardStatus: row.rewardStatus as SubmitFeedbackResultDto['rewardStatus'],
      claimRequired: row.claimRequired,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRewardResponse(row: {
    id: string;
    feedbackId: string;
    userId: string | null;
    user?: { id: string; username: string; nickname: string | null; email: string } | null;
    vipTierLevel: number;
    durationDays: number;
    status: PrismaRewardStatus;
    issuedById: string | null;
    issuedAt: Date | null;
    remark: string | null;
    createdAt: Date;
    feedback?: {
      feedbackCode: string;
      title?: string;
      type?: string;
      submitter?: { id: string; username: string; nickname: string | null; email: string } | null;
    };
  }): FeedbackRewardResponseDto {
    return {
      id: row.id,
      feedbackId: row.feedbackId,
      feedbackCode: row.feedback?.feedbackCode ?? '',
      feedbackTitle: row.feedback?.title ?? '',
      feedbackType: row.feedback?.type as FeedbackRewardResponseDto['feedbackType'],
      submitter: row.feedback?.submitter
        ? {
            id: row.feedback.submitter.id,
            username: row.feedback.submitter.username,
            nickname: row.feedback.submitter.nickname,
            email: row.feedback.submitter.email,
          }
        : null,
      userId: row.userId,
      user: row.user
        ? {
            id: row.user.id,
            username: row.user.username,
            nickname: row.user.nickname,
            email: row.user.email,
          }
        : null,
      vipTierLevel: row.vipTierLevel,
      durationDays: row.durationDays,
      status: row.status as FeedbackRewardResponseDto['status'],
      issuedById: row.issuedById,
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toResponse(
    row: FeedbackRow,
    opts: { mode: 'admin' | 'submitter'; canManage?: boolean }
  ): FeedbackResponseDto {
    return {
      id: row.id,
      type: row.type as FeedbackResponseDto['type'],
      status: row.status as FeedbackResponseDto['status'],
      title: row.title,
      content: row.content,
      source: row.source as FeedbackResponseDto['source'],
      submitterId: row.submitterId,
      submitterName: row.submitter
        ? row.submitter.nickname || row.submitter.username
        : null,
      contact: row.contact,
      pageUrl: row.pageUrl,
      // IP 属管理侧核实信息，提交者视角不透出
      ip: opts.mode === 'admin' ? row.ip : null,
      feedbackCode: row.feedbackCode,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      adoptNote: row.adoptNote,
      rejectReason: row.rejectReason,
      rewardStatus: row.rewardStatus as FeedbackResponseDto['rewardStatus'],
      claimRequired: row.claimRequired,
      reward: row.reward ? this.toRewardResponse(row.reward) : null,
      attachments: (row.attachments ?? []).map((att) =>
        this.attachmentService.toDto(
          { ...att, feedback: { feedbackCode: row.feedbackCode, submitterId: row.submitterId } },
          { mode: opts.mode, canManage: opts.canManage }
        )
      ),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
