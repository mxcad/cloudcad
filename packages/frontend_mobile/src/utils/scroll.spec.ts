import { describe, it, expect } from 'vitest'
import { isNearScrollBottom, SCROLL_LOAD_MORE_THRESHOLD } from './scroll'

const makeEl = (scrollTop: number, clientHeight: number, scrollHeight: number) => ({
  scrollTop,
  clientHeight,
  scrollHeight,
})

describe('isNearScrollBottom', () => {
  it('默认阈值常量 = 100', () => {
    expect(SCROLL_LOAD_MORE_THRESHOLD).toBe(100)
  })

  it('接近底部（恰好命中阈值边界）返回 true', () => {
    // scrollTop + clientHeight = 900，scrollHeight - 100 = 900 → 相等命中
    expect(isNearScrollBottom(makeEl(800, 100, 1000))).toBe(true)
  })

  it('远离底部返回 false', () => {
    // scrollTop + clientHeight = 300，scrollHeight - 100 = 900 → 未命中
    expect(isNearScrollBottom(makeEl(200, 100, 1000))).toBe(false)
  })

  it('滚动到底（越过阈值）返回 true', () => {
    // scrollTop + clientHeight = 1000 >= 900
    expect(isNearScrollBottom(makeEl(900, 100, 1000))).toBe(true)
  })

  it('自定义阈值生效（同一位置，阈值不同结论不同）', () => {
    // scrollTop + clientHeight = 920
    // 阈值 100：920 >= 900 → true
    expect(isNearScrollBottom(makeEl(820, 100, 1000), 100)).toBe(true)
    // 阈值 50：920 >= 950 → false
    expect(isNearScrollBottom(makeEl(820, 100, 1000), 50)).toBe(false)
  })
})
