import { beforeEach, describe, expect, it } from 'vitest'
import {
  NOTICE_ACK_STORAGE_KEY,
  NOTICE_ACK_TTL_MS,
  ackEntryKey,
  ackStorageKey,
  filterUnacknowledged,
  isAcknowledged,
  pruneExpiredAcks,
  readAcks,
  selectPopableNotice,
  selectWarningNotices,
  sortNotices,
  writeAcks,
  type Notice,
} from './noticeAck'

const NOW = 1_800_000_000_000
const TTL = 60_000
const DAY = 24 * 60 * 60 * 1000

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'info',
    title: '标题',
    body: '正文',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  } as Notice
}

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number { return this.map.size }
  clear(): void { this.map.clear() }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null }
  removeItem(key: string): void { this.map.delete(key) }
  setItem(key: string, value: string): void { this.map.set(key, String(value)) }
}

class ThrowingStorage implements Storage {
  get length() { return 0 }
  clear() {}
  getItem(_key: string): string | null {
    throw new Error('SecurityError: localStorage 不可用')
  }
  key(_index: number): string | null { return null }
  removeItem(_key: string): void {}
  setItem(_key: string, _value: string): void {
    throw new Error('QuotaExceededError')
  }
}

describe('readAcks / writeAcks', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('write → read 往返一致', () => {
    writeAcks({ n_1: NOW, n_2: NOW - 1000 }, storage)
    expect(readAcks(storage)).toEqual({ n_1: NOW, n_2: NOW - 1000 })
  })

  it('写入使用带账号后缀的跨端契约键', () => {
    expect(NOTICE_ACK_STORAGE_KEY).toBe('cloudcad_notice_acks')
    expect(ackStorageKey('u_1')).toBe('cloudcad_notice_acks:u_1')
    expect(ackStorageKey()).toBe('cloudcad_notice_acks:anonymous')
    writeAcks({ n_1: NOW }, storage, 'u_1')
    expect(storage.getItem('cloudcad_notice_acks:u_1')).toBe(JSON.stringify({ n_1: NOW }))
  })

  it('不同账号的簿记互不串用（A 已读不掩盖 B 的未读）', () => {
    writeAcks({ n_1: NOW }, storage, 'u_1')
    writeAcks({ n_2: NOW }, storage, 'u_2')
    expect(readAcks(storage, 'u_1')).toEqual({ n_1: NOW })
    expect(readAcks(storage, 'u_2')).toEqual({ n_2: NOW })
    expect(readAcks(storage)).toEqual({})
  })

  it('旧键（无账号后缀）不被读取，靠 TTL 自然失效', () => {
    storage.setItem(NOTICE_ACK_STORAGE_KEY, JSON.stringify({ n_1: NOW }))
    expect(readAcks(storage, 'u_1')).toEqual({})
  })

  it('空存储 / 非法 JSON / 数组形状都返回空表（不抛错）', () => {
    expect(readAcks(storage)).toEqual({})
    storage.setItem(ackStorageKey('u_1'), '{ 不是 JSON')
    expect(readAcks(storage, 'u_1')).toEqual({})
    storage.setItem(ackStorageKey('u_1'), '["n_1"]')
    expect(readAcks(storage, 'u_1')).toEqual({})
  })

  it('非有限数字时间戳被丢弃', () => {
    storage.setItem(
      ackStorageKey('u_1'),
      JSON.stringify({ n_1: 'bad', n_2: 123, n_3: null }),
    )
    expect(readAcks(storage, 'u_1')).toEqual({ n_2: 123 })
  })

  it('localStorage 不可用（隐私模式）读写都不抛错', () => {
    expect(readAcks(new ThrowingStorage())).toEqual({})
    expect(() => writeAcks({ n_1: NOW }, new ThrowingStorage())).not.toThrow()
  })
})

describe('isAcknowledged / filterUnacknowledged', () => {
  it('TTL 内已读', () => {
    expect(isAcknowledged({ n_1: NOW - 1000 }, 'n_1', NOW, TTL)).toBe(true)
  })

  it('恰好 TTL 边界视为过期', () => {
    expect(isAcknowledged({ n_1: NOW - TTL }, 'n_1', NOW, TTL)).toBe(false)
  })

  it('未记录视为未读', () => {
    expect(isAcknowledged({}, 'n_1', NOW, TTL)).toBe(false)
  })

  it('默认 TTL 为 24h（跨端契约值）', () => {
    expect(NOTICE_ACK_TTL_MS).toBe(DAY)
    expect(isAcknowledged({ n_1: NOW - DAY + 1 }, 'n_1', NOW)).toBe(true)
    expect(isAcknowledged({ n_1: NOW - DAY }, 'n_1', NOW)).toBe(false)
  })

  it('filterUnacknowledged 过滤已读并保留原有顺序', () => {
    const list = [notice({ id: 'a' }), notice({ id: 'b' }), notice({ id: 'c' })]
    const U = '2026-09-17T00:00:00.000Z'
    const kept = filterUnacknowledged(
      list,
      { [`${ackEntryKey('a', U)}`]: NOW - 1000, [ackEntryKey('c', U)]: NOW - 1000 },
      NOW,
      TTL,
    )
    expect(kept.map((n) => n.id)).toEqual(['b'])
  })
})

describe('ackEntryKey', () => {
  it('键为 id + 内容版本', () => {
    expect(ackEntryKey('n_1', '2026-09-17T00:00:00.000Z')).toBe(
      'n_1:2026-09-17T00:00:00.000Z',
    )
  })

  it('updatedAt 变化产生新键（级别升级/文案修改/下线重发都会重弹）', () => {
    expect(ackEntryKey('n_1', 'v1')).not.toBe(ackEntryKey('n_1', 'v2'))
    expect(ackEntryKey('n_1', 'v1')).not.toBe(ackEntryKey('n_2', 'v1'))
  })

  it('Date 实例按 ISO 串参与组键', () => {
    const d = new Date('2026-09-17T00:00:00.000Z')
    expect(ackEntryKey('n_1', d)).toBe('n_1:2026-09-17T00:00:00.000Z')
  })

  it('updatedAt 缺失仍保持复合形态，不退回按 id 判重', () => {
    expect(ackEntryKey('n_1')).toBe('n_1:')
    expect(ackEntryKey('n_1', null)).toBe('n_1:')
    expect(ackEntryKey('n_1')).not.toBe('n_1')
  })
})

describe('pruneExpiredAcks', () => {
  it('剔除超过 TTL 的记录，保留未过期的', () => {
    const acks = { fresh: NOW - 1000, stale: NOW - TTL - 1 }
    expect(pruneExpiredAcks(acks, NOW, TTL)).toEqual({ fresh: NOW - 1000 })
  })

  it('恰好 TTL 边界视为过期被剔除', () => {
    expect(pruneExpiredAcks({ n_1: NOW - TTL }, NOW, TTL)).toEqual({})
  })

  it('默认按 24h TTL 清理', () => {
    const acks = { fresh: NOW - DAY + 1, stale: NOW - DAY }
    expect(pruneExpiredAcks(acks, NOW)).toEqual({ fresh: NOW - DAY + 1 })
  })

  it('不修改入参对象', () => {
    const acks = { a: NOW - TTL - 1, b: NOW - 1000 }
    pruneExpiredAcks(acks, NOW, TTL)
    expect(acks).toEqual({ a: NOW - TTL - 1, b: NOW - 1000 })
  })
})

describe('sortNotices', () => {
  it('按级别降序（danger > warning > info）', () => {
    const sorted = sortNotices([
      notice({ id: 'a', level: 'info' }),
      notice({ id: 'b', level: 'danger' }),
      notice({ id: 'c', level: 'warning' }),
    ])
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })

  it('同级别按发布时间降序（新的在前）', () => {
    const sorted = sortNotices([
      notice({ id: 'old', publishedAt: '2026-09-17T00:00:00.000Z' }),
      notice({ id: 'new', publishedAt: '2026-09-17T12:00:00.000Z' }),
    ])
    expect(sorted.map((n) => n.id)).toEqual(['new', 'old'])
  })

  it('publishedAt 缺失时退回 createdAt', () => {
    const sorted = sortNotices([
      notice({ id: 'a', createdAt: '2026-09-17T00:00:00.000Z' }),
      notice({ id: 'b', createdAt: '2026-09-17T06:00:00.000Z' }),
    ])
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('未知级别排在已知级别之后', () => {
    const sorted = sortNotices([
      notice({ id: 'x', level: 'unknown' }),
      notice({ id: 'i', level: 'info' }),
    ])
    expect(sorted.map((n) => n.id)).toEqual(['i', 'x'])
  })

  it('同级别同时间按 id 稳定排序', () => {
    const same = notice({ publishedAt: '2026-09-17T00:00:00.000Z' })
    const sorted = sortNotices([{ ...same, id: 'zz' }, { ...same, id: 'aa' }])
    expect(sorted.map((n) => n.id)).toEqual(['aa', 'zz'])
  })

  it('不修改入参数组', () => {
    const input = [notice({ id: 'b' }), notice({ id: 'a' })]
    sortNotices(input)
    expect(input.map((n) => n.id)).toEqual(['b', 'a'])
  })
})

describe('selectPopableNotice', () => {
  it('只返回 danger 级别中最高优先的一条（warning/info 不走弹框）', () => {
    const active = selectPopableNotice(
      sortNotices([
        notice({ id: 'info_1', level: 'info' }),
        notice({ id: 'warn_1', level: 'warning' }),
        notice({ id: 'danger_1', level: 'danger' }),
      ]),
    )
    expect(active?.id).toBe('danger_1')
  })

  it('多条 danger 取最优先（同级别按时间降序）', () => {
    const active = selectPopableNotice(
      sortNotices([
        notice({ id: 'danger_old', level: 'danger', publishedAt: '2026-09-17T00:00:00.000Z' }),
        notice({ id: 'danger_new', level: 'danger', publishedAt: '2026-09-17T12:00:00.000Z' }),
      ]),
    )
    expect(active?.id).toBe('danger_new')
  })

  it('只有 warning/info 时不弹框（返回 null）', () => {
    expect(
      selectPopableNotice(sortNotices([
        notice({ id: 'info_1', level: 'info' }),
        notice({ id: 'warn_1', level: 'warning' }),
      ])),
    ).toBeNull()
  })

  it('只有 danger 时照常弹框', () => {
    const active = selectPopableNotice(
      sortNotices([notice({ id: 'danger_1', level: 'danger' })]),
    )
    expect(active?.id).toBe('danger_1')
  })

  it('空队列返回 null', () => {
    expect(selectPopableNotice([])).toBeNull()
  })

  it('warning/info 不阻塞 danger：排在前面也不影响 danger 弹出', () => {
    const active = selectPopableNotice([
      notice({ id: 'warn_1', level: 'warning' }),
      notice({ id: 'info_1', level: 'info' }),
      notice({ id: 'danger_1', level: 'danger' }),
    ])
    expect(active?.id).toBe('danger_1')
  })
})

describe('selectWarningNotices', () => {
  it('只取 warning 级别', () => {
    const warnings = selectWarningNotices(
      sortNotices([
        notice({ id: 'info_1', level: 'info' }),
        notice({ id: 'danger_1', level: 'danger' }),
        notice({ id: 'warn_1', level: 'warning' }),
        notice({ id: 'warn_2', level: 'warning' }),
      ]),
    )
    expect(warnings.map((n) => n.id)).toEqual(['warn_1', 'warn_2'])
  })

  it('无 warning 返回空数组', () => {
    expect(selectWarningNotices([notice({ id: 'i', level: 'info' })])).toEqual([])
  })
})
