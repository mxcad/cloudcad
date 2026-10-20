/**
 * 口令策略预检——跨端共享的纯判定。
 *
 * 后端 `PasswordPolicyService.assertPasswordPolicy` 对新设口令强制三条：
 * 长度 ≥ minLength（默认 10，env PASSWORD_POLICY_MIN_LENGTH 覆盖）+ 复杂度
 * （小写/大写/数字/特殊字符四类至少三类）+ 弱口令黑名单。黑名单是后端随包分发的
 * 静态资产（backend 只能消费构建产物、platform 无构建步骤，无法共享），故本函数
 * 只覆盖「长度 + 复杂度」两条——正是前端强度条（0-4 启发式）不反映、导致
 * 「中等强度」口令过 UI 却在提交时被拒的根因。弱口令黑名单仍由后端兜底。
 *
 * 判定优先级与后端一致（先长度后复杂度，短路返回首个失败原因），使前端预检与
 * 后端权威校验对齐、用户提交前即可知道具体原因。强度标签/颜色仍留各端按
 * `scorePasswordStrength` 的 score 映射，本函数只负责「是否可提交 + 原因」。
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

/** 预检失败原因（与后端 assertPasswordPolicy 的判定顺序一致）。 */
export type PasswordPolicyReason = 'too_short' | 'complexity';

export interface PasswordPolicyResult {
  valid: boolean;
  /** 首个失败原因；valid 为 true 时为 null。 */
  reason: PasswordPolicyReason | null;
}

/**
 * 判定口令是否满足「长度 + 复杂度」策略（弱口令黑名单由后端兜底，不在本函数内）。
 * 纯函数：不读配置、不读全局，minLength / minCategories 由调用方传入
 * （缺省回落 PASSWORD_POLICY，见其注释）。
 */
export function validatePasswordPolicy(
  password: string,
  opts?: { minLength?: number; minCategories?: number }
): PasswordPolicyResult {
  const minLength = opts?.minLength ?? PASSWORD_POLICY.minLength;
  const minCategories = opts?.minCategories ?? PASSWORD_POLICY.minCategories;

  if (!password || password.length < minLength) {
    return { valid: false, reason: 'too_short' };
  }

  const categories = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  if (categories < minCategories) {
    return { valid: false, reason: 'complexity' };
  }

  return { valid: true, reason: null };
}
