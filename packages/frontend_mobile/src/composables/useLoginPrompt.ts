/**
 * 壳子页未登录引导（需登录态子页通用：文件浏览器 / 个人中心 / 分享管理）
 *
 *  - guest 态（无有效 accessToken）/ token_expired 态（token 过期且静默刷新失败）
 *    → 自动跳原生登录页（同 tab，带 redirect 回跳当前子页）
 *  - 态切 authenticated 后调用 onAuthenticated 回调（页面侧重新加载数据）
 *
 * 用法（子页 setup 内，须放在 load 函数与相关 ref 定义之后）：
 *   useLoginPrompt(() => loadXxx())
 */
import { watch } from 'vue'
import { useAuthState } from './useAuthState'
import { navigateToLogin, navigateToRegister } from '../utils/authNavigate'

export function useLoginPrompt(onAuthenticated: () => void) {
  const { authState } = useAuthState()

  watch(
    () => authState.value.kind,
    (kind) => {
      // guest（未登录）/ token_expired（token 过期且刷新失败）→ 跳原生登录页
      if (kind === 'guest' || kind === 'token_expired') {
        navigateToLogin()
        return
      }
      if (kind === 'authenticated') {
        onAuthenticated()
        return
      }
      // 其他态（network_error / forbidden / deactivated）由页面各自 UI 处理
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
