import { describe, it, expect } from 'vitest'
import { runUploadPool } from './uploadPool'

function makeFile(name: string): File {
  return new File([name], name, { type: 'text/plain' })
}

describe('runUploadPool 多文件上传并发池（阶段 5）', () => {
  it('全部成功：onResult 逐文件 ok=true，返回计数', async () => {
    const results: Array<[string, boolean]> = []
    const { ok, failed } = await runUploadPool(
      [makeFile('a'), makeFile('b'), makeFile('c')],
      async () => undefined,
      (f, okFlag) => results.push([f.name, okFlag]),
    )
    expect(ok).toBe(3)
    expect(failed).toBe(0)
    expect(results).toEqual([
      ['a', true],
      ['b', true],
      ['c', true],
    ])
  })

  it('并发上限：同时在途不超过 concurrency', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const { ok } = await runUploadPool(
      [makeFile('a'), makeFile('b'), makeFile('c'), makeFile('d'), makeFile('e')],
      () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise<void>((r) => setTimeout(() => {
          inFlight--
          r()
        }, 10))
      },
      () => undefined,
      2,
    )
    expect(ok).toBe(5)
    expect(maxInFlight).toBe(2)
  })

  it('失败隔离：单文件失败不阻断其余文件', async () => {
    const results = new Map<string, boolean>()
    const { ok, failed } = await runUploadPool(
      [makeFile('a'), makeFile('bad'), makeFile('c'), makeFile('d')],
      async (f) => {
        if (f.name === 'bad') throw new Error('boom')
        await new Promise((r) => setTimeout(r, 5))
      },
      (f, okFlag) => results.set(f.name, okFlag),
    )
    expect(ok).toBe(3)
    expect(failed).toBe(1)
    expect(results.get('bad')).toBe(false)
    expect(results.get('a')).toBe(true)
    expect(results.get('c')).toBe(true)
    expect(results.get('d')).toBe(true)
  })

  it('空文件列表：直接 resolve，零回调', async () => {
    let called = 0
    const { ok, failed } = await runUploadPool([], async () => undefined, () => called++)
    expect(ok).toBe(0)
    expect(failed).toBe(0)
    expect(called).toBe(0)
  })
})
