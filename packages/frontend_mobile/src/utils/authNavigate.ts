/**
 * 认证页导航（原生同 tab 跳转，取代旧 PC window.open 流程）。
 *
 * 只 import router（不 import 任何 composable），避免与 useUser/useAuthState 循环依赖。
 * navigateToLogin/navigateToRegister 默认把当前 fullPath 作为 redirect 目标，
 * 登录/注册成功后跳回；对无需回跳的路径（壳根/认证页自身）不带 redirect。
 */
import router from '@/router'
import { resolveRedirectTarget } from '@/utils/authSession'

/** 无需 redirect 回跳的路径（壳根 = 编辑器，认证页自身避免自指） */
const NO_REDIRECT_PATHS = ['/', '/shell', '/login', '/register']

function buildRedirectQuery(redirect?: string): Record<string, string> {
  const target = redirect ?? router.currentRoute.value.fullPath
  if (!target || NO_REDIRECT_PATHS.includes(target)) return {}
  return { redirect: target }
}

/** 跳原生登录页（同 tab），默认带当前页 redirect 回跳 */
export function navigateToLogin(redirect?: string) {
  void router.replace({ path: '/login', query: buildRedirectQuery(redirect) })
}

/** 跳原生注册页（同 tab），默认带当前页 redirect 回跳 */
export function navigateToRegister(redirect?: string) {
  void router.replace({ path: '/register', query: buildRedirectQuery(redirect) })
}

/** 跳原生登录页（不带 redirect，用于忘记密码等「登录是终点」的入口） */
export function navigateToLoginPage(): void {
  void router.replace({ path: '/login' })
}

/**
 * 登录 / 注册 / 绑定成功后落点：按 query.redirect 回跳，非法或缺失回壳根。
 * 每次中转跳转都要显式调用它，否则链路末端只能落到 /shell。
 */
export function navigateAfterAuth(currentQuery: Record<string, unknown>): void {
  const target = resolveRedirectTarget(currentQuery.redirect)
  // 整串字符串传：redirect 存的是 fullPath（可能带 query），
  // 用 { path } 传会被当作路径解析、query 静默丢弃
  void router.replace(target)
}

/**
 * 取当前页 query.redirect 并透传给中转页。
 * 登录/注册中途常被后端拦去邮箱验证、手机验证、注册补齐或找回密码，
 * 这些跳转若不带上 redirect，验证通过后 navigateAfterAuth 只能回退壳根，
 * 用户就被丢回 /shell 而不是原本要进的子页。用法：
 *   query: { email, ...redirectQueryOf(route.query) }
 * 无可携带目标（缺省/非法/壳根/认证页自身）时返回空对象，不会写入 redirect: /shell。
 */
export function redirectQueryOf(query: Record<string, unknown>): Record<string, string> {
  return buildRedirectQuery(resolveRedirectTarget(query.redirect))
}
