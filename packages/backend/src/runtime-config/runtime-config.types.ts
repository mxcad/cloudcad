///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置值类型。
 * `json` 用于结构化配置（如品牌档案整块存储），落库仍为 String（JSON 序列化）。
 */
export type RuntimeConfigValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json';

/** 结构化配置值（json 类型） */
export type RuntimeConfigJsonValue = Record<string, unknown>;

/** 运行时配置值的完整联合类型 */
export type RuntimeConfigValue =
  | string
  | number
  | boolean
  | RuntimeConfigJsonValue;

/**
 * 运行时配置分类
 */
export type RuntimeConfigCategory =
  | 'brand'
  | 'mail'
  | 'sms'
  | 'support'
  | 'file'
  | 'user'
  | 'system'
  | 'wechat'
  | 'storage'
  | 'billing'
  | 'device'
  | 'collaboration'
  | 'quota'
  | 'cache'
  | 'session'
  | 'pagination'
  | 'security'
  | 'performance'
  | 'audit'
  | 'alert'
  | 'backup'
  | 'logging';

/**
 * 配置项显示层级：决定在前端管理页的可见档位。
 * - `user`：客户运维即可安全修改（品牌、客服、注册开关、上传上限等）
 * - `admin`：需要一定系统理解（限流、密码策略、配额、功能开关）
 * - `advanced`：需要懂系统内部（并发、超时、缓存 TTL、清理 cron、文件限制细节）
 *
 * 层级只做展示分档与危险确认，**不引入新的权限位**：
 * 能进运行时配置页的人已持有 SYSTEM_CONFIG_READ/WRITE。
 */
export type ConfigTier = 'user' | 'admin' | 'advanced';

/** 配置值的生效来源 */
export type ConfigValueSource = 'runtime' | 'env' | 'default';

/** 枚举型配置的可选项 */
export interface ConfigEnumOption {
  value: string;
  label: string;
}

/**
 * 类型感知的输入控件元数据。
 * 前端据此渲染开关/数字框（带 min/max/step/单位）/下拉/多行文本/遮罩输入，
 * 后端 `set()` 据此做范围校验，两端共用同一份事实源。
 */
export interface ConfigInputMeta {
  /** 数字下限 */
  min?: number;
  /** 数字上限 */
  max?: number;
  /** 数字步长 */
  step?: number;
  /** 单位（MB / ms / s / 小时 / 天 / 次 等），前端在输入框旁展示 */
  unit?: string;
  /** 枚举可选项（存在时前端渲染下拉，后端校验取值合法性） */
  options?: ConfigEnumOption[];
  /** 字符串最大长度 */
  maxLength?: number;
  /** 多行文本 */
  multiline?: boolean;
  /** 占位提示 */
  placeholder?: string;
  /** 输入时遮罩（如告警收件人邮箱列表） */
  secret?: boolean;
  /** 允许空值（清空回到默认值语义） */
  allowNull?: boolean;
}

/**
 * 运行时配置项定义
 */
export interface RuntimeConfigDefinition {
  key: string;
  type: RuntimeConfigValueType;
  category: RuntimeConfigCategory;
  description: string;
  defaultValue: RuntimeConfigValue;
  isPublic: boolean;

  /** 显示层级，缺省视为 `admin` */
  tier?: ConfigTier;
  /** 输入控件元数据（含范围校验） */
  input?: ConfigInputMeta;
  /** 影响说明：改了会怎样，面向操作员，比 description 更具体 */
  impact?: string;
  /** 危险项：改动需二次确认 */
  dangerous?: boolean;
  /** 改动是否即时生效；`false` 表示需刷新页面或重启服务才完全生效 */
  hot?: boolean;
  /** 底层 env 变量名：作为部署期默认值层，优先于代码默认值、次于运行时配置 */
  envKey?: string;
  /**
   * env 层兼容别名（按顺序取第一个已设置的值）。用于历史部署已用旧变量名的配置项，
   * 避免迁移后静默回滚到代码默认值（存量合规配置被悄悄收紧）。
   */
  envAliases?: string[];
}

/**
 * 运行时配置项（API 返回格式）
 */
export interface RuntimeConfigItem {
  key: string;
  value: RuntimeConfigValue;
  type: RuntimeConfigValueType;
  category: RuntimeConfigCategory;
  description: string | null;
  isPublic: boolean;
  updatedBy: string | null;
  updatedAt: Date;

  /** 定义默认值（与当前值对比用） */
  defaultValue?: RuntimeConfigValue;
  /** 当前值来源 */
  source?: ConfigValueSource;
  /** 是否被显式修改过（区别于安装时写入的默认行） */
  isModified?: boolean;
  /** env 层当前值（若 envKey 有设置） */
  envValue?: RuntimeConfigValue | null;
  /** 显示层级 */
  tier?: ConfigTier;
  /** 输入控件元数据 */
  input?: ConfigInputMeta;
  /** 影响说明 */
  impact?: string;
  /** 危险项标记 */
  dangerous?: boolean;
  /** 即时生效标记 */
  hot?: boolean;
}

/**
 * 配置修改历史记录（来自 runtime_config_logs 表）
 */
export interface RuntimeConfigHistoryEntry {
  id: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  operatorId: string | null;
  operatorIp: string | null;
  createdAt: Date;
}
