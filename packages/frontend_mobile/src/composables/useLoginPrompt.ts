/**
 * 壳子页未登录引导（需登录态子页通用：文件浏览器 / 个人中心 / 分享管理）
 *
 *  - guest 态（无有效 accessToken）/ token_expired 态（token 过期且静默刷新失败）
 *    → 自动跳原生登录页（同 tab，带 redirect 回跳当前子页）
 *  - 态切 authenticated 后调用 onAuthenticated 回调（页面侧重新加载数据）
 *
 * guest / token_expired 在冷启动不是终态：accessToken 过期但 refreshToken 仍有效时
 * （useAuthState.initFromStorage 的静默刷新还在跑），同步判 guest 会在挂载那一刻把
 * 「可续期会话」弹回原生登录页，用户明明没退出过却被要求重登。故这两个态先等路由守卫的
 * hasValidAuth（同一刷新出口 refreshTokensOnce、in-flight 去重、4s 上限）再决定跳登录；
 * 判定为已登录时显式同步状态机：静默刷新经 authSession.applyTokenRefresh 会发
 * written 通知、通常已自动翻回 authenticated，此处仍显式兜底（hasValidAuth 可能在不
 * 写 token 的路径上判定为真）；setAuthenticated 有 kind 判重，不会重复触发回调。
 *
 * 用法（子页 setup 内，须放在 load 函数与相关 ref 定义之后）：
 *   useLoginPrompt(() => loadXxx())
 */
import { watch } from 'vue'
import { useAuthState } from './useAuthState'
import { navigateToLogin, navigateToRegister } from '../utils/authNavigate'
// 方向单向：router/index.ts 只依赖 utils 层、不依赖 composables，此处引入不成环。
import { hasValidAuth } from '../router'

export function useLoginPrompt(onAuthenticated: () => void) {
  const { authState, setAuthenticated } = useAuthState()

  // 判定在途时不重复发起（避免并发多次刷新/多次跳转）
  let deciding = false
  // 已跳一次就不再重复跳：判定 settle 之后刷新才落定（guest → token_expired）
  // 会让 watch 串行重入一次，deciding 只拦并发拦不住这种，故记已跳转标记；
  // 回到 authenticated 时复位，下次登出仍可再跳。
  let navigated = false

  watch(
    () => authState.value.kind,
    async (kind) => {
      if (kind === 'authenticated') {
        navigated = false
        onAuthenticated()
        return
      }
      // 其他态（network_error / forbidden / deactivated）由页面各自 UI 处理
      if (kind !== 'guest' && kind !== 'token_expired') return
      if (deciding || navigated) return

      deciding = true
      try {
        const authed = await hasValidAuth()
        if (authed) {
          // 会话确认可续期：显式同步状态机（onAuthenticated 由 watch 收到 authenticated 触发）
          if (authState.value.kind !== 'authenticated') setAuthenticated()
        } else if (
          authState.value.kind === 'guest' ||
          authState.value.kind === 'token_expired'
        ) {
          // 判定失败 = 确实未登录，才跳登录页（判定期间状态机可能已翻转，翻转后不再跳）
          navigated = true
          navigateToLogin()
        }
      } finally {
        deciding = false
      }
    },
    { immediate: true },
  )

  /** 跳原生登录/注册页（同 tab，带 redirect 回跳当前子页） */
  function open(target: 'login' | 'register') {
    if (target === 'register') navigateToRegister()
    else navigateToLogin()
  }

  return { open }
}
