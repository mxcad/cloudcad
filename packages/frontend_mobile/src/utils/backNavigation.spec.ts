import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

import { backOrFallback } from './backNavigation'

function fakeRouter() {
  return {
    back: vi.fn(),
    replace: vi.fn(),
  } as unknown as Router
}

/**
 * happy-dom 的 history.length 从 0 起算（真实浏览器是 1），而判断阈值固定按真实
 * 浏览器语义写。这里直接固定 length 的值，让用例断言的是决策边界而非 DOM 实现。
 */
function setHistoryLength(length: number) {
  vi.spyOn(window.history, 'length', 'get').mockReturnValue(length)
}

describe('backOrFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('有上一页时走 router.back（子页上方仍是编辑器壳根）', () => {
    setHistoryLength(2)
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('没有上一页时不回退历史，直接 replace 到 fallback', () => {
    // PC → 移动端自动跳转走 location.replace，不新增历史记录：这就是 length === 1
    setHistoryLength(1)
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell')
  })

  it('fallback 路径随调用方语义变化（删除项目后落文件列表）', () => {
    setHistoryLength(1)
    const router = fakeRouter()

    backOrFallback(router, '/shell/file')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell/file')
  })
})
