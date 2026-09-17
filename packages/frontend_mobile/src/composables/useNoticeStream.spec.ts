import { beforeEach, describe, expect, it } from 'vitest'
import {
  NOTICE_ACK_STORAGE_KEY_FOR_TEST,
  filterUnacknowledged,
  isAcknowledged,
  readAcks,
  sortNotices,
  writeAcks,
  type Notice,
} from './useNoticeStream'

const NOW = 1_800_000_000_000
const TTL = 60_000

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

describe('useNoticeStream 纯函数', () => {
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

  describe('readAcks / writeAcks', () => {
    let storage: MemoryStorage

    beforeEach(() => {
      storage = new MemoryStorage()
    })

    it('往返读写一致', () => {
      writeAcks({ n_1: NOW, n_2: NOW - 1000 }, storage)
      expect(readAcks(storage)).toEqual({ n_1: NOW, n_2: NOW - 1000 })
    })

    it('空存储与非法内容都返回空表（不抛错）', () => {
      expect(readAcks(storage)).toEqual({})
      storage.setItem(NOTICE_ACK_STORAGE_KEY_FOR_TEST, '{ 不是 JSON')
      expect(readAcks(storage)).toEqual({})
      storage.setItem(NOTICE_ACK_STORAGE_KEY_FOR_TEST, '["n_1"]')
      expect(readAcks(storage)).toEqual({})
    })

    it('非数字时间戳被丢弃', () => {
      storage.setItem(
        NOTICE_ACK_STORAGE_KEY_FOR_TEST,
        JSON.stringify({ n_1: 'bad', n_2: 123, n_3: null }),
      )
      expect(readAcks(storage)).toEqual({ n_2: 123 })
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

    it('过滤掉已读的并保留原有顺序', () => {
      const list = [notice({ id: 'a' }), notice({ id: 'b' })]
      expect(filterUnacknowledged(list, { b: NOW - 1000 }, NOW, TTL).map((n) => n.id)).toEqual([
        'a',
      ])
    })

    it('全部已读返回空数组', () => {
      expect(filterUnacknowledged([notice({ id: 'a' })], { a: NOW }, NOW, TTL)).toEqual([])
    })
  })
})
