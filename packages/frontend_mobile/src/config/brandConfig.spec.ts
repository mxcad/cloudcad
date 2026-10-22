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

  it('docsUrl 三层优先级：单项运行时项 > brandProfile > 内置默认', () => {
    expect(resolveBrand(null).docsUrl).toBe('https://help.mxdraw.com/')
    expect(
      resolveBrand({ brandProfile: { docsUrl: 'https://brand.example/' } }).docsUrl,
    ).toBe('https://brand.example/')
    expect(
      resolveBrand({
        docsUrl: 'https://runtime.example/',
        brandProfile: { docsUrl: 'https://brand.example/' },
      }).docsUrl,
    ).toBe('https://runtime.example/')
  })

  it('docsUrl 单项为空串时回落 brandProfile，再回落内置默认——「查看文档」链接永不为空', () => {
    expect(
      resolveBrand({ docsUrl: '', brandProfile: { docsUrl: 'https://brand.example/' } }).docsUrl,
    ).toBe('https://brand.example/')
    expect(resolveBrand({ docsUrl: '', brandProfile: { docsUrl: '' } }).docsUrl).toBe(
      DEFAULT_BRAND.docsUrl,
    )
  })

  it('brandTitle / brandLogo 单项运行时项优先于 brandProfile 同名字段（#499）', () => {
    const b = resolveBrand({
      brandTitle: '运行时标题',
      brandLogo: 'runtime-logo.png',
      brandProfile: { title: '整块标题', logo: 'block-logo.png' },
    })
    expect(b.title).toBe('运行时标题')
    expect(b.logo).toContain('runtime-logo.png')

    // 单项为空串回落整块，整块也没配回落内置默认
    expect(
      resolveBrand({ brandTitle: '', brandProfile: { title: '整块标题' } }).title,
    ).toBe('整块标题')
    expect(resolveBrand({ brandTitle: '', brandProfile: {} }).title).toBe(
      DEFAULT_BRAND.title,
    )
  })

  it('版权三项 + 法务产品短名：单项运行时键优先于 brandProfile 同名字段（#501）', () => {
    const b = resolveBrand({
      brandCopyrightLine: '© {year} {appName} — 单项',
      brandCopyrightYear: '2031',
      brandCopyrightHolder: '单项持有方',
      brandLegalProductShortName: '单项短名',
      brandProfile: {
        copyrightLine: '© {year} {appName} — 整块',
        copyrightYear: '2030',
        copyrightHolder: '整块持有方',
        legal: { productShortName: '整块短名' },
      },
    })
    expect(b.copyrightText).toBe('© 2031 梦想网页CAD实时协同平台 — 单项')
    expect(b.copyrightYear).toBe('2031')
    expect(b.copyrightHolder).toBe('单项持有方')
    expect(b.shortName).toBe('单项短名')

    // 单项为空串回落整块，整块也没配回落内置默认
    expect(
      resolveBrand({
        brandCopyrightYear: '',
        brandProfile: { copyrightYear: '2030' },
      }).copyrightYear,
    ).toBe('2030')
    expect(resolveBrand({ brandCopyrightYear: '', brandProfile: {} }).copyrightYear).toBe(
      DEFAULT_BRAND.copyrightYear,
    )
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

  it('brandLegalProductName 单项运行时键优先于 legal.productName，留空回落内置按语言值（#501）', () => {
    const config = {
      brandLegalProductName: '单项全称',
      brandProfile: { legal: { productName: '整块全称' } },
    }
    for (const lang of ['zh-CN', 'zh-TW', 'en-US', 'ko-KR']) {
      expect(resolveLegalVars(lang, config).productName).toBe('单项全称')
    }

    expect(
      resolveLegalVars('en-US', {
        brandLegalProductName: '',
        brandProfile: { legal: { productName: '整块全称' } },
      }).productName,
    ).toBe('整块全称')
    expect(
      resolveLegalVars('en-US', {
        brandLegalProductName: '',
        brandProfile: {},
      }).productName,
    ).toBe(DEFAULT_BRAND.legalProductNames['en-US'])
  })

  it('未取到配置时返回完整内置默认值', () => {
    const v = resolveLegalVars('zh-CN', null)
    expect(v.productShortName).toBe(DEFAULT_BRAND.shortName)
    expect(v.entityName).toBe(DEFAULT_BRAND.legalIdentities['zh-CN'].entityName)
  })
})
