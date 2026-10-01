import { describe, expect, it } from 'vitest'
import { checkFileName } from '@cloudcad/platform'
import { validateName } from './validateName'

// 判定规则收敛在 @cloudcad/platform 的 checkFileName（与 PC 共用），
// 这里既锁共享判定（reasonCode 契约），也锁移动端薄适配的 reasonCode → i18n 映射。
describe('checkFileName（platform 共享判定）', () => {
  it('合法名称返回 { valid: true }', () => {
    expect(checkFileName('图纸1.dwg')).toEqual({ valid: true })
    expect(checkFileName('folder name')).toEqual({ valid: true })
    expect(checkFileName('a.b')).toEqual({ valid: true })
  })

  it('空名 / 纯空白 → empty', () => {
    expect(checkFileName('')).toEqual({ valid: false, reason: 'empty' })
    expect(checkFileName('   ')).toEqual({ valid: false, reason: 'empty' })
  })

  it('长度边界：255 合法，256 → too_long', () => {
    expect(checkFileName('a'.repeat(255))).toEqual({ valid: true })
    expect(checkFileName('a'.repeat(256))).toEqual({ valid: false, reason: 'too_long' })
  })

  it('非法字符 < > : " | ? * / \\ → illegal_chars', () => {
    for (const c of ['<', '>', ':', '"', '|', '?', '*', '/', '\\']) {
      expect(checkFileName(`a${c}b`)).toEqual({ valid: false, reason: 'illegal_chars' })
    }
  })

  it('控制字符（NUL / DEL 等）→ control_chars', () => {
    expect(checkFileName('a\x00b')).toEqual({ valid: false, reason: 'control_chars' })
    expect(checkFileName('a\x1fb')).toEqual({ valid: false, reason: 'control_chars' })
  })

  it('Windows 保留名 → reserved_name（大小写不敏感，COM1-9 / LPT1-9）', () => {
    for (const n of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9']) {
      expect(checkFileName(n)).toEqual({ valid: false, reason: 'reserved_name' })
    }
  })

  it('保留名带扩展名 / COM0 均合法', () => {
    expect(checkFileName('CON.txt')).toEqual({ valid: true })
    expect(checkFileName('COM0')).toEqual({ valid: true })
  })

  it('首尾点 → dot_edges，中间点合法', () => {
    expect(checkFileName('.hidden')).toEqual({ valid: false, reason: 'dot_edges' })
    expect(checkFileName('name.')).toEqual({ valid: false, reason: 'dot_edges' })
    expect(checkFileName('.a.')).toEqual({ valid: false, reason: 'dot_edges' })
    expect(checkFileName('a.b')).toEqual({ valid: true })
  })
})

describe('validateName（移动端薄适配：reasonCode → i18n 文案）', () => {
  it('合法名称 → { valid: true }', () => {
    expect(validateName('图纸1')).toEqual({ valid: true })
  })

  it('不合法 → { valid: false, error: 非空文案 }', () => {
    const bad = ['', 'x'.repeat(256), 'a/b', 'a\x00b', 'CON', '.a']
    for (const name of bad) {
      const r = validateName(name)
      expect(r.valid).toBe(false)
      expect(typeof r.error).toBe('string')
      expect((r.error ?? '').length).toBeGreaterThan(0)
    }
  })
})
