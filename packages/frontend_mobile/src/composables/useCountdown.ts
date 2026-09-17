import { onUnmounted, ref } from 'vue'

/**
 * 验证码按钮倒计时（登录/注册/验证/找回密码/重置共用的 60s 倒计时）。
 *
 * 之前在每个页面各写一份 setInterval + onUnmounted 清理，登录页与注册页还各留
 * 了一份 PHONE_RE/CODE_RE。抽到这里后新增验证码场景不必再复制定时器样板。
 */
export const CODE_COOLDOWN_SECONDS = 60

export function useCountdown(seconds: number = CODE_COOLDOWN_SECONDS) {
  const countdown = ref(0)

  let timer: ReturnType<typeof setInterval> | null = null

  function start() {
    stop()
    countdown.value = seconds
    timer = setInterval(() => {
      countdown.value = Math.max(0, countdown.value - 1)
      if (countdown.value === 0) stop()
    }, 1000)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onUnmounted(stop)

  return {
    countdown,
    /** 按钮可点：倒计时未开始（0） */
    isReady: () => countdown.value === 0,
    start,
    stop,
  }
}
