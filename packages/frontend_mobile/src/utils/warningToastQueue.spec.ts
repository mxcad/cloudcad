import { describe, expect, it, vi } from 'vitest'
import { createWarningToastQueue, type WarningToastQueueOptions } from './warningToastQueue'
import type { Notice } from './noticeAck'

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'warning',
    title: '标题',
    body: '正文',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  } as Notice
}

interface Harness {
  warnings: Notice[]
  shown: Notice[]
  acked: Notice[]
  queue: ReturnType<typeof createWarningToastQueue>
  advance: (ms: number) => void
  dispose: () => void
}

/** 用 fake timer 装配队列，捕获 show/ack 调用 */
function makeQueue(list: Notice[]): Harness {
  const warnings = [...list]
  const shown: Notice[] = []
  const acked: Notice[] = []
  let now = 0
  let timerSeq = 0
  const pending: {
    id: number
    at: number
    fn: () => void
    cancelled: boolean
  }[] = []

  const opts: WarningToastQueueOptions = {
    getWarnings: () => warnings,
    // 真实场景中 ack 会写已读簿记 → filterUnacknowledged 把该项移出候选集，
    // 这里同样移除以模拟该行为
    acknowledge: (n) => {
      acked.push(n)
      const idx = warnings.findIndex((x) => x.id === n.id)
      if (idx >= 0) warnings.splice(idx, 1)
    },
    show: (n) => shown.push(n),
    durationMs: 8000,
    setTimeoutFn: ((fn: () => void, ms: number) => {
      const id = (timerSeq += 1)
      pending.push({ id, at: now + ms, fn, cancelled: false })
      return id as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout,
    clearTimeoutFn: ((id: unknown) => {
      const task = pending.find((t) => t.id === id)
      if (task) task.cancelled = true
    }) as typeof clearTimeout,
  }

  const queue = createWarningToastQueue(opts)

  return {
    warnings,
    shown,
    acked,
    queue,
    advance(ms) {
      now += ms
      // 执行到点且未取消的回调；队列推进本身可能再排定时器，循环处理
      let ran = true
      while (ran) {
        ran = false
        for (let i = 0; i < pending.length; i += 1) {
          const task = pending[i]
          if (!task.cancelled && task.at <= now) {
            pending.splice(i, 1)
            task.fn()
            ran = true
            break
          }
        }
      }
    },
    dispose: () => queue.dispose(),
  }
}

describe('createWarningToastQueue', () => {
  it('展示第一条并写 ack（展示即 ack，TTL 内不重复提醒）', () => {
    const h = makeQueue([notice({ id: 'w1', title: '警告一' })])
    h.queue.maybeShowNext()
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])
    expect(h.acked.map((n) => n.id)).toEqual(['w1'])
  })

  it('一次只展示一条：展示中不再推出下一条', () => {
    const h = makeQueue([
      notice({ id: 'w1' }),
      notice({ id: 'w2' }),
    ])
    h.queue.maybeShowNext()
    h.queue.maybeShowNext()
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])
  })

  it('到时长后自动消失并推进下一条', () => {
    const h = makeQueue([
      notice({ id: 'w1', title: '警告一' }),
      notice({ id: 'w2', title: '警告二' }),
    ])
    h.queue.maybeShowNext()
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])

    h.advance(8000)
    expect(h.shown.map((n) => n.id)).toEqual(['w1', 'w2'])
    expect(h.acked.map((n) => n.id)).toEqual(['w1', 'w2'])
  })

  it('队列清空后不再推进', () => {
    const h = makeQueue([notice({ id: 'w1' })])
    h.queue.maybeShowNext()
    h.warnings.length = 0
    h.advance(8000)
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])
  })

  it('dispose 清理待执行定时器，不再推进下一条', () => {
    const h = makeQueue([
      notice({ id: 'w1' }),
      notice({ id: 'w2' }),
    ])
    h.queue.maybeShowNext()
    h.dispose()
    h.advance(8000)
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])
  })

  it('新列表加入时（warnings 更新）能取出新项', () => {
    const h = makeQueue([])
    h.queue.maybeShowNext()
    expect(h.shown).toEqual([])

    h.warnings.push(notice({ id: 'w1', title: '迟到公告' }))
    h.queue.maybeShowNext()
    expect(h.shown.map((n) => n.id)).toEqual(['w1'])
  })
})
