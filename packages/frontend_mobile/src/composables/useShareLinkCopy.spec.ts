/**
 * useShareLinkCopy：分享链接复制唯一出口（copyText → 失败回落面板 → 成功行内反馈）。
 *
 * 回归点：
 * - 成功置 copiedKey（用 url 当键），2s 后自动清除；
 * - 连续复制时后一次复用同一个定时器，不被前一次清掉；
 * - 失败回落 ShareLinkSheet（copiedKey 不变），空 url 直接返回 false；
 * - 组件卸载时清掉未触发的定时器（onScopeDispose）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useShareLinkCopy } from './useShareLinkCopy'

type Hook = ReturnType<typeof useShareLinkCopy>

vi.mock('vant', () => ({
  showToast: vi.fn(),
}))
vi.mock('@/utils/clipboard', () => ({
  copyText: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (s: string) => s,
}))

import { copyText } from '@/utils/clipboard'
import { showToast } from 'vant'

const mockedCopyText = copyText as ReturnType<typeof vi.fn>

let scope: EffectScope
let hook: Hook

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  scope = effectScope()
  hook = scope.run(() => useShareLinkCopy())!
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('useShareLinkCopy', () => {
  it('复制成功置 copiedKey（url 当键）并在 2s 后清除', async () => {
    mockedCopyText.mockResolvedValue('clipboard')

    expect(await hook.copy('https://cad.test/cad-editor/f1?shareToken=t1')).toBe(true)
    expect(hook.copiedKey.value).toBe('https://cad.test/cad-editor/f1?shareToken=t1')
    expect(showToast).toHaveBeenCalledWith('已复制链接')

    vi.advanceTimersByTime(1999)
    expect(hook.copiedKey.value).toBe('https://cad.test/cad-editor/f1?shareToken=t1')
    vi.advanceTimersByTime(1)
    expect(hook.copiedKey.value).toBe('')
  })

  it('连续复制：后一次覆盖前一次显示并复用同一个定时器', async () => {
    mockedCopyText.mockResolvedValue('execCommand')

    await hook.copy('https://cad.test/a')
    vi.advanceTimersByTime(1500)
    await hook.copy('https://cad.test/b')

    expect(hook.copiedKey.value).toBe('https://cad.test/b')
    // 若第一个定时器未被复用，这里会提前被清掉
    vi.advanceTimersByTime(1999)
    expect(hook.copiedKey.value).toBe('https://cad.test/b')
    vi.advanceTimersByTime(1)
    expect(hook.copiedKey.value).toBe('')
  })

  it('复制失败回落 ShareLinkSheet，且 copiedKey 不被置位', async () => {
    mockedCopyText.mockResolvedValue('failed')

    expect(await hook.copy('https://cad.test/x')).toBe(false)
    expect(hook.showLinkSheet.value).toBe(true)
    expect(hook.linkSheetUrl.value).toBe('https://cad.test/x')
    expect(hook.copiedKey.value).toBe('')
    expect(showToast).not.toHaveBeenCalled()
    // 失败路径不起定时器：2s 后状态不变
    vi.advanceTimersByTime(3000)
    expect(hook.showLinkSheet.value).toBe(true)
  })

  it('空 url 直接返回 false，不触发任何副作用', async () => {
    expect(await hook.copy('')).toBe(false)
    expect(mockedCopyText).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('卸载时清掉未触发的定时器（onScopeDispose，不残留）', async () => {
    mockedCopyText.mockResolvedValue('clipboard')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await hook.copy('https://cad.test/a')
    expect(hook.copiedKey.value).toBe('https://cad.test/a')
    scope.stop()
    expect(clearSpy).toHaveBeenCalled()
  })
})
