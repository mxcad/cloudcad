///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 限流/配额（Redis 每日计数 + RuntimeConfig 可调）
//
// 匿名识别：ip + anonTokenHash。限流按 IP 每日计数（主闸），设备 token 只作
// 查询身份不做每日计数（cookie/localStorage 可清，按设备计数可被轻易绕过，
// IP 计数才是真实防刷闸门）。全部阈值走 RuntimeConfig feedback.* 键。
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import {
  FEEDBACK_CODE_QUERY_MAX,
  FEEDBACK_CODE_QUERY_WINDOW_SEC,
  feedbackAnonRateKey,
  feedbackCodeQueryKey,
  feedbackUserRateKey,
  todayStamp,
} from './feedback.constants';

const t = (key: string, fallback: string): string =>
  (I18nContext.current()?.t(key) as string | undefined) ?? fallback;

export interface FeedbackContentLimits {
  min: number;
  max: number;
}

@Injectable()
export class FeedbackRateLimitService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly runtimeConfig: RuntimeConfigService
  ) {}

  /** 内容长度上下限（RuntimeConfig 可调） */
  async getContentLimits(): Promise<FeedbackContentLimits> {
    const [min, max] = await Promise.all([
      this.runtimeConfig.getValue<number>('feedback.minContentLength'),
      this.runtimeConfig.getValue<number>('feedback.maxContentLength'),
    ]);
    return { min: Math.max(1, min), max: Math.min(20000, Math.max(1, max)) };
  }

  /** 提交前校验：匿名开关 + 匿名每日每 IP 上限 */
  async assertAnonymousAllowed(ip: string): Promise<void> {
    const enabled = await this.runtimeConfig.getValue<boolean>('feedback.anonymousEnabled');
    if (!enabled) {
      throw new ForbiddenException(
        t('error.feedback.anonymous_disabled', '当前未开放匿名反馈，请登录后提交')
      );
    }
    const limit = await this.runtimeConfig.getValue<number>('feedback.anonymousDailyLimit');
    if (limit <= 0) {
      throw new ForbiddenException(
        t('error.feedback.anonymous_disabled', '当前未开放匿名反馈，请登录后提交')
      );
    }
    const used = await this.incrWindow(feedbackAnonRateKey(ip, todayStamp()), 86400);
    if (used > limit) {
      throw new ForbiddenException(
        t('error.feedback.anon_limit_exceeded', '您今天的匿名反馈次数已达上限，请登录后继续提交')
      );
    }
  }

  /** 提交前校验：登录用户每日上限 */
  async assertUserAllowed(userId: string): Promise<void> {
    const limit = await this.runtimeConfig.getValue<number>('feedback.userDailyLimit');
    const used = await this.incrWindow(feedbackUserRateKey(userId, todayStamp()), 86400);
    if (used > limit) {
      throw new ForbiddenException(
        t('error.feedback.user_limit_exceeded', '您今天的反馈次数已达上限，请明天再试')
      );
    }
  }

  /** 匿名查询码查询接口限流（防枚举） */
  async assertCodeQueryAllowed(ip: string): Promise<void> {
    const used = await this.incrWindow(
      feedbackCodeQueryKey(ip),
      FEEDBACK_CODE_QUERY_WINDOW_SEC
    );
    if (used > FEEDBACK_CODE_QUERY_MAX) {
      throw new ForbiddenException(
        t('error.feedback.query_rate_limited', '查询过于频繁，请稍后再试')
      );
    }
  }

  /** 内容长度校验（返回超限/过短的错误消息，null=通过）
   *  反馈内容为富文本 HTML（ADR-0085 修订），长度按「可见文本」计：剥离标签、
   *  解码基础实体，避免行内图片/附件卡片标签把字数撑爆。 */
  validateContent(content: string, limits: FeedbackContentLimits): string | null {
    const len = countVisibleText(content);
    if (len < limits.min) {
      return t(
        'error.feedback.content_too_short',
        `反馈内容过短（至少 ${limits.min} 字）`
      );
    }
    if (len > limits.max) {
      return t(
        'error.feedback.content_too_long',
        `反馈内容过长（最多 ${limits.max} 字）`
      );
    }
    return null;
  }

  /** Redis 固定窗口计数（首次设置 TTL） */
  private async incrWindow(key: string, ttlSec: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttlSec);
    }
    return count;
  }
}

/** 计算富文本「可见文本」字符数（剥离标签 + 解码基础实体） */
export function countVisibleText(content: string): number {
  if (!content) return 0;
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\s+/g, ' ').trim().length;
}
