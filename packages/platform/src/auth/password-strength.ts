/**
 * 密码强度评分——跨端共享的纯计算。
 *
 * 评分 0-4，四条件各 1 分：长度≥8 / 大小写齐 / 含数字 / 含特殊字符。
 * 过去 PC `usePasswordProfile`、PC `Register`、移动端 `authValidation`
 * 逐字节各写一份（移动端注释自认「与 PC 同评分口径」）。这里收敛为唯一评分；
 * 强度标签（「太弱」等 i18n 文案）与颜色（PC 硬编码 hex / 移动端 CSS token）
 * 留在各端按 score 映射。
 */
export function scorePasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}
