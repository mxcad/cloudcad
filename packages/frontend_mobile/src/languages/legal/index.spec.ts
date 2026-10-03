/**
 * 回归测试：法务文档加载（H-01）
 *
 * loadLegalText = 按语言懒加载正文 + 品牌占位符解析（解析实现与 PC 共用
 * @cloudcad/platform 的 resolvePlaceholders）。关键回归点：
 *   1. 每语言加载对应正文（不串语言）；
 *   2. 占位符全部解析（{{entityName}} 等不得漏到页面）；
 *   3. 客服联系方式来自运行时配置（可注入）；
 *   4. 未知语言回落 zh-CN。
 */
import { describe, it, expect } from 'vitest'
import { loadLegalText, LEGAL_PRODUCT_SHORT_NAME } from './index'

describe('loadLegalText', () => {
  it('zh-CN 隐私政策：中文正文 + 客服联系方式按运行时配置解析', async () => {
    const out = await loadLegalText('privacy', 'zh-CN', {
      supportEmail: 'x@y.com',
      supportPhone: '13800000000',
    })
    expect(out.length).toBeGreaterThan(100)
    expect(out).toContain('一、我们收集的信息')
    expect(out).toContain('x@y.com')
    expect(out).toContain('13800000000')
    expect(out).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('en-US 用户协议：英文正文 + 品牌实体按英文名解析', async () => {
    const out = await loadLegalText('terms', 'en-US', {
      supportEmail: 'e@f.com',
      supportPhone: '123',
    })
    expect(out.length).toBeGreaterThan(100)
    expect(out).toContain('Chengdu Dreamkaide Technology Co., Ltd.')
    expect(out).toContain('Dream Web CAD Real-time Collaboration Platform')
    expect(out).toContain(LEGAL_PRODUCT_SHORT_NAME)
    expect(out).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('ko-KR 用户协议：韩文正文 + 韩文主体名', async () => {
    const out = await loadLegalText('terms', 'ko-KR')
    expect(out.length).toBeGreaterThan(100)
    expect(out).toContain('청두 드림카이드 테크놀로지 유한공사')
    expect(out).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('未知语言回落 zh-CN', async () => {
    const out = await loadLegalText('privacy', 'fr-FR')
    const zh = await loadLegalText('privacy', 'zh-CN')
    expect(out).toBe(zh)
  })

  it('客服配置缺省：占位符解析为空串（与 PC 默认值一致），正文仍完整', async () => {
    const out = await loadLegalText('privacy', 'zh-CN')
    expect(out.length).toBeGreaterThan(100)
    expect(out).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('运行时 brandProfile 覆盖品牌占位符（产品全称 / 简称 / 运营主体）', async () => {
    const out = await loadLegalText('terms', 'zh-CN', {
      supportEmail: '',
      supportPhone: '',
      brandProfile: {
        legal: {
          productName: '某某工业CAD云',
          productShortName: 'MxCAD',
          identities: { 'zh-CN': { entityName: '某某科技有限公司' } },
        },
      },
    })
    expect(out).toContain('某某工业CAD云')
    expect(out).toContain('MxCAD')
    expect(out).toContain('某某科技有限公司')
    // 内置默认品牌不再出现
    expect(out).not.toContain('梦想网页CAD实时协同平台')
    expect(out).not.toContain('成都梦想凯德科技有限公司')
    expect(out).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('brandProfile 只填了部分字段：未填的仍回落内置默认', async () => {
    const out = await loadLegalText('terms', 'zh-CN', {
      brandProfile: { legal: { productName: '某某工业CAD云' } },
    })
    expect(out).toContain('某某工业CAD云')
    expect(out).toContain(LEGAL_PRODUCT_SHORT_NAME)
    expect(out).toContain('成都梦想凯德科技有限公司')
  })

  it('identities 只取当前语言的条目：中文名不泄漏到英文条款', async () => {
    const brand = {
      legal: {
        identities: { 'zh-CN': { entityName: '某某科技有限公司' } },
      },
    }
    const en = await loadLegalText('terms', 'en-US', { brandProfile: brand })
    expect(en).not.toContain('某某科技有限公司')
    expect(en).toContain('Chengdu Dreamkaide Technology Co., Ltd.')
  })

  it('brandProfile 缺省时与旧行为完全一致', async () => {
    const withEmpty = await loadLegalText('terms', 'zh-CN', {
      brandProfile: {},
    })
    const without = await loadLegalText('terms', 'zh-CN')
    expect(withEmpty).toBe(without)
  })
})
