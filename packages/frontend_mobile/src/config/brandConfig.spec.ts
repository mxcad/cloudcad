/**
 * 回归测试：品牌档案解析（config/brandConfig.ts）
 *
 * 品牌是唯一事实源，覆盖两个曾出问题的面：
 *   1. 运行时 brandProfile 只填了部分字段——未填的必须回落内置默认，
 *      而不是被整块清掉（PC mergeBrandOverrides 的逐字段浅合并语义）；
 *   2. brandProfile.legal.identities 是管理端唯一的主体覆盖入口，
 *      漏读会让「改完主体名页面纹丝不动」，且中文名不得跨语言泄漏到英文条款。
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_BRAND,
  BRAND_CHROME_CACHE_KEY,
  ICON_LINK_SELECTOR,
  applyBrandChrome,
  brandAssetPath,
  resolveBrand,
  resolveLegalVars,
  saveBrandChromeCache,
  type MobileBrand,
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
    expect(resolveBrand(null).docsUrl).toBe(
      'https://demo.mxdraw3d.com/download/%E6%A2%A6%E6%83%B3CAD%E5%8D%8F%E5%90%8C%E5%B9%B3%E5%8F%B0%E7%A7%81%E6%9C%89%E5%8C%96%E9%83%A8%E7%BD%B2%E6%93%8D%E4%BD%9C%E6%8C%87%E5%8D%97.pdf',
    )
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

describe('applyBrandChrome（页签标题与图标落地）', () => {
  const hrefOf = (link: HTMLLinkElement): string => link.getAttribute('href') ?? ''

  function seedIconLinks(): HTMLLinkElement[] {
    document.head.querySelectorAll('link').forEach((link) => link.remove())
    const links = [document.createElement('link'), document.createElement('link')]
    links[0]!.setAttribute('rel', 'icon')
    links[0]!.setAttribute('href', '/logo.png')
    links[1]!.setAttribute('rel', 'apple-touch-icon')
    links[1]!.setAttribute('href', '/apple-logo.png')
    links.forEach((link) => document.head.appendChild(link))
    return links
  }

  const brand: MobileBrand = {
    title: '移动端品牌',
    logo: '/brand/logo.ico',
    docsUrl: 'https://docs.example/',
    shortName: 'CloudCAD',
    copyrightYear: '2026',
    copyrightHolder: 'Chengdu Dreamkaide Technology Co., Ltd.',
    copyrightText: '© 2026 CloudCAD. All rights reserved.',
  }

  it('覆盖页签标题与所有图标 link（含 apple-touch-icon），并按扩展名修正 type', () => {
    const links = seedIconLinks()
    applyBrandChrome(brand)
    expect(document.title).toBe('移动端品牌')
    expect(hrefOf(links[0]!)).toBe('/brand/logo.ico')
    expect(hrefOf(links[1]!)).toBe('/brand/logo.ico')
    expect(links[0]!.type).toBe('image/x-icon')
    expect(links[1]!.type).toBe('image/x-icon')
  })

  it('选择器必须命中 apple-touch-icon：浏览器按空白分词，rel~=icon 会漏掉整词', () => {
    const links = seedIconLinks()
    expect(ICON_LINK_SELECTOR).toBe('link[rel*="icon"]')
    expect(document.head.querySelectorAll(ICON_LINK_SELECTOR).length).toBe(2)
    expect(hrefOf(links[0]!)).toBe('/logo.png')
    expect(hrefOf(links[1]!)).toBe('/apple-logo.png')
  })

  it('无扩展名的 Logo URL 不推断 type，保留原值', () => {
    const links = seedIconLinks()
    links[0]!.setAttribute('type', 'image/x-icon')
    applyBrandChrome({ ...brand, logo: '/brand/logo' })
    expect(links[0]!.type).toBe('image/x-icon')
  })
})

describe('saveBrandChromeCache（首帧品牌缓存）', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('写入生效的品牌标题与 Logo，供 index.html 内联脚本在 bundle 前应用', () => {
    saveBrandChromeCache('梦想网页CAD实时协同平台', '/brand/logo.png')

    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null')
    expect(cache).toEqual({
      appName: '梦想网页CAD实时协同平台',
      logo: '/brand/logo.png',
    })
  })

  it('只放行同源相对路径：可执行/协议相对地址不落盘，首帧保留静态兜底 Logo', () => {
    for (const unsafe of [
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
      '//evil.example/logo.png',
      'https://evil.example/logo.png',
      '/brand/logo png.png',
    ]) {
      localStorage.clear()
      saveBrandChromeCache('品牌名', unsafe)
      const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null')
      expect(cache, unsafe).toEqual({ appName: '品牌名', logo: '' })
    }
  })

  it('后端同源 Logo URL（无扩展名、带 query）正常落盘', () => {
    saveBrandChromeCache('品牌名', '/api/v1/runtime-config/brand-logo?v=3')
    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null')
    expect(cache.logo).toBe('/api/v1/runtime-config/brand-logo?v=3')
  })

  it('超长标题截断，避免撑爆标签栏', () => {
    saveBrandChromeCache('A'.repeat(500), '/logo.png')
    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null')
    expect(cache.appName).toHaveLength(200)
  })

  it('隐私模式等写入失败时静默忽略，不影响品牌生效', () => {
    // 直接换掉 setItem 并在 finally 里换回：vi.spyOn 在这里还原不彻底，
    // 会把抛错的替身漏给后续 describe（QuotaExceededError 串场）
    const originalSetItem = localStorage.setItem
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new Error('QuotaExceededError')
      },
      configurable: true,
      writable: true,
    })
    try {
      expect(() => saveBrandChromeCache('品牌名', '/logo.png')).not.toThrow()
    } finally {
      Object.defineProperty(localStorage, 'setItem', {
        value: originalSetItem,
        configurable: true,
        writable: true,
      })
    }
  })

  it('index.html 的内联脚本必须读取同一个键名——漂移会让缓存静默失效', async () => {
    const html = await readFile(
      resolve(import.meta.dirname, '../../index.html'),
      'utf8',
    )
    expect(html).toContain(BRAND_CHROME_CACHE_KEY)
    // 内联脚本必须在 bundle 之前执行，否则起不到「首帧已生效」的作用
    expect(html.indexOf(BRAND_CHROME_CACHE_KEY)).toBeLessThan(html.indexOf('src/main.ts'))
  })
})

describe('index.html 内联脚本（首帧应用缓存）', () => {
  afterEach(() => {
    localStorage.clear()
  })

  async function readInlineScript(): Promise<string> {
    const html = await readFile(resolve(import.meta.dirname, '../../index.html'), 'utf8')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)
    expect(script?.[1], 'index.html 缺少内联首帧脚本').toBeTruthy()
    return script![1]
  }

  function seedCachedCache(): HTMLLinkElement[] {
    // 先清 head 再设标题：happy-dom 的 document.title 落在 <title> 元素上，
    // 后清 head 会把刚设的标题一并抹掉
    document.head.innerHTML = ''
    document.title = '梦想网页CAD实时协同平台'
    localStorage.setItem(
      BRAND_CHROME_CACHE_KEY,
      JSON.stringify({ appName: '缓存的品牌名', logo: '/cached/logo.png' }),
    )
    return [
      { rel: 'icon', href: '/logo.png' },
      { rel: 'apple-touch-icon', href: '/logo.png' },
    ].map((attrs) => {
      const link = document.createElement('link')
      Object.entries(attrs).forEach(([name, value]) => link.setAttribute(name, value))
      document.head.appendChild(link)
      return link
    })
  }

  it('有缓存时首帧就是运行时配置的值，不再闪打包兜底值', async () => {
    const links = seedCachedCache()

    // eslint-disable-next-line no-new-func -- 执行 index.html 里的内联脚本本体
    new Function(await readInlineScript())()

    expect(document.title).toBe('缓存的品牌名')
    expect(links[0]!.getAttribute('href')).toBe('/cached/logo.png')
    expect(links[1]!.getAttribute('href')).toBe('/cached/logo.png')
  })

  it('没有缓存（首次访问）时保持静态兜底值', async () => {
    const links = seedCachedCache()
    localStorage.clear()

    new Function(await readInlineScript())()

    expect(document.title).toBe('梦想网页CAD实时协同平台')
    expect(links[0]!.getAttribute('href')).toBe('/logo.png')
  })

  it('缓存被篡改成可执行地址时不应用 Logo，也不影响标题', async () => {
    const links = seedCachedCache()
    localStorage.setItem(
      BRAND_CHROME_CACHE_KEY,
      JSON.stringify({ appName: '缓存的品牌名', logo: 'javascript:alert(1)' }),
    )

    new Function(await readInlineScript())()

    expect(document.title).toBe('缓存的品牌名')
    expect(links[0]!.getAttribute('href')).toBe('/logo.png')
  })

  it('缓存是坏 JSON / 存储不可用时不抛错、不动任何值', async () => {
    const script = await readInlineScript()
    const links = seedCachedCache()
    localStorage.setItem(BRAND_CHROME_CACHE_KEY, '{oops')

    expect(() => new Function(script)()).not.toThrow()

    expect(document.title).toBe('梦想网页CAD实时协同平台')
    expect(links[0]!.getAttribute('href')).toBe('/logo.png')
  })
})
