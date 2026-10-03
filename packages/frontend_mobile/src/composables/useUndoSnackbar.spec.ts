/**
 * useUndoSnackbar：操作后撤销 snackbar 状态机。
 *
 * 回归点（删除撤销）：
 * - trackUndo 浮出（visible=true + 文案）并启动限时倒计时；
 * - onUndo 触发回滚 closure 并收起；
 * - 新操作顶替旧 snackbar（单步语义：只保留最新一次）；
 * - 超时自动收起；
 * - 回滚抛错不阻塞收起（已先 dismiss），且经 onError 上报、不外抛（模板 @undo 直调，外抛=静默未处理拒绝）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useUndoSnackbar } from './useUndoSnackbar'

/** 在 effectScope 内创建（避免 onScopeDispose 无作用域告警，并便于清理） */
function createUndo(durationMs = 5000, onError?: (e: unknown) => void) {
  const scope = effectScope()
  let undo!: ReturnType<typeof useUndoSnackbar>
  scope.run(() => {
    undo = useUndoSnackbar(durationMs, onError)
  })
  return { undo, stop: () => scope.stop() }
}

describe('useUndoSnackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('trackUndo 浮出 snackbar 并记录文案', () => {
    const { undo, stop } = createUndo()
    expect(undo.visible.value).toBe(false)
    undo.trackUndo('已删除 3 个文件', async () => {})
    expect(undo.visible.value).toBe(true)
    expect(undo.message.value).toBe('已删除 3 个文件')
    stop()
  })

  it('onUndo 触发回滚并收起', async () => {
    const { undo, stop } = createUndo()
    const rollback = vi.fn().mockResolvedValue(undefined)
    undo.trackUndo('已删除 1 个文件', rollback)
    await undo.onUndo()
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(undo.visible.value).toBe(false)
    stop()
  })

  it('新操作顶替旧 snackbar（单步语义）', async () => {
    const { undo, stop } = createUndo()
    const first = vi.fn().mockResolvedValue(undefined)
    undo.trackUndo('第一次', first)
    undo.trackUndo('第二次', vi.fn().mockResolvedValue(undefined))
    expect(undo.message.value).toBe('第二次')
    // 撤销只回滚最新一次，第一次被顶替不再触发
    await undo.onUndo()
    expect(first).not.toHaveBeenCalled()
    stop()
  })

  it('超时自动收起', () => {
    const { undo, stop } = createUndo(5000)
    undo.trackUndo('已删除 2 个文件', async () => {})
    expect(undo.visible.value).toBe(true)
    vi.advanceTimersByTime(4999)
    expect(undo.visible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(undo.visible.value).toBe(false)
    stop()
  })

  it('回滚抛错仍收起，经 onError 上报且不外抛', async () => {
    const onError = vi.fn()
    const { undo, stop } = createUndo(5000, onError)
    const rollback = vi.fn().mockRejectedValue(new Error('boom'))
    undo.trackUndo('已删除 1 个文件', rollback)
    await expect(undo.onUndo()).resolves.toBeUndefined()
    expect(undo.visible.value).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }))
    stop()
  })

  it('回滚成功不触发 onError', async () => {
    const onError = vi.fn()
    const { undo, stop } = createUndo(5000, onError)
    undo.trackUndo('已删除 1 个文件', vi.fn().mockResolvedValue(undefined))
    await undo.onUndo()
    expect(onError).not.toHaveBeenCalled()
    stop()
  })
})
