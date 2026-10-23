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

/** 后端新增分类未登记时的图标回退（标签回落为分类 slug，见 useRuntimeConfig 的分组装配） */
export const FALLBACK_CATEGORY_META: { icon: LucideIcon } = {
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

/**
 * 来源徽标文案：三态即「这一项的值归谁管」，用运营人员能懂的词，不暴露 env /
 * runtime 之类的实现层名词。与独立的「已修改」徽标合并后，颜色语义保持不变
 * （warning=已偏离出厂、info=部署期预置、neutral=出厂状态）。
 */
export const SOURCE_LABEL: Record<ConfigSource, string> = {
  runtime: t('已修改'),
  env: t('系统预置'),
  default: t('出厂默认'),
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

/**
 * 通道验证元数据（ADR-0082 D4）：后端各通道的验证动作能力不同，
 * 前端必须按通道如实呈现，不能都按邮件口径渲染。
 * - mail / sms：默认只做无副作用探测（留空接收方）；显式填写接收方则额外真实
 *   发送一条（邮件一封 / 短信一条，会产生短信费用）；
 * - wechat / payment：只做无副作用探测（微信 gettoken / 支付签名往返），不接收方；
 * - webhook：向已配置的 URL 发一次 POST，接收方就是 URL。
 * 新增通道时在此登记；未登记的走 FALLBACK_CHANNEL_TEST_META。
 */
export type ChannelTestMeta =
  | {
      /** 该通道的验证动作是否读取「接收方」输入（决定是否渲染输入框） */
      acceptsRecipient: true;
      /** 接收方输入框标签 */
      recipientLabel: string;
      /** 接收方占位提示，须说清留空的语义 */
      recipientPlaceholder: string;
      /** 说明本次验证实际会做什么 */
      description: string;
    }
  | {
      /** 该通道的验证动作是否读取「接收方」输入（决定是否渲染输入框） */
      acceptsRecipient: false;
      /** 说明本次验证实际会做什么 */
      description: string;
    };

export const CHANNEL_TEST_META: Record<string, ChannelTestMeta> = {
  mail: {
    acceptsRecipient: true,
    recipientLabel: t('收件人（可选）'),
    recipientPlaceholder: t('留空则只校验连接与认证，不发送邮件'),
    description: t(
      '将校验 SMTP 连接与认证；填写收件人则额外发送一封测试邮件。'
    ),
  },
  sms: {
    acceptsRecipient: true,
    recipientLabel: t('手机号（可选）'),
    recipientPlaceholder: t('留空则只探测凭据，不发送短信'),
    description: t(
      '将校验短信凭据；填写手机号则额外发送一条测试短信（产生一条短信费用）。'
    ),
  },
  wechat: {
    acceptsRecipient: false,
    description: t('验证只调用微信凭据探测接口，不会向任何人发送消息。'),
  },
  payment: {
    acceptsRecipient: false,
    description: t('验证只做支付网关签名往返验证，不产生订单、不扣费。'),
  },
  webhook: {
    acceptsRecipient: false,
    description: t('验证将向已配置的 Webhook URL 发送一次 POST 请求。'),
  },
};

/** 未登记通道的验证元数据：不猜测接收方语义（不渲染输入框） */
export const FALLBACK_CHANNEL_TEST_META: ChannelTestMeta = {
  acceptsRecipient: false,
  description: t('验证将校验当前通道的配置是否可用。'),
};

/** 通道验证元数据（未登记通道回落 FALLBACK_CHANNEL_TEST_META） */
export function channelTestMeta(channel: string): ChannelTestMeta {
  return CHANNEL_TEST_META[channel] ?? FALLBACK_CHANNEL_TEST_META;
}

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

/** 配置项 DOM 锚点 id（缺失键跳转定位用它；ConfigItemRow 渲染同一个 id） */
export function configItemId(key: string): string {
  return `rc-config-item-${key}`;
}

/** 缺失键的展示信息：中文说明 + 格式示例（缺失键清单、测试对话框共用） */
export interface MissingKeyHint {
  key: string;
  /** 中文说明（定义表 description）；索引未命中时回落键名 */
  label: string;
  /** 填写格式示例（定义表 input.placeholder）；无示例为空串 */
  example: string;
}

/**
 * 把通道缺失键清单翻译成可行动的提示。
 * 通道卡的缺失键和配置列表同属一个 key 空间，此处按 key 查出中文说明与格式示例，
 * 索引未命中（后端刚新增键、列表未刷新）时回落键名，不猜测格式。
 */
export function missingKeyHints(
  keys: string[],
  configsByKey: Map<string, ConfigItem>
): MissingKeyHint[] {
  return keys.map((key) => {
    const item = configsByKey.get(key);
    return {
      key,
      label: item?.description || key,
      example: item?.input?.placeholder ?? '',
    };
  });
}
