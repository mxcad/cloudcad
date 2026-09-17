/**
 * 壳子页未登录引导（需登录态子页通用：文件浏览器 / 个人中心 / 分享管理）
 *
 *  - guest 态（无有效 accessToken）/ token_expired 态（token 过期且静默刷新失败）
 *    → 自动弹出 LoginPromptPopup，引导登录/注册后再操作
 *  - 「前往登录/注册」→ window.open 打开 PC 端登录/注册页（带 redirect 回跳），
 *    PC 端完成登录后跳回移动端 URL 带回 token（useUser.extractTokensFromUrl 写入），
 *    useAuthState 的 storage 监听检测到 token 写回即切 authenticated
 *  - 态切 authenticated 后调用 onAuthenticated 回调（页面侧重新加载数据）
 *
 * 用法（子页 setup 内，须放在 load 函数与相关 ref 定义之后）：
 *   const { show: showLoginPrompt, waiting: loginPromptWaiting, open: openPCAuth, close: closeLoginPrompt } =
 *     useLoginPrompt(() => loadXxx())
 *   模板：<LoginPromptPopup v-if="showLoginPrompt" :waiting="loginPromptWaiting"
 *     @login="openPCAuth('login')" @register="openPCAuth('register')" @close="closeLoginPrompt" />
 */
import { ref, watch } from 'vue'
import { useAuthState } from './useAuthState'
import { getPCLoginUrl, getPCRegisterUrl } from '../utils/apiConfig'

export function useLoginPrompt(onAuthenticated: () => void) {
  const { authState } = useAuthState()
  const show = ref(false)
  const waiting = ref(false)

  watch(
    () => authState.value.kind,
    (kind) => {
      // guest（未登录）/ token_expired（token 过期且刷新失败）→ 弹出登录引导
      if (kind === 'guest' || kind === 'token_expired') {
        show.value = true
        return
      }
      if (kind === 'authenticated') {
        show.value = false
        waiting.value = false
        onAuthenticated()
        return
      }
      // 其他态（network_error / forbidden / deactivated）由页面各自 UI 处理，隐藏登录引导
      show.value = false
    },
    { immediate: true },
  )

  /** 打开 PC 端登录/注册页（带 redirect 回跳）；弹窗被拦截时回退当前标签导航 */
  function open(target: 'login' | 'register') {
    waiting.value = true
    const url = target === 'register'
      ? getPCRegisterUrl(window.location.href)
      : getPCLoginUrl(window.location.href)
    const win = window.open(url, 'pc-auth')
    if (!win) {
      waiting.value = false
      show.value = false
      window.location.href = url
    }
  }

  function close() {
    waiting.value = false
    show.value = false
  }

  return { show, waiting, open, close }
}
