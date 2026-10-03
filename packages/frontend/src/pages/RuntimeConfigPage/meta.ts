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
  Mail,
  Smartphone,
  FileText,
  Users,
  Cpu,
  MessageCircle,
  HardDrive,
  CreditCard,
  Share2,
  Shield,
  ClipboardList,
  BellRing,
  DatabaseBackup,
} from 'lucide-react';
import { t } from '@/languages';
import type {
  ConfigHistoryEntry,
  ConfigItem,
  ConfigSource,
  ConfigTier,
  ConfigValue,
  ConfigValueType,
  ConfigInputMeta,
} from './types';

/** 分类元数据：显示名 + 图标。只登记实际有配置项的分类（后端已合并的碎分类不留空壳入口）。
 * 标签必须复用已登记的 i18n 文案：未登记的中文串在非中文 locale 下会原样回落成中文。 */
export const CATEGORY_META: Record<
  string,
  { label: string; icon: LucideIcon }
> = {
  brand: { label: t('品牌与客服'), icon: Palette },
  mail: { label: t('邮件配置'), icon: Mail },
  sms: { label: t('短信配置'), icon: Smartphone },
  file: { label: t('文件配置'), icon: FileText },
  user: { label: t('用户管理'), icon: Users },
  system: { label: t('系统配置'), icon: Cpu },
  wechat: { label: t('微信配置'), icon: MessageCircle },
  storage: { label: t('存储配置'), icon: HardDrive },
  billing: { label: t('配额配置'), icon: CreditCard },
  collaboration: { label: t('协同配置'), icon: Share2 },
  security: { label: t('安全配置'), icon: Shield },
  audit: { label: t('审计配置'), icon: ClipboardList },
  alert: { label: t('告警配置'), icon: BellRing },
  backup: { label: t('备份配置'), icon: DatabaseBackup },
};

/** 分类展示顺序（按 CATEGORY_META 声明顺序，缺省分类追加在末尾） */
export const CATEGORY_ORDER: string[] = Object.keys(CATEGORY_META);

/** 后端新增分类未登记时的图标回退（标签直接用分类 key） */
export const FALLBACK_CATEGORY_META: { label: string; icon: LucideIcon } =
  CATEGORY_META.system ?? { label: '系统配置', icon: Shield };

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
