import { describe, it, expect } from 'vitest'
import { formatTime, formatSize } from './useNodeFormatter'

// 相对时间口径已收敛到 @cloudcad/platform 的 relativeTime（与 PC 共用），
// 本适配只做 tier+unit → 中文文案映射；<24h 统一「X 小时前」，不再走 HH:MM 时钟。
describe('useNodeFormatter.formatTime', () => {
  it('just_now / 分钟 / 小时 档', () => {
    expect(formatTime(new Date(Date.now() - 30_000).toISOString())).toBe('刚刚')
    expect(formatTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 分钟前')
    expect(formatTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 小时前')
  })

  it('天 / 周 / 月 / 年 档', () => {
    expect(formatTime(new Date(Date.now() - 1 * 86_400_000).toISOString())).toBe('1 天前')
    expect(formatTime(new Date(Date.now() - 10 * 86_400_000).toISOString())).toBe('1 周前')
    expect(formatTime(new Date(Date.now() - 45 * 86_400_000).toISOString())).toBe('1 个月前')
    expect(formatTime(new Date(Date.now() - 400 * 86_400_000).toISOString())).toBe('1 年前')
  })

  it('<24h 不再返回 HH:MM 时钟格式', () => {
    const result = formatTime(new Date(Date.now() - 3 * 3_600_000).toISOString())
    expect(result).toBe('3 小时前')
    expect(result).not.toMatch(/^\d{1,2}:\d{2}$/)
  })
})

// 文件大小口径已收敛到 @cloudcad/platform 的 formatBytes（与 PC 共用）：
// B~TB、parseFloat(toFixed(2)) 去尾零、空/0→'-'。
describe('useNodeFormatter.formatSize', () => {
  it('B / KB / MB / GB / TB 档（platform 口径，去尾零）', () => {
    expect(formatSize(100)).toBe('100 B')
    expect(formatSize(1024)).toBe('1 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(1024 * 1024)).toBe('1 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1 GB')
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB')
  })
})
