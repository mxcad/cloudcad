/**
 * isCadFileName：CAD 图纸文件判定（外部参照管理菜单入口的可见性判据）。
 */
import { describe, it, expect } from 'vitest'
import { isCadFileName } from './cadFile'

describe('isCadFileName', () => {
  it('CAD 扩展名（dwg/dxf/mxweb）→ true，大小写不敏感', () => {
    expect(isCadFileName('a.dwg')).toBe(true)
    expect(isCadFileName('a.DWG')).toBe(true)
    expect(isCadFileName('a.dxf')).toBe(true)
    expect(isCadFileName('a.mxweb')).toBe(true)
  })

  it('非 CAD 扩展名 → false', () => {
    expect(isCadFileName('a.pdf')).toBe(false)
    expect(isCadFileName('a.txt')).toBe(false)
    expect(isCadFileName('a')).toBe(false)
    expect(isCadFileName('')).toBe(false)
  })

  it('名称中段含点只看尾扩展名', () => {
    expect(isCadFileName('my.drawing.dwg')).toBe(true)
    expect(isCadFileName('my.drawing.pdf')).toBe(false)
  })
})
