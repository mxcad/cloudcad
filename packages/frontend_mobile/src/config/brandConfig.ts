import {
  ensureRuntimeConfig,
  getRuntimeConfigSnapshot,
  subscribeRuntimeConfig,
  type PublicRuntimeConfig,
} from '@/composables/useRuntimeConfig'

/**
 * 移动端品牌配置唯一出口（纯函数层，不含响应式）。
 *
 * 移动端刻意不走 PC 的 `/brand/config.json` 静态文件层：那是 config-service 写的
 * 部署期文件，与 runtime-config 的 `brandProfile`（DB，管理端可热改）是两套并行
 * 存储、两个管理界面且无同步机制。照抄 PC 等于把双轨债务带进移动端，所以这里
 * 只留两层：runtime-config `brandProfile`（最高）> 内置默认值。
 *
 * 内置默认值逐项对齐 PC `constants/appConfig.ts` 的 DEFAULT_BRAND_PROFILE /
 * DEFAULT_LEGAL_PRODUCT_NAMES，改品牌只改后端管理端的 `brandProfile`（或这里与
 * PC 的默认值，须双边同步）。
 *
 * 客服邮箱/电话不在这里：走 `utils/supportContact.ts`——未配置时不编造假联系方式。
 */

/** 品牌档案内置默认值（与 PC 同名常量逐项对齐，勿单边修改） */
export const DEFAULT_BRAND = {
  /** 应用主标题：浏览器页签标题 + 认证页品牌名 */
  title: '梦想网页CAD实时协同平台',
  /** Logo 相对路径（同为 favicon 来源） */
  logo: 'logo.png',
  /** 帮助文档地址（对齐 PC DEFAULT_BRAND_PROFILE.docsUrl） */
  docsUrl: 'https://help.mxdraw.com/',
  /** 产品简称：i18n 文案插值用（「创建账户，开始使用 {shortName}」） */
  shortName: 'CloudCAD',
  copyrightYear: '2026',
  copyrightHolder: 'Chengdu Dreamkaide Technology Co., Ltd.',
  copyrightLine: '© {year} {appName}. All rights reserved.',
  /** 法务正文产品全称（按语言，对齐 PC DEFAULT_LEGAL_PRODUCT_NAMES） */
  legalProductNames: {
    'zh-CN': '梦想网页CAD实时协同平台',
    'zh-TW': '夢想網頁CAD即時協同平台',
    'en-US': 'Dream Web CAD Real-time Collaboration Platform',
    'ko-KR': '드림 웹 CAD 실시간 협업 플랫폼',
  } as Record<string, string>,
  /** 法务签约主体（按语言，对齐 PC DEFAULT_BRAND_PROFILE.legal.identities） */
  legalIdentities: {
    'zh-CN': { entityName: '成都梦想凯德科技有限公司' },
    'zh-TW': { entityName: '成都夢想凱德科技有限公司' },
    'en-US': { entityName: 'Chengdu Dreamkaide Technology Co., Ltd.' },
    'ko-KR': { entityName: '청두 드림카이드 테크놀로지 유한공사' },
  } as Record<string, { entityName: string }>,
} as const

/** 解析后的品牌档案 */
export interface MobileBrand {
  /** 应用主标题 */
  title: string
  /** Logo 绝对路径（含 BASE_URL） */
  logo: string
  /** 帮助文档地址（「实时协同」提示里的「查看文档」链接） */
  docsUrl: string
  /** 产品简称 */
  shortName: string
  copyrightYear: string
  copyrightHolder: string
  /** 版权行：`{year}` / `{appName}` 已解析 */
  copyrightText: string
}

/** 法务正文品牌变量 */
export interface BrandLegalVars {
  productName: string
  productShortName: string
  entityName: string
}

const DEFAULT_LANGUAGE = 'zh-CN'

/** `identities` 的通用主体键，与 PC `DEFAULT_LEGAL_LANGUAGE` 同为字面量 'default' */
const LEGAL_DEFAULT_KEY = 'default'

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 静态资源路径拼 BASE_URL。移动端 base 是 `./`（三个 .env 文件），绝对路径
 * `/logo.png` 会脱离部署子路径；外部 URL / data: URI 原样返回。
 */
export function brandAssetPath(path: string): string {
  const p = path.trim()
  if (!p) return ''
  if (/^(https?:)?\/\//.test(p) || p.startsWith('data:')) return p
  const base = import.meta.env.BASE_URL ?? '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return normalized + p.replace(/^\.?\/+/, '')
}

/**
 * 品牌档案解析：runtime-config `brandProfile` > 内置默认。
 * 逐字段浅合并——只覆盖管理端声明了的字段，避免只填了 copyrightHolder 把标题一起清掉。
 * 单项运行时键例外（与 PC 合并链一致，#499/#501）：`brandTitle` / `brandLogo` /
 * `docsUrl` / 版权三项 / 法务产品短名 等单项项优先于 brandProfile 里的同名字段，
 * 两层都为空才回落内置默认。
 */
export function resolveBrand(runtime?: Partial<PublicRuntimeConfig> | null): MobileBrand {
  const brand = runtime?.brandProfile ?? null
  const legal = brand?.legal ?? null

  const title = asText(runtime?.brandTitle) || asText(brand?.title) || DEFAULT_BRAND.title
  const logo = asText(runtime?.brandLogo) || asText(brand?.logo) || DEFAULT_BRAND.logo
  const docsUrl =
    asText(runtime?.docsUrl) || asText(brand?.docsUrl) || DEFAULT_BRAND.docsUrl
  const shortName =
    asText(runtime?.brandLegalProductShortName) ||
    asText(legal?.productShortName) ||
    DEFAULT_BRAND.shortName
  const copyrightYear =
    asText(runtime?.brandCopyrightYear) ||
    asText(brand?.copyrightYear) ||
    DEFAULT_BRAND.copyrightYear
  const copyrightHolder =
    asText(runtime?.brandCopyrightHolder) ||
    asText(brand?.copyrightHolder) ||
    DEFAULT_BRAND.copyrightHolder
  const copyrightLine =
    asText(runtime?.brandCopyrightLine) ||
    asText(brand?.copyrightLine) ||
    DEFAULT_BRAND.copyrightLine

  return {
    title,
    logo: brandAssetPath(logo),
    docsUrl,
    shortName,
    copyrightYear,
    copyrightHolder,
    copyrightText: copyrightLine
      .replace(/\{year\}/g, copyrightYear)
      .replace(/\{appName\}/g, title),
  }
}

/**
 * 法务正文品牌变量：语言兜底顺序与 PC getBrandLegalNames 一致（当前语言 → zh-CN → 空串）。
 * `productName` / `productShortName` 是单值（管理端只填一份，各语言共用）；
 * `identities` 按语言取，不跨语言借用——否则只填中文名会让英文条款出现中文主体。
 * 单项运行时键（`brandLegalProductName` / `brandLegalProductShortName`，#501）
 * 优先于 brandProfile 里的同名字段，与 resolveBrand 的回落链一致。
 */
export function resolveLegalVars(
  language: string,
  runtime?: Partial<PublicRuntimeConfig> | null,
): BrandLegalVars {
  const legal = runtime?.brandProfile?.legal ?? null

  const names = DEFAULT_BRAND.legalProductNames
  const identities = DEFAULT_BRAND.legalIdentities
  const fallback = names[DEFAULT_LANGUAGE] ?? ''
  const defaultIdentity = identities[DEFAULT_LANGUAGE]?.entityName ?? ''

  return {
    productName:
      asText(runtime?.brandLegalProductName) ||
      asText(legal?.productName) ||
      names[language] ||
      fallback,
    productShortName:
      asText(runtime?.brandLegalProductShortName) ||
      asText(legal?.productShortName) ||
      DEFAULT_BRAND.shortName,
    // 兜底阶梯须与 PC `appConfig.ts getBrandLegalNames` 一致：运营可能只填
    // `legal.identities.default` 作为通用主体名，漏掉该分支会让 PC 生效、移动端静默忽略。
    entityName:
      legal?.identities?.[language]?.entityName ||
      legal?.identities?.[LEGAL_DEFAULT_KEY]?.entityName ||
      identities[language]?.entityName ||
      identities[LEGAL_DEFAULT_KEY]?.entityName ||
      defaultIdentity,
  }
}

/**
 * 匹配 `rel="icon"` 与 `rel="apple-touch-icon"`。
 * 不能用 `link[rel~="icon"]`——`~=` 按空白分词，`apple-touch-icon` 是单个整词，
 * 匹配不到，会让 iOS 主屏图标一直停在打包值。
 */
export const ICON_LINK_SELECTOR = 'link[rel*="icon"]'

const ICON_TYPE_BY_EXTENSION: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/** 按扩展名推断图标 MIME；无扩展名（后端同源 Logo URL）不推断，保留原值 */
function iconTypeOf(href: string): string | undefined {
  const path = href.split(/[?#]/, 1)[0] ?? ''
  const dotIndex = path.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === path.length - 1) return undefined
  return ICON_TYPE_BY_EXTENSION[path.slice(dotIndex + 1).toLowerCase()]
}

/** 把品牌写入文档标题与所有图标 link */
export function applyBrandChrome(brand: MobileBrand): void {
  document.title = brand.title
  const iconType = iconTypeOf(brand.logo)
  for (const link of Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(ICON_LINK_SELECTOR),
  )) {
    link.href = brand.logo
    if (iconType) link.type = iconType
  }
}

function applyResolvedBrandChrome(): void {
  const brand = resolveBrand(getRuntimeConfigSnapshot())
  applyBrandChrome(brand)
  saveBrandChromeCache(brand.title, brand.logo)
}

/**
 * 首帧品牌缓存键。`index.html` 的内联脚本在 bundle 加载前读取它，
 * 让回访用户第一次绘制就已经是运行时配置的值——否则管理端改过
 * brandTitle / brandLogo 后，每次打开都会先闪一下打包兜底值。
 * 改这个值要同时改 `index.html`（`brandConfig.spec.ts` 有一条断言钉住）。
 */
export const BRAND_CHROME_CACHE_KEY = 'mx-brand-chrome'

interface BrandChromeCache {
  appName: string
  logo: string
}

/** 只放行同源相对路径：挡住 `javascript:`、`data:`、协议相对等可执行或外泄地址 */
function isSafeChromeUrl(value: string): boolean {
  const url = value.trim()
  return (
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.includes(':') &&
    !/\s/.test(url)
  )
}

/**
 * 把当前生效的品牌标题与 Logo 写进 localStorage，供下次打开页面时
 * `index.html` 内联脚本在 JS 加载前直接应用。
 * 写失败（隐私模式、存储配额满）静默忽略：缓存只是省一次首帧闪烁，
 * 失败时首帧仍显示 index.html 静态兜底值，JS 随后照常覆写。
 */
export function saveBrandChromeCache(appName: string, logo: string): void {
  try {
    const cache: BrandChromeCache = {
      appName: appName.trim().slice(0, 200),
      // 非同源相对路径不落盘，首帧保留 index.html 的静态 Logo
      logo: isSafeChromeUrl(logo) ? logo.trim().slice(0, 300) : '',
    }
    localStorage.setItem(BRAND_CHROME_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 见函数注释
  }
}

let brandChromeWatched = false

/**
 * 启动期把品牌写入文档（main.ts 调用）：先确保公开配置已取回，
 * 再按解析结果覆盖页签标题与 favicon。取配置失败时保持 index.html 静态值。
 * 同时挂上配置变更订阅，配置刷新后标题/favicon 跟着更新，
 * 与组件里的响应式品牌保持同步。
 */
export async function ensureBrandApplied(): Promise<void> {
  await ensureRuntimeConfig()
  applyResolvedBrandChrome()
  if (!brandChromeWatched) {
    brandChromeWatched = true
    subscribeRuntimeConfig(applyResolvedBrandChrome)
  }
}
