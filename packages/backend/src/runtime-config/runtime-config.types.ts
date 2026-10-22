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
// 页面分组。历史遗留的 support / device / quota / cache / session / pagination /
// performance / logging 已无定义项（碎分类合并：quota+支付→billing、cache→system、
// device→security、客服并入 brand），从联合类型里删掉，避免类型上仍存在空壳分类。
export type RuntimeConfigCategory =
  | 'brand'
  | 'mail'
  | 'sms'
  | 'file'
  | 'user'
  | 'system'
  | 'wechat'
  | 'storage'
  | 'billing'
  | 'collaboration'
  | 'security'
  | 'audit'
  | 'alert'
  | 'backup';

/**
 * 配置项显示层级：决定在前端管理页的可见档位。
 * - `user`：客户运维即可安全修改（品牌、客服、注册开关、上传上限等）
 * - `admin`：系统管理员的日常运维基线（备份、告警邮件、清理与归档、审计留存、功能开关）
 * - `advanced`：需要懂系统内部才敢改的阈值（各接口限流、账号锁定、压缩级别、文件锁参数）
 *
 * 前端默认**整档收起 advanced**，所以运维要日常碰的项必须放 admin——放错档等于
 * 「配置页里看不见」，用户会以为缺了配置项。
 *
 * 层级只做展示分档与二次确认的提示，**不引入新的权限位**：
 * 能进运行时配置页的人已持有 SYSTEM_CONFIG_READ/WRITE。
 */
export type ConfigTier = 'user' | 'admin' | 'advanced';

/** 配置值的生效来源 */
export type ConfigValueSource = 'runtime' | 'env' | 'default';

/**
 * 安全模式 profile 名称。
 * - `secure`：完全遵循等保三级
 * - `normal`：本地/测试部署，便利高于一切
 */
export type ConfigProfile = 'secure' | 'normal';

/** profile 取值表：声明则两个 profile 都必须给出 */
export type ConfigProfiles = Record<ConfigProfile, RuntimeConfigValue>;

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

  /**
   * 安全模式 / 普通模式的目标取值表（ADR-0077）。
   *
   * 声明后该 key 参与 profile 批量应用：切换到某 profile 时，其目标值被写入
   * `value` 并记 `updatedBy`（覆盖用户已手工修改的值，ADR-0077 D5）。
   * 声明则 `secure` 与 `normal` 两个目标值都必须给出——只给一个会在切换到
   * 「没给的那个」时静默不动作，等价于把偏离项藏起来。
   * 未声明 `profiles` 的 key 不受 profile 影响。
   */
  profiles?: ConfigProfiles;

  /**
   * 开关依赖声明（ADR-0082）：本 key 为 `true` 时，列出的 key 必须同为 `true`，
   * 否则是「功能开着、它依赖的服务关着」的静默失效状态。
   *
   * 只在布尔键之间声明（如 `requireEmailVerification → mailEnabled`）。更新路径
   * （单键 set / 重置 / profile 批量应用）按拒绝式门禁强制：开启依赖方而依赖项未开
   * → 拒绝；关闭仍被依赖的项 → 拒绝。已存在的遗留不一致由一致性检测上报，
   * 门禁只拦「新制造」的。
   */
  requires?: string[];

  /**
   * 通道配置项标记（ADR-0082 D4/D6）：本 key 是哪个通道的配置项（凭据/参数，
   * 如 SMTP 主机/端口/口令）。通道 = 一组配置项 + 一个开关 + 一个测试动作 +
   * 一组依赖边；本标记只覆盖「一组配置项」：
   * - 配置完整性判定：该通道全部配置项中必填项（非 `input.allowNull`）生效值非空；
   * - 验证失效：任一配置项被更新/重置/profile 改写 → 删除该通道验证记录
   *   （开关本身变化不算——凭据没变，验证仍有效）。
   *
   * 通道名须与通道测试动作（`ChannelTestAction.channel`）注册名一致。
   */
  channel?: string;

  /**
   * 通道开关标记（ADR-0082 D4）：本 key 是哪个通道的开/关开关（如 `mailEnabled`
   * 之于邮件通道）。开启门禁：本 key 被置为 `true` 时（set / 重置回 `true` 默认 /
   * profile 批量应用），须该通道「配置完整 + 通道测试通过」，否则拒绝——
   * 通道没验证过，开关就开不了。
   *
   * 与 `channel` 分开标记：布尔配置项（如 SMTP TLS 开关）是配置项不是开关，
   * 置 `true` 不应触发开启门禁。
   */
  channelSwitch?: string;
}

/**
 * profile 预览条目：一项将受 profile 应用影响的配置。
 * 预览与实际应用共用同一套判定（见 `RuntimeConfigService.previewProfileApply`），
 * 保证预览展示的「将改动项」与实际写入集合完全一致。
 */
export interface RuntimeProfilePreviewEntry {
  key: string;
  type: RuntimeConfigValueType;
  category: RuntimeConfigCategory;
  /** 当前生效值（含 env 遮蔽后的实际生效值） */
  currentValue: RuntimeConfigValue;
  /** 当前值来源 */
  source: ConfigValueSource;
  /** 本次应用的目标值 */
  targetValue: RuntimeConfigValue;
  /** 本次应用是否会改写该项 */
  willChange: boolean;
  /** 该值曾被人工修改过（`updatedBy` 非空） */
  isModified: boolean;
  /** env 层当前值；非 null 表示本 key 有 env 层值，profile 写入后 env 不再决定生效值 */
  envValue: RuntimeConfigValue | null;
}

/** profile 应用结果 */
export interface RuntimeProfileApplyResult {
  /** 应用的 profile 名称 */
  profile: ConfigProfile;
  /** 实际写入的 key */
  applied: string[];
  /** 值已等于目标值而跳过的 key */
  unchanged: string[];
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
  /** 开关依赖声明（依赖的 key 列表，见 RuntimeConfigDefinition.requires） */
  requires?: string[];
  /** 通道配置项标记（见 RuntimeConfigDefinition.channel） */
  channel?: string;
  /** 通道开关标记（见 RuntimeConfigDefinition.channelSwitch） */
  channelSwitch?: string;
}

/**
 * 开关依赖违规：依赖方（dependent）为开、其依赖项（required）为关。
 * 「新制造」的违规由更新路径门禁拒绝；已存在的遗留违规由一致性检测上报。
 */
export interface ConfigDependencyViolation {
  /** 依赖方 key（功能开关，如 requireEmailVerification） */
  dependent: string;
  /** 被依赖的 key（通道/服务开关，如 mailEnabled） */
  required: string;
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

/**
 * 通道状态（ADR-0082 D4）：配置完整度 + 验证记录。
 * 通道开关只有在 `configComplete && verified` 时才允许开启。
 */
export interface ChannelStatus {
  /** 通道名（与定义表 `channel` 标记、测试动作注册名一致） */
  channel: string;
  /** 配置是否完整（必填项生效值均非空） */
  configComplete: boolean;
  /** 缺失（生效值为空）的必填配置键 */
  missingKeys: string[];
  /** 是否存在有效的验证记录（测试通过后写入，配置变更即删除） */
  verified: boolean;
  /** 最近一次测试通过时间 */
  verifiedAt: Date | null;
  /** 最近一次测试操作者 */
  testedBy: string | null;
}

/**
 * 通道测试动作执行上下文：动作经此读取通道配置（三层解析后的生效值），
 * 不直接接触数据库或加密层。
 */
export interface ChannelTestContext {
  /** 读取配置生效值（与业务消费方同一出口） */
  getValue: <T>(key: string) => Promise<T>;
  /** 测试发信目标（邮件通道：收件人；缺省由动作自行决定，如 supportEmail） */
  recipient?: string;
}

/** 通道测试动作结果 */
export interface ChannelTestResult {
  ok: boolean;
  /** 成功说明或失败原因（面向操作员） */
  message: string;
}

/**
 * 通道测试动作（ADR-0082 D4）：每通道注册一个真实验证动作
 * （邮件 = 测试发信；短信 = 凭据探测；微信 = gettoken 探测……）。
 * 机制层只定义框架，具体动作随各通道落地（邮件见 #495）。
 *
 * 注册方式：模块内 `providers: [XxxAction, { provide: CHANNEL_TEST_ACTIONS,
 * useFactory: (a: XxxAction) => [a], inject: [XxxAction] }]`（NestJS 11 已
 * 移除 multi 注入，用 useFactory 聚合）。
 */
export interface ChannelTestAction {
  /** 通道名：必须与定义表 `channel` 标记一致 */
  readonly channel: string;
  test(ctx: ChannelTestContext): Promise<ChannelTestResult>;
}
