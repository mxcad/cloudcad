///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 常量
///////////////////////////////////////////////////////////////////////////////

import { createHash } from 'crypto';
import { FeedbackStatus } from './feedback.enums';

/** 反馈查询码前缀：FB-YYYYMMDD-XXXXXXXX */
export const FEEDBACK_CODE_PREFIX = 'FB';

/** 查询码随机段长度（8 位 base32 ≈ 40 bit 熵，配合查询接口限流防枚举） */
export const FEEDBACK_CODE_LENGTH = 8;

/** base32 字母表（去除易混淆字符 I/L/O/U，保留 32 个） */
export const FEEDBACK_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 查询码唯一冲突重试次数 */
export const FEEDBACK_CODE_RETRY = 3;

/** 奖励档位：可选时长（天） */
export const FEEDBACK_REWARD_DURATION_DAYS = [7, 30, 90] as const;

/** 奖励档位：默认等级与时长 */
export const FEEDBACK_REWARD_DEFAULT_TIER_LEVEL = 1;
export const FEEDBACK_REWARD_DEFAULT_DURATION_DAYS = 30;

/** 奖励档位：会员等级允许范围（对应 VipTier.level） */
export const FEEDBACK_MIN_TIER_LEVEL = 1;
export const FEEDBACK_MAX_TIER_LEVEL = 3;

/** 管理端可手动设置的反馈状态（采纳走独立 adopt 端点） */
export const FEEDBACK_ALLOWED_MANUAL_STATUS = [
  FeedbackStatus.REVIEWING,
  FeedbackStatus.REJECTED,
  FeedbackStatus.CLOSED,
];

/** 匿名查询码查询接口限流：每 IP 每分钟最多 N 次 */
export const FEEDBACK_CODE_QUERY_MAX = 10;
export const FEEDBACK_CODE_QUERY_WINDOW_SEC = 60;

/** 匿名按 IP 每日计数 key */
export function feedbackAnonRateKey(ip: string, date: string): string {
  return `fb:anon:${ip}:${date}`;
}

/** 登录用户每日计数 key */
export function feedbackUserRateKey(userId: string, date: string): string {
  return `fb:user:${userId}:${date}`;
}

/** 匿名查询码查询限流 key */
export function feedbackCodeQueryKey(ip: string): string {
  return `fb:codeq:${ip}`;
}

/** 今日日期戳 YYYYMMDD */
export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 匿名 token → sha256 hex（单一事实源：feedback.service 与附件归属校验共用，禁止各自实现） */
export function hashAnonToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 图片附件允许 MIME 白名单（魔数校验在 service 复核） */
export const FEEDBACK_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** 文档附件允许 MIME 白名单 */
export const FEEDBACK_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

/** 图纸附件允许扩展名（小写，含点） */
export const FEEDBACK_DRAWING_EXTENSIONS = ['.mxweb', '.dwg', '.dxf'] as const;

/**
 * 图片魔数校验（防伪造扩展名）：jpg/png/webp/gif 校验头部字节。
 * 与 mimetype 白名单双保险——仅信 mimetype 会被伪造扩展名绕过。
 */
export function isImageMagicValid(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === 'image/gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}
