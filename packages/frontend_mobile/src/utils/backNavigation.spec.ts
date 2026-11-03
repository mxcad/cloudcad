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
 * 直接固定 history.state（vue-router 的 buildState 形状），让用例断言的是
 * 决策边界而非 DOM 实现：
 * - back 缺失 / back === current → back() 是空操作 → 落 fallback
 * - back 是另一个页面 → router.back()
 */
function setHistoryState(state: unknown) {
  Object.defineProperty(window.history, 'state', {
    value: state,
    configurable: true,
    writable: true,
  })
}

describe('backOrFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('前一条是另一个页面时走 router.back（子页上方仍是编辑器壳根）', () => {
    setHistoryState({
      back: '/shell',
      current: '/shell/file',
      forward: null,
      replaced: false,
      position: 2,
    })
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('history.state 缺失时（PC→移动端 location.replace 流）直接 replace 到 fallback', () => {
    setHistoryState(null)
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell')
  })

  it('前一条记录 back 为 null（首条 bootstrap 记录）时落 fallback', () => {
    setHistoryState({
      back: null,
      current: '/shell/file',
      forward: null,
      replaced: true,
      position: 0,
    })
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell')
  })

  it('深链直开子页 + 登录中转：前一条与当前 URL 相同时落 fallback（回归：点返回永远停在当前页）', () => {
    // 直开 /shell/file/project/:id/roles → 守卫 push 登录页 → 登录成功
    // replace 回原深链：历史 = [roles, roles, roles]，前一条与当前完全相同，
    // back() 视觉无反应——旧实现只查 history.length > 1 会永远 back() 空转
    const rolesUrl = '/shell/file/project/cmvupxl7d0037s8ufcu60jfq8/roles'
    setHistoryState({
      back: rolesUrl,
      current: rolesUrl,
      forward: null,
      replaced: true,
      position: 2,
    })
    const router = fakeRouter()

    backOrFallback(router, '/shell')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell')
  })

  it('fallback 路径随调用方语义变化（删除项目后落文件列表）', () => {
    setHistoryState({
      back: '/shell/file',
      current: '/shell/file',
      forward: null,
      replaced: true,
      position: 1,
    })
    const router = fakeRouter()

    backOrFallback(router, '/shell/file')

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/shell/file')
  })
})
