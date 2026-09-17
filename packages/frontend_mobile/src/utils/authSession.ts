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
  user: unknown
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
