import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getLocalFeedbackRecords,
  saveLocalFeedbackRecord,
  type FeedbackLocalRecord,
} from './feedbackLocalRecords'

const STORAGE_KEY = 'feedback_local_records'

function makeRecord(overrides: Partial<FeedbackLocalRecord> = {}): FeedbackLocalRecord {
  return {
    code: 'FB-20261102-ABCD1234',
    title: '测试反馈',
    type: 'BUG',
    contentHtml: '<p>内容</p>',
    createdAt: '2026-11-02T10:00:00.000Z',
    source: 'MOBILE',
    anonymous: true,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('feedbackLocalRecords（本地反馈记录）', () => {
  it('存储为空时返回空数组', () => {
    expect(getLocalFeedbackRecords()).toEqual([])
  })

  it('写入后可读回（最新在前）', () => {
    saveLocalFeedbackRecord(makeRecord({ code: 'FB-1', createdAt: '2026-11-01T00:00:00Z' }))
    saveLocalFeedbackRecord(makeRecord({ code: 'FB-2', createdAt: '2026-11-02T00:00:00Z' }))
    const records = getLocalFeedbackRecords()
    expect(records.map((r) => r.code)).toEqual(['FB-2', 'FB-1'])
  })

  it('按 code 去重：重复提交同一 code 只保留最新一条', () => {
    saveLocalFeedbackRecord(makeRecord({ code: 'FB-1', title: '旧' }))
    saveLocalFeedbackRecord(makeRecord({ code: 'FB-1', title: '新' }))
    const records = getLocalFeedbackRecords()
    expect(records).toHaveLength(1)
    expect(records[0].title).toBe('新')
  })

  it('超出上限 50 条时淘汰最旧', () => {
    for (let i = 0; i < 55; i++) {
      saveLocalFeedbackRecord(makeRecord({ code: `FB-${i}` }))
    }
    const records = getLocalFeedbackRecords()
    expect(records).toHaveLength(50)
    // 最新在前：FB-54 在首位，最旧的 FB-0 被淘汰
    expect(records[0].code).toBe('FB-54')
    expect(records.map((r) => r.code)).not.toContain('FB-0')
  })

  it('数据损坏（非 JSON / 非数组 / 缺 code）时安全降级', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(getLocalFeedbackRecords()).toEqual([])

    localStorage.setItem(STORAGE_KEY, '{"a":1}')
    expect(getLocalFeedbackRecords()).toEqual([])

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ title: '无 code' }, makeRecord({ code: 'FB-OK' }), null])
    )
    const records = getLocalFeedbackRecords()
    expect(records.map((r) => r.code)).toEqual(['FB-OK'])
  })

  it('存储不可用（配额/隐私模式）时读写均静默不抛错', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveLocalFeedbackRecord(makeRecord())).not.toThrow()

    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(getLocalFeedbackRecords()).toEqual([])
  })
})
