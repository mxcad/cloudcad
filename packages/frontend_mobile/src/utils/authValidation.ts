/**
 * 认证表单校验（手机号 / 邮箱 / 6 位验证码 / 联系类型）。
 *
 * 此前 7 个页面各复制一份 PHONE_RE / EMAIL_RE / CODE_RE 与本地
 * type ContactType，其中两处 EMAIL_RE 的正则还写得不一致。收敛到这里。
 */

const PHONE_RE = /^1[3-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_RE = /^\d{6}$/

/** 中国大陆手机号 */
export function isPhone(value: string): boolean {
  return PHONE_RE.test(value.trim())
}

/** 邮箱（前后空白容错） */
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** 6 位数字验证码 */
export function isCode(value: string): boolean {
  return CODE_RE.test(value.trim())
}

/** 邮箱 / 手机 二选一联系类型（找回密码、重置密码页共用） */
export type ContactType = 'email' | 'phone'

/** 联系类型合法性：防止 URL query 传入未知值时页面无条件走 email 分支 */
export function isContactType(value: unknown): value is ContactType {
  return value === 'email' || value === 'phone'
}

/**
 * 密码强度（与 PC Register getPasswordStrength 同评分口径）。
 * 评分 0-4：长度≥8 / 大小写齐 / 含数字 / 含特殊字符，各 1 分。
 * 颜色走 token（不用 PC 的硬编码 hex），供注册与改密页共用。
 */
export interface PasswordStrengthInfo {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

const STRENGTH_LABELS = ['太弱', '较弱', '一般', '较强', '很强'] as const

const STRENGTH_COLORS = [
  'var(--danger)',
  'var(--warning)',
  'var(--strength-medium)',
  'var(--success)',
  'var(--strength-strong)',
] as const

export function getPasswordStrength(password: string): PasswordStrengthInfo {
  if (!password) return { score: 0, label: '', color: '' }

  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  const level = score as 0 | 1 | 2 | 3 | 4
  return {
    score: level,
    label: STRENGTH_LABELS[level] ?? STRENGTH_LABELS[0],
    color: STRENGTH_COLORS[level] ?? STRENGTH_COLORS[0],
  }
}
