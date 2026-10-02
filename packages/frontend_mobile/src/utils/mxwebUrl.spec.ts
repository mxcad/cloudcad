import { describe, expect, it, vi } from 'vitest'
import {
  buildMxwebFileUrl,
  mxwebFilesDataPath,
  publicFileAccessPath,
  resolveCacheTimestamp,
} from './mxwebUrl'

describe('buildMxwebFileUrl（取数 URL 唯一出口）', () => {
  it('项目/个人空间：/api/v1/mxcad/filesData/{path}', () => {
    expect(buildMxwebFileUrl('202601/n1/a.mxweb')).toBe(
      '/api/v1/mxcad/filesData/202601/n1/a.mxweb'
    )
  })

  it('库：/api/v1/library/{key}/filesData/{path}', () => {
    expect(
      buildMxwebFileUrl('202601/n1/a.mxweb', { libraryKey: 'drawing' })
    ).toBe('/api/v1/library/drawing/filesData/202601/n1/a.mxweb')
  })

  it('缺 filesData/ 前缀自动补齐（与 PC 同口径）', () => {
    expect(mxwebFilesDataPath('filesData/202601/n1/a.mxweb')).toBe(
      '/mxcad/filesData/202601/n1/a.mxweb'
    )
  })

  it('查询参数顺序 v → t → shareToken', () => {
    const url = buildMxwebFileUrl('202601/n1/a.mxweb', {
      version: 3,
      cacheTimestamp: 123,
      shareToken: 'st',
    })
    expect(url).toBe('/api/v1/mxcad/filesData/202601/n1/a.mxweb?v=3&t=123&shareToken=st')
  })

  it('shareToken 只在非库形态由调用方传入', () => {
    const url = buildMxwebFileUrl('202601/n1/a.mxweb', { cacheTimestamp: 1 })
    expect(url).not.toContain('shareToken')
  })
})

describe('publicFileAccessPath', () => {
  it('文件本体与外参照两种形态共用同一前缀出口', () => {
    expect(publicFileAccessPath('abc.mxweb')).toBe('/public-file/access/abc.mxweb')
    expect(publicFileAccessPath('abc/a.dwg')).toBe('/public-file/access/abc/a.dwg')
  })
})

describe('resolveCacheTimestamp（缓存戳唯一口径）', () => {
  it('合法 updatedAt 取其毫秒值', () => {
    expect(resolveCacheTimestamp('2026-01-01T00:00:00.000Z')).toBe(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    )
  })

  it('缺失/非法回退 Date.now()，不产出 NaN', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
    expect(resolveCacheTimestamp(undefined)).toBe(Date.now())
    expect(resolveCacheTimestamp(null)).toBe(Date.now())
    expect(resolveCacheTimestamp('not-a-date')).toBe(Date.now())
    vi.useRealTimers()
  })
})
