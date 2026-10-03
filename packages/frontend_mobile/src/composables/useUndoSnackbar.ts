/**
 * 操作后撤销 snackbar（移动端适配 PC 的 undo 能力）。
 *
 * 删除/移动/复制等破坏性操作成功后，底部浮出「已删除 N 个文件 [撤销]」，
 * 限时内点「撤销」回滚该操作。移动端不引入 PC 的 undo/redo 栈（空间受限、
 * 栈式撤销在移动交互中收益低），单步撤销 snackbar 更贴合「便捷、直觉、移动端适配」。
 *
 * 本 composable 只管 snackbar 状态（可见/文案/计时/互斥），回滚逻辑由调用方以
 * closure 传入（每页 reload 方式不同：personalFileList.loadNodes / fileList.refresh）。
 * 新操作会顶替旧 snackbar（单步语义），超时或撤销后自动收起。
 *
 * 回滚 closure 抛错时 onUndo 不外抛（模板 @undo 直接调用，外抛=未处理拒绝静默吞错），
 * 改为经 onError 上报，调用方据此弹「撤销失败」。
 */
import { ref, onScopeDispose } from 'vue'

export function useUndoSnackbar(durationMs = 5000, onError?: (e: unknown) => void) {
  const visible = ref(false)
  const message = ref('')
  let timer: number | null = null
  let rollback: (() => Promise<void>) | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function dismiss() {
    clearTimer()
    visible.value = false
    rollback = null
  }

  /** 记录一次可撤销操作：顶替既有 snackbar 并启动限时倒计时 */
  function trackUndo(msg: string, fn: () => Promise<void>) {
    dismiss()
    message.value = msg
    rollback = fn
    visible.value = true
    timer = window.setTimeout(dismiss, durationMs)
  }

  async function onUndo() {
    const fn = rollback
    dismiss()
    if (!fn) return
    try {
      await fn()
    } catch (e) {
      // 回滚失败：snackbar 已收起，经 onError 上报（调用方弹「撤销失败」），不外抛
      onError?.(e)
    }
  }

  // 页面卸载时清定时器，避免卸载后回调再写已销毁的 ref
  onScopeDispose(dismiss)

  return { visible, message, trackUndo, onUndo, dismiss }
}
