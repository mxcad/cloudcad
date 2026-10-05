import { afterEach, describe, expect, it, vi } from 'vitest'
import { vibrate } from './vibrate'

function mockVibrate(impl: unknown) {
  Object.defineProperty(navigator, 'vibrate', {
    value: impl,
    configurable: true,
    writable: true,
  })
}

describe('vibrate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('设备不支持时静默 no-op，不抛 TypeError', () => {
    mockVibrate(undefined)
    expect(() => vibrate()).not.toThrow()
  })

  it('navigator 整体缺失时不抛错（非浏览器环境）', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => vibrate()).not.toThrow()
  })

  it('支持时按默认 10ms 触发', () => {
    const spy = vi.fn()
    mockVibrate(spy)
    vibrate()
    expect(spy).toHaveBeenCalledWith(10)
  })

  it('支持时透传自定义 pattern', () => {
    const spy = vi.fn()
    mockVibrate(spy)
    vibrate([30, 50, 20])
    expect(spy).toHaveBeenCalledWith([30, 50, 20])
  })
})
