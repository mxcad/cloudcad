/**
 * 相对时间——跨端共享的纯计算。
 *
 * 把「目标时间相对 now 的间隔」算成 tier + unit + value（纯结构），
 * i18n 文案（「刚刚」「X分钟前」等）留端包按结果映射。
 *
 * 过去 PC `dateUtils.getRelativeTime`（4 档 + 回落绝对日期）、
 * PC `fileUtils.formatRelativeTime`（8 档含昨天/周/月/年）、
 * 移动端 `useNodeFormatter.formatTime`（<24h 走 HH:MM 时钟）三份口径不一。
 * 这里统一：粒度取 分/时/天/周/月/年，<60s→just_now，弃掉时钟档与「昨天」特例，
 * 未来/负值归 just_now（不出现负数）。
 */
export type RelativeTimeUnit =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

export type RelativeTimeResult =
  | { tier: 'just_now' }
  | { tier: 'amount'; unit: RelativeTimeUnit; value: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function relativeTime(
  input: string | number | Date,
  now?: number | Date
): RelativeTimeResult {
  const nowMs = now !== undefined ? new Date(now).getTime() : Date.now();
  const targetMs = new Date(input).getTime();
  const diffSec = Math.floor((nowMs - targetMs) / 1000);

  if (diffSec < MINUTE) return { tier: 'just_now' };
  if (diffSec < HOUR)
    return { tier: 'amount', unit: 'minute', value: Math.floor(diffSec / MINUTE) };
  if (diffSec < DAY)
    return { tier: 'amount', unit: 'hour', value: Math.floor(diffSec / HOUR) };
  if (diffSec < WEEK)
    return { tier: 'amount', unit: 'day', value: Math.floor(diffSec / DAY) };
  if (diffSec < MONTH)
    return { tier: 'amount', unit: 'week', value: Math.floor(diffSec / WEEK) };
  if (diffSec < YEAR)
    return { tier: 'amount', unit: 'month', value: Math.floor(diffSec / MONTH) };
  return { tier: 'amount', unit: 'year', value: Math.floor(diffSec / YEAR) };
}
