/**
 * 认证页导航（原生同 tab 跳转，取代旧 PC window.open 流程）。
 *
 * 只 import router（不 import 任何 composable），避免与 useUser/useAuthState 循环依赖。
 * navigateToLogin/navigateToRegister 默认把当前 fullPath 作为 redirect 目标，
 * 登录/注册成功后跳回；对无需回跳的路径（壳根/认证页自身）不带 redirect。
 */
import router from '@/router'

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
