///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 配置值本地校验（纯函数，无副作用）。
 *
 * 前端校验是体验优化，不是安全边界——后端 validateValue 独立校验同一份 input 元数据，
 * 这里只是把 400 提前到点击保存之前。两端共用后端 `ConfigInputMeta` 作为事实源。
 *
 * 草稿统一以 `string | boolean` 存放：数字输入保留用户原文（避免输入中间态变成 NaN），
 * 提交时才经 `Number()` 转换并校验。
 */

import { t } from '@/languages';
import type { ConfigItem, ConfigValue, DraftValue } from './types';

export type { DraftValue };

export interface DraftOutcome {
  valid: boolean;
  /** valid 为 false 时的原因（已本地化） */
  message?: string;
  /** valid 为 true 时可提交的值 */
  value?: ConfigValue;
}

/** 取某项的初始草稿：布尔取当前值，其余取当前值的文本表示 */
export function defaultDraftOf(item: ConfigItem): DraftValue {
  const value = item.value;
  if (item.type === 'boolean') {
    return value === true;
  }
  if (item.type === 'json') {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return '';
    }
  }
  return value === null || value === undefined ? '' : String(value);
}

/** 解析 JSON 草稿；失败或不是纯对象时返回 null */
export function parseJsonDraft(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 把 JSON 文本美化（保留原内容的语义）；不可解析时原样返回 */
export function prettyJson(text: string): string {
  const parsed = parseJsonDraft(text);
  if (parsed === null) return text;
  return JSON.stringify(parsed, null, 2);
}

/**
 * 校验并把草稿转成可提交值。
 * 顺序：类型 → 必填 → 长度 → 范围 → 枚举 → JSON 合法性。
 */
export function toSubmitValue(
  item: ConfigItem,
  draft: DraftValue
): DraftOutcome {
  const meta = item.input;

  // ── 布尔：开关控件只产出布尔，直接透传 ──
  if (item.type === 'boolean') {
    if (typeof draft !== 'boolean') {
      return { valid: false, message: t('值必须是布尔值') };
    }
    return { valid: true, value: draft };
  }

  const text = String(draft ?? '');
  const trimmed = text.trim();

  // ── 空值：字符串留空是合法取值（后端接受空串），其余类型由各自分支拦截；
  //    「回到默认值」走恢复默认按钮，不靠留空表达 ──
  if (trimmed === '' && !meta?.allowNull && item.type !== 'string') {
    return { valid: false, message: t('该项不能为空') };
  }

  // ── JSON：必须是对象字面量（后端只接受对象，不接受数组） ──
  if (item.type === 'json') {
    if (trimmed === '' && meta?.allowNull) {
      return { valid: true, value: {} };
    }
    const parsed = parseJsonDraft(trimmed);
    if (parsed === null) {
      return {
        valid: false,
        message: t('JSON 格式不合法，或顶层必须是对象'),
      };
    }
    return { valid: true, value: parsed };
  }

  // ── 数字：必须是有限数且在范围内 ──
  if (item.type === 'number') {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return { valid: false, message: t('必须是数字') };
    }
    if (meta?.min !== undefined && num < meta.min) {
      return {
        valid: false,
        message: t('不能小于 {min}{unit}', {
          min: String(meta.min),
          unit: meta.unit ?? '',
        }),
      };
    }
    if (meta?.max !== undefined && num > meta.max) {
      return {
        valid: false,
        message: t('不能大于 {max}{unit}', {
          max: String(meta.max),
          unit: meta.unit ?? '',
        }),
      };
    }
    return { valid: true, value: num };
  }

  // ── 字符串：长度上限 ──
  if (meta?.maxLength !== undefined && text.length > meta.maxLength) {
    return {
      valid: false,
      message: t('不能超过 {n} 个字符', { n: String(meta.maxLength) }),
    };
  }

  // ── 枚举：取值必须在 options 内（留空允许清空） ──
  if (trimmed !== '' && meta?.options && meta.options.length > 0) {
    const inOptions = meta.options.some((option) => option.value === trimmed);
    if (!inOptions) {
      return {
        valid: false,
        message: t('仅支持：{options}', {
          options: meta.options.map((o) => o.value).join(' / '),
        }),
      };
    }
  }

  return { valid: true, value: text };
}
