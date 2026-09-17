/**
 * 认证会话写入 + redirect 目标解析（原生登录/注册成功后调用）。
 *
 * applyAuthResponse：把后端返回的 token/user 写入 localStorage，切 authenticated 态并刷新 useUser，
 * 使各组件 watch(isAuthenticated) / 子页 useLoginPrompt 回调在登录完成后自动恢复数据。
 * resolveRedirectTarget：校验 redirect 为同源内部路径（/ 开头且非 //），否则回退壳根。
 */
import { useAuthState } from '@/composables/useAuthState'
import { useUser } from '@/composables/useUser'

export interface AuthResponseData {
  accessToken: string
  refreshToken?: string
  user?: unknown
  restored?: boolean
}

/** 登录后 redirect 目标：仅接受同源内部路径（/ 开头且非 //），否则回退 fallback */
export function resolveRedirectTarget(raw: unknown, fallback = '/shell'): string {
  if (typeof raw !== 'string') return fallback
  const target = raw.trim()
  if (target.startsWith('/') && !target.startsWith('//')) return target
  return fallback
}

/** 写入会话：token/user 落盘 + 切 authenticated + 刷新 useUser（触发各组件响应式恢复） */
export function applyAuthResponse(data: AuthResponseData) {
  if (data.accessToken) localStorage.setItem('accessToken', data.accessToken)
  if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
  useAuthState().setAuthenticated()
  useUser().refresh()
}

/**
 * 手机号 + 邮箱双验证注册的中转凭证（sessionStorage，非敏感期临时态）。
 *
 * 注册页在「手机号已通过短信验证、邮箱待验证」时写入本凭证并跳 /verify-email；
 * 邮箱验证页完成后取走它直接调 registerByPhoneAndVerifyEmail 一步完成注册。
 * 用 sessionStorage 而非 router state：hash 路由的 state 在整页刷新 / 微信
 * 授权回跳后丢失，而这条链路中间会经过一次邮箱验证码输入，用户可能刷新。
 */
export const REGISTER_PHONE_PENDING_KEY = 'registerPhonePending'

export interface RegisterPhonePending {
  phone: string
  code: string
  username: string
  password: string
  nickname?: string
}

export function setRegisterPhonePending(pending: RegisterPhonePending): void {
  sessionStorage.setItem(REGISTER_PHONE_PENDING_KEY, JSON.stringify(pending))
}

/** 读取中转凭证（不删除：邮箱验证码输入过程中用户刷新后仍可续上） */
export function getRegisterPhonePending(): RegisterPhonePending | null {
  const raw = sessionStorage.getItem(REGISTER_PHONE_PENDING_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<RegisterPhonePending>
    if (
      typeof parsed.username !== 'string' ||
      !parsed.username ||
      typeof parsed.password !== 'string' ||
      !parsed.password ||
      typeof parsed.phone !== 'string' ||
      !parsed.phone ||
      typeof parsed.code !== 'string' ||
      !parsed.code
    ) {
      return null
    }
    return parsed as RegisterPhonePending
  } catch {
    return null
  }
}

/** 注册完成（或放弃中转）后清掉凭证，避免下一轮注册误用旧账号信息 */
export function clearRegisterPhonePending(): void {
  sessionStorage.removeItem(REGISTER_PHONE_PENDING_KEY)
}
