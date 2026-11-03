/**
 * 富文本安全处理单测（与 PC richtext.spec.tsx 同口径，移植自 ADR-0085）。
 *
 * 覆盖反馈 content 的三道防线：
 *  - sanitizeRichText：白名单净化（script、on 事件属性、javascript:、非图片 data: 全剥离）
 *  - stripHtmlTags：可见文本（字数校验 + 列表降级展示）
 *  - toPersistableHtml：提交前剥离本地预览 blob:/data: src（保留 data-att-id 水合）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sanitizeRichText,
  stripHtmlTags,
  toPersistableHtml,
  escapeHtml,
} from './richtext'

// happy-dom 的 DOMParser 会执行内联 <script>（真实浏览器中 parseFromString
// 产出的 script 是惰性的，不会执行）——stub 掉 alert 避免测试环境抛错，
// 用例断言的仍是「script 标签被剥离」这一产品行为。
beforeEach(() => {
  vi.stubGlobal('alert', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sanitizeRichText（富文本白名单净化）', () => {
  it('剥离 script 标签内容（不执行）', () => {
    const out = sanitizeRichText('<p>你好</p><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('你好')
  })

  it('剥离 on* 事件属性', () => {
    const out = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA" onerror="alert(1)">'
    )
    expect(out).not.toContain('onerror')
  })

  it('剥离 javascript: URL', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('保留 http(s) 链接与 data:image 图片', () => {
    const out = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA"><a href="https://a.com">L</a>'
    )
    expect(out).toContain('data:image/png')
    expect(out).toContain('https://a.com')
  })

  it('剥离 data:text/html 等非图片 data URL', () => {
    const out = sanitizeRichText('<img src="data:text/html;base64,AAAA">')
    expect(out).not.toContain('data:text/html')
  })

  it('保留附件卡片固定类与 data-att-id/data-kind/data-label', () => {
    const card =
      '<span class="fb-att-card" data-kind="DRAWING" data-label="a.mxweb" data-att-id="abc-123">' +
      '<span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
    const out = sanitizeRichText(card)
    expect(out).toContain('fb-att-card')
    expect(out).toContain('data-att-id="abc-123"')
    expect(out).toContain('data-kind="DRAWING"')
    expect(out).toContain('data-label')
  })

  it('剥离任意自定义 class（防样式注入）', () => {
    const out = sanitizeRichText('<span class="evil-float">x</span>')
    expect(out).not.toContain('evil-float')
  })

  it('剥离 iframe/object/form 未知标签，保留文本', () => {
    // 不带 src：happy-dom 会对 iframe src 发起真实加载（相对 URL 解析到
    // localhost:3000），用例只验证标签剥离，不需要 src
    const out = sanitizeRichText('<p>a</p><iframe></iframe><form action="x"></form><p>b</p>')
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('<form')
    expect(out).toContain('a')
    expect(out).toContain('b')
  })

  it('非法 data-att-id 字符集被剥离（防注入）', () => {
    const out = sanitizeRichText(
      '<span class="fb-att-card" data-att-id="bad id"><span class="fb-att-card-label">x</span></span>'
    )
    expect(out).not.toContain('data-att-id')
  })
})

describe('stripHtmlTags', () => {
  it('剥离标签得到可见文本（textContent 连接，无标签间空白）', () => {
    expect(stripHtmlTags('<p>你好<strong>世界</strong></p>')).toBe('你好世界')
  })

  it('解码实体', () => {
    expect(stripHtmlTags('a &amp; b &lt;c&gt;')).toBe('a & b <c>')
  })

  it('空串返回空串', () => {
    expect(stripHtmlTags('')).toBe('')
  })
})

describe('toPersistableHtml（提交前收敛）', () => {
  it('剥离 blob: 本地预览 src，保留 data-att-id', () => {
    const out = toPersistableHtml(
      '<p>x</p><img src="blob:http://x/abc" data-att-id="id-1" alt="i">'
    )
    expect(out).not.toContain('blob:')
    expect(out).toContain('data-att-id="id-1"')
  })

  it('保留 http(s) 图片 src', () => {
    const out = toPersistableHtml('<img src="https://a.com/x.png" data-att-id="id-1">')
    expect(out).toContain('https://a.com/x.png')
  })

  it('无 data-att-id 的 data:image 图片 src 保留（自包含图片）', () => {
    const out = toPersistableHtml('<img src="data:image/png;base64,AAAA">')
    expect(out).toContain('data:image/png')
  })
})

describe('escapeHtml', () => {
  it('转义 & < > "', () => {
    expect(escapeHtml('<a b="c">')).toBe('&lt;a b=&quot;c&quot;&gt;')
  })
})
