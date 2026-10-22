///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页的展示元数据与响应映射。
 *
 * `toConfigItems` / `toHistoryEntries` 是唯一承接 SDK 响应的入口：把可能缺字段的
 * 响应（老 SDK / 灰度期后端）归一化成视图模型，缺失字段一律给安全默认值，
 * 让页面不依赖后端是否已回填新字段。
 */

import type { LucideIcon } from 'lucide-react';
import {
  Palette,
  FileText,
  Users,
  CreditCard,
  Share2,
  Shield,
  ClipboardList,
  BellRing,
  DatabaseBackup,
  Wrench,
} from 'lucide-react';
import { t } from '@/languages';
import type {
  ChannelStatus,
  ConfigHistoryEntry,
  ConfigItem,
  ConfigSource,
  ConfigSubgroup,
  ConfigTier,
  ConfigValue,
  ConfigValueType,
  ConfigInputMeta,
} from './types';

/** 分类元数据：显示名 + 图标。只登记实际有配置项的 10 个任务分类
 *（#498 重划后 mail/sms/wechat/user/system/storage 六个碎分类已并入，不留空壳入口）。
 * 标签必须复用已登记的 i18n 文案：未登记的中文串在非中文 locale 下会原样回落成中文。 */
export const CATEGORY_META: Record<
  string,
  { label: string; icon: LucideIcon }
> = {
  brand: { label: t('品牌与客服'), icon: Palette },
  account: { label: t('账号与登录'), icon: Users },
  file: { label: t('文件配置'), icon: FileText },
  billing: { label: t('配额配置'), icon: CreditCard },
  alert: { label: t('告警配置'), icon: BellRing },
  security: { label: t('安全策略'), icon: Shield },
  audit: { label: t('审计配置'), icon: ClipboardList },
  maintenance: { label: t('自动任务与清理'), icon: Wrench },
  backup: { label: t('备份配置'), icon: DatabaseBackup },
  collaboration: { label: t('协同配置'), icon: Share2 },
};

/** 分类展示顺序（按 CATEGORY_META 声明顺序，缺省分类追加在末尾） */
export const CATEGORY_ORDER: string[] = Object.keys(CATEGORY_META);

/** 后端新增分类未登记时的图标回退（标签直接用分类 key） */
export const FALLBACK_CATEGORY_META: { label: string; icon: LucideIcon } = {
  label: '系统配置',
  icon: Shield,
};

/** 子分组显示名（稳定 slug → i18n 文案；通道三组复用通道状态卡的既有文案） */
export const SUBGROUP_META: Record<string, { label: string }> = {
  'mode-mfa': { label: t('模式与双因素') },
  'password-policy': { label: t('口令策略') },
  'rate-limit': { label: t('限流') },
  'account-lock': { label: t('账号锁定') },
  'login-methods': { label: t('登录方式开关') },
  registration: { label: t('注册与验证策略') },
  'storage-trash': { label: t('存储与回收站') },
  'cache-disk': { label: t('缓存与磁盘') },
  'data-retention': { label: t('数据与记录留存') },
  'mail-channel': { label: t('邮件通道') },
  'sms-channel': { label: t('短信通道') },
  'webhook-channel': { label: t('Webhook 通道') },
  'alert-policy': { label: t('告警策略') },
};

/** 分类内子分组的小节顺序（未登记的子分组追加在末尾，按 slug 升序） */
export const SUBGROUP_ORDER: Record<string, string[]> = {
  security: ['mode-mfa', 'password-policy', 'rate-limit', 'account-lock'],
  account: ['login-methods', 'registration'],
  maintenance: ['storage-trash', 'cache-disk', 'data-retention'],
  alert: ['mail-channel', 'sms-channel', 'webhook-channel', 'alert-policy'],
};

/**
 * 把分类内已排序的项拆成子分组小节。
 * 分类内没有任何项声明 subgroup 时返回空数组（页面按平铺渲染）；
 * 未声明 subgroup 的项归入空串小节排在最前、不渲染小节标题。
 */
export function buildSubgroupSections(
  category: string,
  items: ConfigItem[]
): ConfigSubgroup[] {
  if (!items.some((item) => item.subgroup)) return [];
  const bySubgroup = new Map<string, ConfigItem[]>();
  for (const item of items) {
    const slug = item.subgroup ?? '';
    const list = bySubgroup.get(slug) ?? [];
    list.push(item);
    bySubgroup.set(slug, list);
  }
  const declared = SUBGROUP_ORDER[category] ?? [];
  const rank = (slug: string) => {
    if (slug === '') return -1;
    const index = declared.indexOf(slug);
    return index === -1 ? 1000 : index;
  };
  return [...bySubgroup.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((slug) => ({
      subgroup: slug,
      label: SUBGROUP_META[slug]?.label ?? slug,
      items: bySubgroup.get(slug)!,
    }));
}

/** 档位徽标文案 */
export const TIER_LABEL: Record<ConfigTier, string> = {
  user: t('基础项'),
  admin: t('管理项'),
  advanced: t('高级项'),
};

/** 来源徽标文案 */
export const SOURCE_LABEL: Record<ConfigSource, string> = {
  runtime: t('运行时修改'),
  env: t('环境变量'),
  default: t('代码默认值'),
};

/** 归一化配置项列表（SDK 响应 → 视图模型） */
export function toConfigItems(raw: unknown): ConfigItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = (row ?? {}) as Record<string, unknown>;
    return {
      key: String(o.key ?? ''),
      value: (o.value ?? null) as ConfigValue,
      type: (o.type ?? 'string') as ConfigValueType,
      category: String(o.category ?? ''),
      subgroup: o.subgroup ? String(o.subgroup) : undefined,
      description: (o.description ?? null) as string | null,
      isPublic: Boolean(o.isPublic),
      updatedBy: (o.updatedBy ?? null) as string | null,
      updatedAt: o.updatedAt as string | null | undefined,
      defaultValue: o.defaultValue as ConfigValue | undefined,
      source: (o.source ?? 'default') as ConfigSource,
      isModified: Boolean(o.isModified),
      envValue: (o.envValue ?? null) as ConfigValue | null,
      tier: (o.tier ?? 'admin') as ConfigTier,
      input: o.input as ConfigInputMeta | undefined,
      impact: o.impact as string | undefined,
      dangerous: Boolean(o.dangerous),
      // 后端 enrichFromDefinition 对未声明 hot 的定义按「即时生效」处理，此处保持一致：
      // 只有显式 hot: false 才标记为「需重启服务」
      hot: o.hot !== false,
      // 开关依赖声明（老 SDK / 灰度期后端可能缺字段，缺失按「无依赖」处理）
      requires: Array.isArray(o.requires)
        ? (o.requires as unknown[]).map(String)
        : undefined,
    };
  });
}

/** 归一化历史响应 */
export function toHistoryEntries(raw: unknown): ConfigHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? ''),
      key: String(o.key ?? ''),
      oldValue: (o.oldValue ?? null) as string | null,
      newValue: String(o.newValue ?? ''),
      operatorId: (o.operatorId ?? null) as string | null,
      operatorIp: (o.operatorIp ?? null) as string | null,
      createdAt: (o.createdAt ?? '') as string | Date,
    };
  });
}

/** 通道显示名（未登记的通道直接用通道名） */
export const CHANNEL_LABEL: Record<string, string> = {
  mail: t('邮件通道'),
  sms: t('短信通道'),
  wechat: t('微信通道'),
  payment: t('支付通道'),
  webhook: t('Webhook 通道'),
};

/** 归一化通道状态列表（SDK 响应 → 视图模型，缺失字段给安全默认值） */
export function toChannelStatuses(raw: unknown): ChannelStatus[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = (row ?? {}) as Record<string, unknown>;
    return {
      channel: String(o.channel ?? ''),
      configComplete: Boolean(o.configComplete),
      missingKeys: Array.isArray(o.missingKeys)
        ? (o.missingKeys as unknown[]).map(String)
        : [],
      verified: Boolean(o.verified),
      verifiedAt: (o.verifiedAt ?? null) as string | null,
      testedBy: (o.testedBy ?? null) as string | null,
    };
  });
}

/** 展示用取值文本（差异对比、历史回看共用） */
export function formatValue(value: ConfigValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
