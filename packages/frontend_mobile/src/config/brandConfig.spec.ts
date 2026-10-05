/**
 * 回归测试：品牌档案解析（config/brandConfig.ts）
 *
 * 品牌是唯一事实源，覆盖两个曾出问题的面：
 *   1. 运行时 brandProfile 只填了部分字段——未填的必须回落内置默认，
 *      而不是被整块清掉（PC mergeBrandOverrides 的逐字段浅合并语义）；
 *   2. brandProfile.legal.identities 是管理端唯一的主体覆盖入口，
 *      漏读会让「改完主体名页面纹丝不动」，且中文名不得跨语言泄漏到英文条款。
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BRAND,
  brandAssetPath,
  resolveBrand,
  resolveLegalVars,
} from './brandConfig'
import type { PublicRuntimeConfig } from '@/composables/useRuntimeConfig'

describe('resolveBrand', () => {
  it('未取到运行时配置时返回完整内置默认值', () => {
    const b = resolveBrand(null)
    expect(b.title).toBe(DEFAULT_BRAND.title)
    expect(b.shortName).toBe(DEFAULT_BRAND.shortName)
    expect(b.copyrightHolder).toBe(DEFAULT_BRAND.copyrightHolder)
    expect(b.copyrightText).toBe('© 2026 梦想网页CAD实时协同平台. All rights reserved.')
  })

  it('brandProfile 只填部分字段：未填的回落内置默认，不被整块清掉', () => {
    const b = resolveBrand({ brandProfile: { copyrightHolder: '某某科技有限公司' } })
    expect(b.copyrightHolder).toBe('某某科技有限公司')
    expect(b.title).toBe(DEFAULT_BRAND.title)
    expect(b.shortName).toBe(DEFAULT_BRAND.shortName)
    expect(b.copyrightYear).toBe(DEFAULT_BRAND.copyrightYear)
  })

  it('copyrightLine 的 {year} / {appName} 占位符按品牌解析', () => {
    const b = resolveBrand({ brandProfile: { title: '新标题', copyrightYear: '2030' } })
    expect(b.copyrightText).toBe('© 2030 新标题. All rights reserved.')
  })

  it('脏数据（数字 / 空串 / null）按未填处理，不抛错', () => {
    const dirty = {
      brandProfile: { title: 42, logo: null, copyrightYear: [] },
    } as unknown as Partial<PublicRuntimeConfig>
    const b = resolveBrand(dirty)
    expect(b.title).toBe(DEFAULT_BRAND.title)
    expect(b.copyrightYear).toBe(DEFAULT_BRAND.copyrightYear)
    expect(b.logo).toContain('logo.png')
  })

  it('shortName 从 legal.productShortName 取（与 PC 同一键位）', () => {
    const b = resolveBrand({ brandProfile: { legal: { productShortName: 'MxCAD' } } })
    expect(b.shortName).toBe('MxCAD')
  })
})

describe('brandAssetPath', () => {
  it('静态资源拼 BASE_URL，前导 ./ 与 / 归一', () => {
    const base = import.meta.env.BASE_URL ?? '/'
    const expected = (base.endsWith('/') ? base : `${base}/`) + 'logo.png'
    expect(brandAssetPath('logo.png')).toBe(expected)
    expect(brandAssetPath('./logo.png')).toBe(expected)
    expect(brandAssetPath('/logo.png')).toBe(expected)
  })

  it('外部 URL 与 data: URI 原样返回（管理端可配外链品牌图）', () => {
    expect(brandAssetPath('https://cdn.x.cn/a.png')).toBe('https://cdn.x.cn/a.png')
    expect(brandAssetPath('//cdn.x.cn/a.png')).toBe('//cdn.x.cn/a.png')
    expect(brandAssetPath('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })

  it('空串返回空串（不拼出带前缀的空路径）', () => {
    expect(brandAssetPath('')).toBe('')
    expect(brandAssetPath('   ')).toBe('')
  })
})

describe('resolveLegalVars', () => {
  it('未知语言回落 zh-CN', () => {
    const v = resolveLegalVars('fr-FR')
    expect(v.entityName).toBe(DEFAULT_BRAND.legalIdentities['zh-CN'].entityName)
    expect(v.productName).toBe(DEFAULT_BRAND.legalProductNames['zh-CN'])
  })

  it('每语言取自己的主体名', () => {
    expect(resolveLegalVars('en-US').entityName).toBe(
      DEFAULT_BRAND.legalIdentities['en-US'].entityName,
    )
    expect(resolveLegalVars('ko-KR').productName).toBe(
      DEFAULT_BRAND.legalProductNames['ko-KR'],
    )
  })

  it('管理端覆盖主体名，且中文名不跨语言泄漏到英文条款', () => {
    const config = {
      brandProfile: {
        legal: { identities: { 'zh-CN': { entityName: '某某科技有限公司' } } },
      },
    }
    expect(resolveLegalVars('zh-CN', config).entityName).toBe('某某科技有限公司')
    expect(resolveLegalVars('en-US', config).entityName).toBe(
      DEFAULT_BRAND.legalIdentities['en-US'].entityName,
    )
  })

  it('只配 legal.identities.default 通用主体名时各语言一致生效（对齐 PC getBrandLegalNames）', () => {
    const config = {
      brandProfile: { legal: { identities: { default: { entityName: '通用主体有限公司' } } } },
    }
    for (const lang of ['zh-CN', 'zh-TW', 'en-US', 'ko-KR']) {
      expect(resolveLegalVars(lang, config).entityName).toBe('通用主体有限公司')
    }
  })

  it('按语言配置优先于 default 通用主体名', () => {
    const config = {
      brandProfile: {
        legal: {
          identities: {
            default: { entityName: '通用主体有限公司' },
            'zh-CN': { entityName: '中文主体有限公司' },
          },
        },
      },
    }
    expect(resolveLegalVars('zh-CN', config).entityName).toBe('中文主体有限公司')
    expect(resolveLegalVars('en-US', config).entityName).toBe('通用主体有限公司')
  })

  it('productName / productShortName 是单值：各语言共用管理端填的那一份', () => {
    const config = { brandProfile: { legal: { productName: '某某工业CAD云' } } }
    for (const lang of ['zh-CN', 'zh-TW', 'en-US', 'ko-KR']) {
      expect(resolveLegalVars(lang, config).productName).toBe('某某工业CAD云')
    }
  })

  it('未取到配置时返回完整内置默认值', () => {
    const v = resolveLegalVars('zh-CN', null)
    expect(v.productShortName).toBe(DEFAULT_BRAND.shortName)
    expect(v.entityName).toBe(DEFAULT_BRAND.legalIdentities['zh-CN'].entityName)
  })
})
