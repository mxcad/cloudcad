///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 奖励服务（采纳 / 发放 / 撤销）
//
// 铁律：奖励不可匿名。登录用户被采纳 → claimRequired=false；匿名被采纳 →
// claimRequired=true，须凭 feedbackCode 联系客服注册/绑定账号后发放。
// 发放经 MembershipService.activate（写 UserMembership 唯一入口，需事务），
// 本服务只做业务凭据与审计留痕；每次采纳/发放/撤销都走 @Audit。
///////////////////////////////////////////////////////////////////////////////

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  FeedbackStatus as PrismaFeedbackStatus,
  RewardStatus as PrismaRewardStatus,
} from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { MembershipService } from '../vip/membership.service';
import { Audit } from '../common/decorators/audit.decorator';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { ACCOUNT_EVENTS_CHANNEL } from '../users/account-events-sse.constants';
import {
  FEEDBACK_REWARD_DURATION_DAYS,
  FEEDBACK_MAX_TIER_LEVEL,
  FEEDBACK_MIN_TIER_LEVEL,
} from './feedback.constants';
import { AdoptFeedbackDto, IssueRewardDto, RevokeRewardDto } from './dto/feedback.dto';
import { FeedbackRewardResponseDto } from './dto/feedback-response.dto';

const t = (key: string, fallback: string): string =>
  (I18nContext.current()?.t(key) as string | undefined) ?? fallback;

@Injectable()
export class FeedbackRewardService {
  private readonly logger = new Logger(FeedbackRewardService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly membershipService: MembershipService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /** 采纳反馈 + 创建待发放奖励（管理员） */
  @Audit(AuditAction.FEEDBACK_ADOPT, ResourceType.FEEDBACK, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[2] as string,
    details: (_result, args) => {
      const dto = args[1] as AdoptFeedbackDto;
      return {
        vipTierLevel: dto?.vipTierLevel,
        durationDays: dto?.durationDays,
      };
    },
  })
  async adopt(
    feedbackId: string,
    dto: AdoptFeedbackDto,
    operatorId: string
  ): Promise<FeedbackRewardResponseDto> {
    this.assertTierLevel(dto.vipTierLevel);
    this.assertDurationDays(dto.durationDays);

    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
    });
    if (!feedback) {
      throw new NotFoundException(t('error.feedback.not_found', '反馈不存在'));
    }
    if (feedback.status === PrismaFeedbackStatus.ADOPTED) {
      throw new BadRequestException(
        t('error.feedback.already_adopted', '该反馈已采纳')
      );
    }
    const existingReward = await this.prisma.feedbackReward.findUnique({
      where: { feedbackId },
    });
    if (existingReward) {
      throw new BadRequestException(
        t('error.feedback.reward_exists', '该反馈已存在奖励记录')
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.feedback.update({
        where: { id: feedbackId },
        data: {
          status: PrismaFeedbackStatus.ADOPTED,
          adoptNote: dto.note || null,
          reviewedById: operatorId,
          reviewedAt: new Date(),
          rewardStatus: PrismaRewardStatus.PENDING,
          // 匿名被采纳 → 须认领；登录用户 → 直接进入发放（客服仍核实）
          claimRequired: feedback.submitterId == null,
        },
      });
      const reward = await tx.feedbackReward.create({
        data: {
          feedbackId,
          vipTierLevel: dto.vipTierLevel,
          durationDays: dto.durationDays,
          status: PrismaRewardStatus.PENDING,
        },
      });
      return { updated, reward };
    });

    this.logger.log(
      `反馈已采纳：feedbackId=${feedbackId}, tier=${dto.vipTierLevel}, days=${dto.durationDays}, claimRequired=${result.updated.claimRequired}`
    );
    // loadRewardWithFeedback 按奖励记录 id 查询（新生成的 UUID），不是 feedbackId
    return this.loadRewardWithFeedback(result.reward.id);
  }

  /** 发放奖励：绑定账号 + 写 UserMembership + 审计（客服） */
  @Audit(AuditAction.FEEDBACK_REWARD_ISSUE, ResourceType.FEEDBACK, {
    resourceId: (result) => (result as FeedbackRewardResponseDto)?.feedbackId,
    userId: (_result, args) => args[2] as string,
    details: (result) => {
      const r = result as FeedbackRewardResponseDto;
      return {
        rewardId: r?.id,
        targetUserId: r?.userId,
        vipTierLevel: r?.vipTierLevel,
        durationDays: r?.durationDays,
      };
    },
  })
  async issue(
    rewardId: string,
    dto: IssueRewardDto,
    operatorId: string
  ): Promise<FeedbackRewardResponseDto> {
    if (!dto.remark || !dto.remark.trim()) {
      throw new BadRequestException(
        t('error.feedback.remark_required', '发放奖励必须填写客服核实备注')
      );
    }

    const reward = await this.prisma.feedbackReward.findUnique({
      where: { id: rewardId },
    });
    if (!reward) {
      throw new NotFoundException(
        t('error.feedback.reward_not_found', '奖励记录不存在')
      );
    }
    if (reward.status !== PrismaRewardStatus.PENDING) {
      throw new BadRequestException(
        t('error.feedback.reward_not_pending', '该奖励已处理，不能重复发放')
      );
    }

    const targetTierLevel = dto.vipTierLevel ?? reward.vipTierLevel;
    const durationDays = dto.durationDays ?? reward.durationDays;
    this.assertTierLevel(targetTierLevel);
    this.assertDurationDays(durationDays);

    // 档位对应的会员等级必须存在（取月价作为 activate 折算依据）
    const tier = await this.prisma.vipTier.findUnique({
      where: { level: targetTierLevel },
    });
    if (!tier) {
      throw new BadRequestException(
        t('error.feedback.tier_not_found', `会员等级 ${targetTierLevel} 不存在`)
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!targetUser) {
      throw new BadRequestException(
        t('error.feedback.user_not_found', '目标账号不存在或已注销')
      );
    }

    const feedback = await this.prisma.feedback.findUnique({
      where: { id: reward.feedbackId },
      select: { id: true, submitterId: true },
    });
    if (!feedback) {
      throw new NotFoundException(t('error.feedback.not_found', '反馈不存在'));
    }

    await this.prisma.$transaction(async (tx) => {
      // 写 UserMembership（唯一入口，需事务；幂等合并续期/升级）
      await this.membershipService.activate(
        tx,
        dto.userId,
        { level: tier.level, baseMonthlyPrice: tier.baseMonthlyPrice },
        durationDays
      );
      const rew = await tx.feedbackReward.update({
        where: { id: rewardId },
        data: {
          status: PrismaRewardStatus.ISSUED,
          userId: dto.userId,
          issuedById: operatorId,
          issuedAt: new Date(),
          remark: dto.remark.trim(),
          vipTierLevel: targetTierLevel,
          durationDays,
        },
      });
      // 匿名认领：绑定账号到反馈；登录用户沿用提交者
      await tx.feedback.update({
        where: { id: feedback.id },
        data: {
          ...(feedback.submitterId == null
            ? { submitterId: dto.userId, claimRequired: false }
            : {}),
          rewardStatus: PrismaRewardStatus.ISSUED,
        },
      });
      return rew;
    });

    // 推送账户事件：该用户已登录客户端（PC/移动端）收到后 refreshUser()
    // 重拉 /auth/profile 立即拿到最新会员态
    this.eventEmitter.emit(ACCOUNT_EVENTS_CHANNEL(dto.userId), {
      type: 'membership-changed',
    });

    this.logger.log(
      `奖励已发放：rewardId=${rewardId}, userId=${dto.userId}, tier=${targetTierLevel}, days=${durationDays}`
    );
    return this.loadRewardWithFeedback(rewardId);
  }

  /** 撤销奖励（误采纳/作弊；已发放的会员回收由人工处理，审计留痕） */
  @Audit(AuditAction.FEEDBACK_REWARD_REVOKE, ResourceType.FEEDBACK, {
    resourceId: (result) => (result as FeedbackRewardResponseDto)?.feedbackId,
    userId: (_result, args) => args[2] as string,
    details: (_result, args) => {
      const dto = args[1] as RevokeRewardDto;
      return { reason: dto?.reason };
    },
  })
  async revoke(
    rewardId: string,
    dto: RevokeRewardDto,
    operatorId: string
  ): Promise<FeedbackRewardResponseDto> {
    const reward = await this.prisma.feedbackReward.findUnique({
      where: { id: rewardId },
    });
    if (!reward) {
      throw new NotFoundException(
        t('error.feedback.reward_not_found', '奖励记录不存在')
      );
    }
    if (reward.status === PrismaRewardStatus.REVOKED) {
      throw new BadRequestException(
        t('error.feedback.reward_already_revoked', '该奖励已撤销')
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const rew = await tx.feedbackReward.update({
        where: { id: rewardId },
        data: {
          status: PrismaRewardStatus.REVOKED,
          remark: dto.reason,
          issuedById: operatorId,
        },
      });
      await tx.feedback.update({
        where: { id: reward.feedbackId },
        data: { rewardStatus: PrismaRewardStatus.REVOKED },
      });
      return rew;
    });

    if (reward.status === PrismaRewardStatus.ISSUED) {
      // 已发放的撤销：会员实际回收由客服人工处理（此处只标记+留痕）
      this.logger.warn(
        `已发放奖励被撤销（需人工回收会员）：rewardId=${rewardId}, operator=${operatorId}`
      );
    }
    return this.loadRewardWithFeedback(rewardId);
  }

  /** 会员等级范围校验 */
  private assertTierLevel(level: number): void {
    if (
      !Number.isInteger(level) ||
      level < FEEDBACK_MIN_TIER_LEVEL ||
      level > FEEDBACK_MAX_TIER_LEVEL
    ) {
      throw new BadRequestException(
        t('error.feedback.invalid_tier', `奖励会员等级仅支持 ${FEEDBACK_MIN_TIER_LEVEL}-${FEEDBACK_MAX_TIER_LEVEL}`)
      );
    }
  }

  /** 奖励时长校验 */
  private assertDurationDays(days: number): void {
    if (!Number.isInteger(days) || !FEEDBACK_REWARD_DURATION_DAYS.includes(days as never)) {
      throw new BadRequestException(
        t('error.feedback.invalid_duration', `奖励时长仅支持 ${FEEDBACK_REWARD_DURATION_DAYS.join('/')} 天`)
      );
    }
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
      submitter?: { id: string; username: string; nickname: string | null; email: string } | null;
    };
  }): FeedbackRewardResponseDto {
    return {
      id: row.id,
      feedbackId: row.feedbackId,
      feedbackCode: row.feedback?.feedbackCode ?? '',
      feedbackTitle: row.feedback?.title ?? '',
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

  /** 奖励记录（含反馈查询码/标题），adopt/issue/revoke 返回用 */
  private async loadRewardWithFeedback(
    rewardId: string
  ): Promise<FeedbackRewardResponseDto> {
    const row = await this.prisma.feedbackReward.findUnique({
      where: { id: rewardId },
      include: {
        user: { select: { id: true, username: true, nickname: true, email: true } },
        feedback: {
          select: {
            feedbackCode: true,
            title: true,
            submitter: {
              select: { id: true, username: true, nickname: true, email: true },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(
        t('error.feedback.reward_not_found', '奖励记录不存在')
      );
    }
    return this.toRewardResponse(row);
  }
}
