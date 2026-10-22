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
  /** 子分组标识（对齐后端 subgroup 字段；文案由前端 i18n 提供） */
  subgroup?: string;
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
  /** 开关依赖声明：本项为 true 时列出的配置项必须同为 true（对齐后端 requires） */
  requires?: string[];
}

/** 单个依赖项的满足状态（检查手段②：开关依赖状态在配置页可见） */
export interface DependencyStatus {
  /** 依赖项的 key */
  key: string;
  /** 展示名（依赖项的中文说明，缺失时退回 key） */
  label: string;
  /** 依赖是否满足（依赖项生效值为 true） */
  satisfied: boolean;
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

/** 分类内的子分组小节（项数多的大类按子分组拆小节，避免一屏翻找） */
export interface ConfigSubgroup {
  /** 子分组 slug（与后端 subgroup 字段一致）；空串 = 未声明子分组的项，不渲染小节标题 */
  subgroup: string;
  label: string;
  items: ConfigItem[];
}

/** 分组视图模型 */
export interface ConfigGroup {
  category: string;
  label: string;
  icon: LucideIcon;
  /** 全部分组内项（按展示顺序拼接），计数 / 分类批量恢复用它 */
  items: ConfigItem[];
  /** 子分组小节；空数组 = 该分类无子分组，直接平铺 items */
  subgroups: ConfigSubgroup[];
  modifiedCount: number;
}

/**
 * 通道状态视图模型（对齐后端 ChannelStatusDto，ADR-0082 #494/#496）。
 * 通道 = 一组配置项 + 一个开关 + 一个测试动作 + 一组依赖边；
 * 开启开关要求「配置完整 + 测试通过」，配置项变更使验证记录失效。
 */
export interface ChannelStatus {
  /** 通道名（与后端 channel 标记、测试动作注册名一致） */
  channel: string;
  /** 配置完整：必填项（非 allowNull）生效值非空 */
  configComplete: boolean;
  /** 缺失的必填键（configComplete 为 true 时为空数组） */
  missingKeys: string[];
  /** 是否通过通道测试（存在验证记录） */
  verified: boolean;
  /** 上次测试通过时间（未验证为 null） */
  verifiedAt?: string | null;
  /** 上次测试操作者（未验证为 null） */
  testedBy?: string | null;
}

/**
 * 草稿值：布尔取布尔，其余（含数字与 JSON）保留用户原文。
 * 数字保留原文是为了避免输入中间态（空串、"1."）被 `Number()` 转成 NaN 后无法回退。
 */
export type DraftValue = string | boolean;
