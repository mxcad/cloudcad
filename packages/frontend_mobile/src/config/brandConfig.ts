import {
  ensureRuntimeConfig,
  getRuntimeConfigSnapshot,
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
 */
export function resolveBrand(runtime?: Partial<PublicRuntimeConfig> | null): MobileBrand {
  const brand = runtime?.brandProfile ?? null
  const legal = brand?.legal ?? null

  const title = asText(brand?.title) || DEFAULT_BRAND.title
  const logo = asText(brand?.logo) || DEFAULT_BRAND.logo
  const shortName = asText(legal?.productShortName) || DEFAULT_BRAND.shortName
  const copyrightYear = asText(brand?.copyrightYear) || DEFAULT_BRAND.copyrightYear
  const copyrightHolder = asText(brand?.copyrightHolder) || DEFAULT_BRAND.copyrightHolder
  const copyrightLine = asText(brand?.copyrightLine) || DEFAULT_BRAND.copyrightLine

  return {
    title,
    logo: brandAssetPath(logo),
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
    productName: asText(legal?.productName) || names[language] || fallback,
    productShortName: asText(legal?.productShortName) || DEFAULT_BRAND.shortName,
    entityName:
      legal?.identities?.[language]?.entityName ||
      identities[language]?.entityName ||
      defaultIdentity,
  }
}

/**
 * 启动期把品牌写入文档（main.ts 调用）：先确保公开配置已取回，
 * 再按解析结果覆盖页签标题与 favicon。取配置失败时保持 index.html 静态值。
 */
export async function ensureBrandApplied(): Promise<void> {
  await ensureRuntimeConfig()
  const brand = resolveBrand(getRuntimeConfigSnapshot())
  document.title = brand.title
  for (const link of Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  )) {
    link.href = brand.logo
  }
}
