/**
 * 回归测试：VoerkaI18n 消息目录完整性（messages/ 四件套 + idMap）
 *
 * 覆盖的缺陷族：pnpm i18nCompile 会静默把目录重建为「HEAD 减若干键」且不报错；
 * 手改 idMap/messages 时漏掉某个语言、重复 id、或把 id 写成非数字，都会让 t()
 * 静默回退成中文源码串。这里在 CI 里直接断言目录结构，不依赖编译流程。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const LANGS = ['zh-CN', 'zh-TW', 'en-US', 'ko-KR'] as const
const DIR = dirname(fileURLToPath(import.meta.url))

const idMap = JSON.parse(readFileSync(join(DIR, 'idMap.json'), 'utf8'))

// messages/*.ts 形态为 `export default  { ...JSON... }`，截取花括号区间即可解析
function loadMessages(lang: (typeof LANGS)[number]) {
  const txt = readFileSync(join(DIR, `${lang}.ts`), 'utf8')
  const body = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)
  return { txt, ids: JSON.parse(body) as Record<string, string> }
}

// idMap.json / messages/*.ts 的最后一条都不带尾逗号、分隔符可能独占一行，
// 断言「整行以 , 结尾」会误报，所以这里只读键集合不校验标点。

describe('i18n 消息目录完整性', () => {
  it('idMap 键唯一、值均为数字', () => {
    const vals = Object.values(idMap)
    expect(vals.length).toBeGreaterThan(1100)
    expect(new Set(vals).size).toBe(vals.length)
    for (const v of vals) expect(Number.isInteger(v)).toBe(true)
  })

  it('四语言 id 集合完全一致，且与 idMap 双向对齐', () => {
    const zh = new Set(Object.keys(loadMessages('zh-CN').ids))
    const mapIds = new Set(Object.values(idMap).map(String))
    for (const lang of LANGS) {
      const ids = new Set(Object.keys(loadMessages(lang).ids))
      expect(ids.size, `${lang} id 重复`).toBe(Object.keys(loadMessages(lang).ids).length)
      expect(ids, `${lang} id 集合应与 zh-CN 一致`).toEqual(zh)
      for (const id of mapIds) expect(ids.has(id), `${lang} 缺 idMap 中的 ${id}`).toBe(true)
      for (const id of ids) expect(mapIds.has(id), `idMap 缺 ${lang} 中的 ${id}`).toBe(true)
    }
  })

  // 2026-10-03 起存量未翻译债务清零（en-US / ko-KR 各 79 条已全部补译），
  // 故不再需要「已登记债务区间」白名单——任何中文即漏翻，立即红灯。
  it('en-US / ko-KR 不得含中文（漏翻立即失败）', () => {
    for (const lang of ['en-US', 'ko-KR'] as const) {
      const ids = loadMessages(lang).ids
      const offenders = Object.keys(ids).filter((id) => /[一-龥]/.test(ids[id]))
      expect(offenders, `${lang} 出现未翻译键`).toEqual([])
    }
  })

  it('不得出现空白文案（t() 会返回 falsy 静默降级成中文源码串）', () => {
    for (const lang of LANGS) {
      const blanks = Object.entries(loadMessages(lang).ids)
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k)
      expect(blanks, `${lang} 空白文案`).toEqual([])
    }
  })
})
