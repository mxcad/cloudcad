/**
 * 密码强度评分——跨端共享的纯计算。
 *
 * 评分 0-4，四条件各 1 分：长度≥8 / 大小写齐 / 含数字 / 含特殊字符。
 * 过去 PC `usePasswordProfile`、PC `Register`、移动端 `authValidation`、
 * 移动端 `useProfilePassword` 逐字节各写一份（各端注释都写「与 PC 同评分口径」
 * ——4 份手写同步）。这里收敛为唯一评分；强度标签（「太弱」等 i18n 文案）
 * 与颜色（PC 硬编码 hex / 移动端 CSS token）留在各端按 score 映射。
 */

/** 评分取值。字面量联合把 0..4 的约束带进签名，调用方无需断言即可下标数组。 */
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export function scorePasswordStrength(
  password: string
): PasswordStrengthScore {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  // 四条判定各 1 分，上界由判定条数决定；clamp 后收窄为字面量联合
  return Math.min(4, score) as PasswordStrengthScore;
}
