/**
 * warning 通知的轻提示队列状态机（移动端唯一出口，纯逻辑无 Vue 依赖）。
 *
 * 与 PC 端 NoticeProvider 的 warning 队列语义一致：一次只展示一条，展示即写
 * ack（TTL 内不重复提醒），到时长自动消失后推进下一条。展示动作（show）与
 * 计时器由调用方注入，便于单测注入 fake timer 断言。
 *
 * 注意：展示即 ack 后候选集立刻前进、下一条马上被推出，因此排队进度必须用
 * 内部 showingId 跟踪，不能靠 ack 反推（否则下一条会被立即推出）。
 */
import type { Notice } from './noticeAck'

export interface WarningToastQueueOptions {
  /** 当前未读 warning 列表（已排序）；每次推进时实时读取 */
  getWarnings: () => Notice[]
  /** 展示即调用：写入已读簿记（TTL 内不重复提醒） */
  acknowledge: (notice: Notice) => void
  /** 展示一条 warning 提示（调用方接 vant showToast） */
  show: (notice: Notice) => void
  /** 提示展示时长（毫秒） */
  durationMs: number
  /** 可注入 fake timer（默认全局 setTimeout） */
  setTimeoutFn?: typeof setTimeout
  /** 可注入 fake timer（默认全局 clearTimeout） */
  clearTimeoutFn?: typeof clearTimeout
}

export interface WarningToastQueue {
  /** 尝试推进：无展示中项时展示当前第一条，否则等待 */
  maybeShowNext: () => void
  /** 清理待执行定时器（组件卸载时调用） */
  dispose: () => void
}

export function createWarningToastQueue(
  options: WarningToastQueueOptions,
): WarningToastQueue {
  const {
    getWarnings,
    acknowledge,
    show,
    durationMs,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options

  let showingId: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function maybeShowNext(): void {
    if (showingId) return
    const next = getWarnings()[0]
    if (!next) return

    acknowledge(next)
    showingId = next.id
    show(next)
    timer = setTimeoutFn(() => {
      showingId = null
      timer = null
      maybeShowNext()
    }, durationMs)
  }

  function dispose(): void {
    if (timer) {
      clearTimeoutFn(timer)
      timer = null
    }
  }

  return { maybeShowNext, dispose }
}
