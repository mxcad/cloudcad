///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页的视图模型（纯类型，无运行时依赖）。
 *
 * 为什么不直接 `extends` SDK 的 `RuntimeConfigResponseDto`：后端一次改造给 DTO
 * 扩了 9 个字段（defaultValue/source/isModified/envValue/tier/input/impact/dangerous/
 * hot），SDK 由并行任务重生成。视图模型若继承 SDK 类型，在 SDK 重生成前后两个
 * 时间窗里都会编译不过。这里定义自足视图模型，由 `meta.ts` 的 mapper 承接 SDK 响应。
 */

import type { LucideIcon } from 'lucide-react';

/** 配置值（对齐后端 RuntimeConfigValue） */
export type ConfigValue =
  | string
  | number
  | boolean
  | Record<string, unknown>;

/** 值类型 */
export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json';

/** 生效来源：运行时配置 > 环境变量 > 代码默认值 */
export type ConfigSource = 'runtime' | 'env' | 'default';

/** 展示档位（只做展示分层与危险确认，不引入权限门控） */
export type ConfigTier = 'user' | 'admin' | 'advanced';

/** 枚举型配置的可选项 */
export interface ConfigEnumOption {
  value: string;
  label: string;
}

/** 输入控件元数据（对齐后端 ConfigInputMeta，两端共用同一份事实源） */
export interface ConfigInputMeta {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: ConfigEnumOption[];
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
  secret?: boolean;
  allowNull?: boolean;
}

/** 配置项视图模型 */
export interface ConfigItem {
  key: string;
  value: ConfigValue;
  type: ConfigValueType;
  category: string;
  description?: string | null;
  isPublic: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
  defaultValue?: ConfigValue;
  source?: ConfigSource;
  isModified?: boolean;
  envValue?: ConfigValue | null;
  tier?: ConfigTier;
  input?: ConfigInputMeta;
  impact?: string;
  dangerous?: boolean;
  hot?: boolean;
}

/** 修改历史条目（对齐后端 RuntimeConfigHistoryDto） */
export interface ConfigHistoryEntry {
  id: string;
  key: string;
  oldValue?: string | null;
  newValue: string;
  operatorId?: string | null;
  operatorIp?: string | null;
  createdAt: string | Date;
}

/** 分组视图模型 */
export interface ConfigGroup {
  category: string;
  label: string;
  icon: LucideIcon;
  items: ConfigItem[];
  modifiedCount: number;
}

/**
 * 草稿值：布尔取布尔，其余（含数字与 JSON）保留用户原文。
 * 数字保留原文是为了避免输入中间态（空串、"1."）被 `Number()` 转成 NaN 后无法回退。
 */
export type DraftValue = string | boolean;
