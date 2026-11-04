/**
 * 运行时配置的**分类 / 子分组 / 通道词表**（单一事实源）。
 *
 * 这是「配置定义表（backend constants）与前端展示元数据（RuntimeConfigPage/meta.ts）
 * 两套词表靠约定对齐、无编译期校验」的收敛：分类/子分组/通道的取值集合收进本包，
 * 后端定义表与前端元数据表都从这里派生类型，两端词表不再各自声明字面量。
 *
 * 准入（ADR-0069 纯函数契约）：纯数据、无 IO、无框架、无副作用。
 * 展示元数据（i18n 文案 label / React 图标 icon / 通道验证描述）**不**收进本包——
 * 它们绑定 i18n 运行时与 React，留在各自消费端，但键类型必须满足本词表。
 *
 * 约束（勿违反）：
 * - 只登记**当前定义表实际使用**的取值；新增分类/子分组/通道必须同时：
 *   ①在此登记；②backend runtime-config.constants.ts 用其做 category/subgroup/channel；
 *   ③frontend meta.ts 的对应元数据表补齐条目（类型化 Record 使缺失即编译错误）。
 * - 删取值必须三处同步删除，否则对应侧编译报错。
 */
export const RUNTIME_CONFIG_CATEGORIES = [
  'brand',
  'account',
  'file',
  'billing',
  'alert',
  'security',
  'audit',
  'maintenance',
  'backup',
  'collaboration',
] as const;

export type RuntimeConfigCategory = (typeof RUNTIME_CONFIG_CATEGORIES)[number];

export const RUNTIME_CONFIG_SUBGROUPS = [
  'mode-mfa',
  'password-policy',
  'rate-limit',
  'account-lock',
  'login-methods',
  'registration',
  'storage-trash',
  'cache-disk',
  'data-retention',
  'mail-channel',
  'sms-channel',
  'webhook-channel',
  'alert-policy',
] as const;

export type RuntimeConfigSubgroup = (typeof RUNTIME_CONFIG_SUBGROUPS)[number];

export const RUNTIME_CONFIG_CHANNELS = [
  'mail',
  'sms',
  'wechat',
  'payment',
  'webhook',
] as const;

export type RuntimeConfigChannel = (typeof RUNTIME_CONFIG_CHANNELS)[number];
