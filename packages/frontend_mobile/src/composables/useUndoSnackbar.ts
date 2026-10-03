/**
 * 操作后撤销 snackbar（移动端适配 PC 的 undo 能力）。
 *
 * 删除/移动/复制/重命名/新建文件夹/新建图纸等破坏性操作成功后，底部浮出
 * 「已删除 N 个文件 [撤销]」，限时内点「撤销」回滚该操作。
 *
 * ── 为什么是瞬态 snackbar 而非 PC 的 session 级 undo/redo 栈（有意取舍，非遗漏）──
 * PC 用 zustand `undoStack`+`redoStack`（持久栈 + 撤销/重做按钮 + Ctrl+Z/Y）。
 * 移动端刻意不移植该栈，理由：
 *   1. 平台惯例：iOS Files / Android Files / Google Photos 对破坏性文件操作一律用
 *      瞬态「… [Undo]」snackbar，无一用持久 undo/redo 栈 + 工具栏按钮。这是移动端的
 *      既定交互范式，用户已有心智模型。
 *   2. 无键盘：PC redo 重度依赖 Ctrl+Z/Y 快捷键；移动端无此输入，持久「重做」按钮
 *      价值极低却常驻占位。
 *   3. 屏幕空间：小屏上持久撤销/重做工具栏挤占宝贵纵向空间，与「简单、直观」相悖。
 *   4. 认知简洁：「刚做了一步，现在能撤销」比「维护一个动作历史栈」更直觉。
 * 关键：撤销**能力**与 PC 完全对齐——覆盖 PC 全部可撤销操作类型（delete/move/copy/
 * rename/createFolder/createDrawing），仅**呈现方式**不同（瞬态 vs 持久）。新操作顶替
 * 旧 snackbar 是刻意的单步语义（移动惯例只提示最近一步，避免多个撤销项相互干扰）。
 *
 * 本 composable 只管 snackbar 状态（可见/文案/计时/互斥），回滚逻辑由调用方以
 * closure 传入（每页 reload 方式不同：personalFileList.loadNodes / fileList.refresh）。
 * 超时或撤销后自动收起。
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
