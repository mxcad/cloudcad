///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { t } from '@/languages';

/**
 * 日期工具函数
 */

/**
 * 格式化日期时间为本地字符串
 */
export function formatDateTime(date: string | Date | number): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  if (isNaN(d.getTime())) {
    return '-';
  }

  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化日期时间为本地字符串（含秒）
 */
export function formatDateTimeWithSeconds(
  date: string | Date | number
): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化日期为本地字符串
 */
export function formatDate(date: string | Date | number): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  if (isNaN(d.getTime())) {
    return '-';
  }

  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 格式化时间为本地字符串
 */
export function formatTime(date: string | Date | number): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  if (isNaN(d.getTime())) {
    return '-';
  }

  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 获取相对时间描述
 */
export function getRelativeTime(date: string | Date | number): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return t('刚刚');
  } else if (minutes < 60) {
    return minutes + t('分钟前');
  } else if (hours < 24) {
    return hours + t('小时前');
  } else if (days < 30) {
    return days + t('天前');
  } else {
    return formatDate(d);
  }
}

/**
 * 将 yyyy-MM-dd 日期字符串转成本地零点对应的 ISO 字符串
 * （DatePicker value 回显用：date-only 字符串经 new Date() 按 UTC 零点解析，
 *  在 UTC- 时区会偏差一天，先按本地零点归一化保证显示正确）
 */
export function dateOnlyToIso(dateOnly?: string): string | undefined {
  if (!dateOnly) return undefined;
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(y, m - 1, d).toISOString();
}

/**
 * 将 ISO 字符串截取为 yyyy-MM-dd
 * （DatePicker 选中输出当天 23:59:59.999，调用方需转回 date-only
 *  以保持与后端/既有筛选契约一致）；空值返回 ''
 */
export function isoToDateOnly(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

/** 本地今天零点对应的 ISO 字符串（DatePicker minDate 用，避免 UTC 日期偏差） */
export function todayStartIso(): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
}
