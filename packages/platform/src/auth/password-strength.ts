/**
 * 密码强度评分——跨端共享的纯计算。
 *
 * 评分 0-4，四个条件各 1 分，阈值**全部来自生效口令策略**（不写死 8 位）：
 *   长度轴两档：length >= minLength（达标）/ length > minLength（有余量）
 *   类别轴两档：categories >= minCategories（达标）/ categories >= 4（四类全含）
 *
 * 由此得到「合规 ⟺ score >= 2」：满足生效策略的口令最低显示「一般」，不会再出现
 * 「合规却显示太弱」；策略收紧（secure 10/3）时门槛抬高、放宽（normal 6/0）时
 * 好拿分，强弱标签随部署策略相对变化，而不是与策略无关的绝对刻度。
 * 弱口令黑名单不进评分：它是后端随包分发的静态资产、不下发客户端，
 * 故高分仍可能在提交时被后端拒绝，UI 侧无法预测、由后端兜底报错。
 *
 * 过去 PC `usePasswordProfile`、PC `Register`、移动端 `authValidation`、
 * 移动端 `useProfilePassword` 逐字节各写一份（各端注释都写「与 PC 同评分口径」
 * ——4 份手写同步）。这里收敛为唯一评分；强度标签（「太弱」等 i18n 文案）
 * 与颜色（PC 硬编码 hex / 移动端 CSS token）留在各端按 score 映射。
 *
 * 类别数一律取 password-policy 的 `countPasswordCategories`
 * （四条正则的唯一事实源），本文件不写任何正则。
 */

import {
  countPasswordCategories,
  resolvePasswordPolicy,
  type PasswordPolicyOptions,
} from './password-policy';

/** 评分取值。字面量联合把 0..4 的约束带进签名，调用方无需断言即可下标数组。 */
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export function scorePasswordStrength(
  password: string,
  opts?: PasswordPolicyOptions
): PasswordStrengthScore {
  if (!password) return 0;
  const { minLength, minCategories } = resolvePasswordPolicy(opts);
  const categories = countPasswordCategories(password);

  let score = 0;
  if (password.length >= minLength) score++;
  if (categories >= minCategories) score++;
  if (password.length > minLength) score++;
  if (categories >= 4) score++;
  // 四条判定各 1 分，上界由判定条数决定；clamp 后收窄为字面量联合
  return Math.min(4, score) as PasswordStrengthScore;
}
