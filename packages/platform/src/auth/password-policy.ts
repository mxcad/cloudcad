/**
 * 口令策略预检——跨端共享的纯判定。
 *
 * 后端 `PasswordPolicyService.assertPasswordPolicy` 对新设口令强制三条：
 * 长度 ≥ minLength（默认 10，env PASSWORD_POLICY_MIN_LENGTH 覆盖）+ 复杂度
 * （小写/大写/数字/特殊字符四类至少三类）+ 弱口令黑名单。黑名单是后端随包分发的
 * 静态资产（backend 只能消费构建产物、platform 无构建步骤，无法共享），故本函数
 * 只覆盖「长度 + 复杂度」两条；强度评分（password-strength）同样不含黑名单，
 * 「高强度口令仍被后端拒绝」这一种失配是刻意保留的安全取舍，由后端兜底报错。
 *
 * 判定优先级与后端一致（先长度后复杂度，短路返回首个失败原因），使前端预检与
 * 后端权威校验对齐、用户提交前即可知道具体原因。强度标签/颜色仍留各端按
 * `scorePasswordStrength` 的 score 映射，本函数只负责「是否可提交 + 原因」。
 *
 * 客户端侧「类别构成」的唯一出口是 `countPasswordCategories`（本函数与两端
 * 「建议清单」共用同一份四条正则）；后端那一份副本无法并入这里——见其注释与
 * scripts/scan-password-policy.js 的检查 C。
 */

/**
 * 口令策略**兜底**参数（与后端 `passwordPolicy` 配置默认值一致，secure 基线）。
 *
 * 仅当调用方拿不到运行时生效值（旧后端未公开该两键 / 配置请求失败）时兜底。
 * 策略默认值的唯一事实源是后端 `RUNTIME_CONFIG_DEFINITIONS` 的
 * `passwordPolicyMinLength` / `passwordPolicyMinCategories`（含 env 覆盖与安全
 * 模式 profile 目标值）；调用方应经 `/runtime-config/public` 取生效值后显式传入
 * `opts`，勿依赖本常量（normal 模式生效值为 6/0，与本常量不同）。
 */
export const PASSWORD_POLICY = {
  minLength: 10,
  minCategories: 3,
} as const;

/**
 * 失败原因——3 码词汇表，与后端 `error.password_policy.*` i18n 键一一对应。
 *
 * `'weak'`（命中弱口令黑名单）只可能由后端产出：黑名单是后端随包分发的静态资产，
 * 不下发客户端（下发等于把绕过方式告诉攻击者），故 `validatePasswordPolicy`
 * 只会返回 `'too_short'` / `'complexity'`；把 `'weak'` 留在词汇表里，是为了让
 * 后端到 i18n 键的映射是穷举的、两端共用同一份名称。
 */
export type PasswordPolicyReason = 'too_short' | 'complexity' | 'weak';

export interface PasswordPolicyResult {
  valid: boolean;
  /** 首个失败原因；valid 为 true 时为 null。 */
  reason: PasswordPolicyReason | null;
}

/** 口令命中的字符类别标记（小写 / 大写 / 数字 / 特殊字符各一）。 */
export interface PasswordClassFlags {
  lower: boolean;
  upper: boolean;
  digit: boolean;
  special: boolean;
}

/**
 * 口令的字符类别命中标记——**这四条正则是本包内的唯一事实源**。
 *
 * `countPasswordCategories`（复杂度下限）、`scorePasswordStrength`（强度评分）
 * 与两端「建议清单」的逐项打勾都从这份标记派生，避免同一套判据被逐字节抄散。
 * 只共享「命中哪几类」，分值规则各自保留：类别数四类各 1 分、不看长度；
 * 强度把小写与大写合并算 1 分且要求长度≥8，两者刻意不同（spec 里钉住了差异）。
 *
 * 后端那一份副本无法并入这里——见其注释与 scripts/scan-password-policy.js 的检查 C。
 */
export function getPasswordClassFlags(password: string): PasswordClassFlags {
  return {
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
  };
}

/**
 * 统计口令命中的字符类别数（小写 / 大写 / 数字 / 特殊字符四类，取值 0-4）。
 *
 * 「类别构成」判定的唯一出口：`validatePasswordPolicy` 用它判复杂度下限，
 * 前端的「建议清单」用它逐项打勾。这套四条正则此前在后端
 * `PasswordPolicyService.assertPasswordPolicy`、移动端 `useProfilePassword`
 * 与 PC `AdminPasswordChange` 的建议清单各抄一份、靠注释维持同步。
 */
export function countPasswordCategories(password: string): number {
  const flags = getPasswordClassFlags(password);
  return [flags.lower, flags.upper, flags.digit, flags.special].filter(Boolean)
    .length;
}

/**
 * 生效口令策略参数。调用方应从 `/runtime-config/public` 取生效值后显式传入；
 * 缺省时回落 PASSWORD_POLICY（secure 基线，见其注释）。
 */
export interface PasswordPolicyOptions {
  minLength?: number;
  minCategories?: number;
}

/**
 * 策略参数的唯一回落解析点：validatePasswordPolicy / buildPasswordRequirements /
 * scorePasswordStrength 三处共用，避免「缺省回落 secure 基线」这条规则各写一份后
 * 悄然分叉。包内共享、不进 index 桶——对外调用方应传生效值而非依赖回落。
 */
export function resolvePasswordPolicy(
  opts?: PasswordPolicyOptions
): Required<PasswordPolicyOptions> {
  return {
    minLength: opts?.minLength ?? PASSWORD_POLICY.minLength,
    minCategories: opts?.minCategories ?? PASSWORD_POLICY.minCategories,
  };
}

/**
 * 判定口令是否满足「长度 + 复杂度」策略（弱口令黑名单由后端兜底，不在本函数内）。
 * 纯函数：不读配置、不读全局，minLength / minCategories 由调用方传入
 * （缺省回落 PASSWORD_POLICY，见其注释）。
 */
export function validatePasswordPolicy(
  password: string,
  opts?: PasswordPolicyOptions
): PasswordPolicyResult {
  const { minLength, minCategories } = resolvePasswordPolicy(opts);

  if (!password || password.length < minLength) {
    return { valid: false, reason: 'too_short' };
  }

  if (countPasswordCategories(password) < minCategories) {
    return { valid: false, reason: 'complexity' };
  }

  return { valid: true, reason: null };
}

/** 清单项标识。platform 只给结构与判定，i18n 文案由端包按 key 渲染。 */
export type PasswordRequirementKey = 'length' | 'categories';

/**
 * 一条生效策略要求 + 当前口令是否已满足。
 * 项本身由生效策略值生成：minLength=0 不出长度项、minCategories=0 不出类别项，
 * 策略放宽时清单自然变短，不会残留写死的固定要求。
 */
export interface PasswordRequirement {
  key: PasswordRequirementKey;
  ok: boolean;
}

/**
 * 按生效策略生成本次口令的要求清单（长度 / 类别构成，至多两项）。
 *
 * 与 validatePasswordPolicy 同参数同口径，故**非空口令**下「清单全勾」恒等价于
 * 「通过长度+复杂度校验」，UI 不必再各写一套判定。两处边界须知：
 * - 空口令可能返回空清单（minLength=0 时无项），因此**提交门禁仍须用
 *   validatePasswordPolicy**，不可用 `items.every(i => i.ok)` 代替；
 *   调用方本来就用 `password &&` 守卫渲染，空清单此时不会被显示出来。
 * - 弱口令黑名单不出项：它是后端随包分发的静态资产、不下发客户端（下发等于把
 *   绕过方式告诉攻击者），由后端兜底报错。
 */
export function buildPasswordRequirements(
  password: string,
  opts?: PasswordPolicyOptions
): PasswordRequirement[] {
  const { minLength, minCategories } = resolvePasswordPolicy(opts);
  const items: PasswordRequirement[] = [];

  if (minLength > 0) {
    items.push({ key: 'length', ok: password.length >= minLength });
  }
  if (minCategories > 0) {
    items.push({
      key: 'categories',
      ok: countPasswordCategories(password) >= minCategories,
    });
  }

  return items;
}
