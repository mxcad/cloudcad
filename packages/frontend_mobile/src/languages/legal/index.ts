/**
 * 法务文档（H-01）：隐私政策 / 用户协议。
 *
 * 正文与 PC 同源（PC `languages/paragraphs/<lang>/legal-*.ts` 的拷贝，各端一份），
 * 每语言一个模块、按语言懒加载。品牌占位符（{{entityName}} 等）由
 * @cloudcad/platform 的 resolvePlaceholders 解析（与 PC 共用同一实现）；
 * 品牌实体为静态数据（对齐 PC appConfig DEFAULT_BRAND_PROFILE.legal），
 * 客服联系方式取运行时配置（GET /runtime-config/public）。
 */
import { resolvePlaceholders } from '@cloudcad/platform'
import type { PublicRuntimeConfig } from '@/composables/useRuntimeConfig'

export type LegalDoc = 'privacy' | 'terms'

/** 产品全称（对齐 PC DEFAULT_LEGAL_PRODUCT_NAMES） */
const LEGAL_PRODUCT_NAMES: Record<string, string> = {
  'zh-CN': '梦想网页CAD实时协同平台',
  'zh-TW': '夢想網頁CAD即時協同平台',
  'en-US': 'Dream Web CAD Real-time Collaboration Platform',
  'ko-KR': '드림 웹 CAD 실시간 협업 플랫폼',
}

/** 运营主体（对齐 PC DEFAULT_BRAND_PROFILE.legal.identities） */
const LEGAL_ENTITY_NAMES: Record<string, string> = {
  'zh-CN': '成都梦想凯德科技有限公司',
  'zh-TW': '成都夢想凱德科技有限公司',
  'en-US': 'Chengdu Dreamkaide Technology Co., Ltd.',
  'ko-KR': '청두 드림카이드 테크놀로지 유한공사',
}

/** 产品简称（对齐 PC legal.productShortName） */
export const LEGAL_PRODUCT_SHORT_NAME = 'CloudCAD'

/** 版权主体（对齐 PC copyrightHolder，页脚展示） */
export const LEGAL_COPYRIGHT_HOLDER = 'Chengdu Dreamkaide Technology Co., Ltd.'

const LOADERS: Record<LegalDoc, Record<string, () => Promise<{ default: string }>>> = {
  privacy: {
    'zh-CN': () => import('./privacy/zh-CN'),
    'zh-TW': () => import('./privacy/zh-TW'),
    'en-US': () => import('./privacy/en-US'),
    'ko-KR': () => import('./privacy/ko-KR'),
  },
  terms: {
    'zh-CN': () => import('./terms/zh-CN'),
    'zh-TW': () => import('./terms/zh-TW'),
    'en-US': () => import('./terms/en-US'),
    'ko-KR': () => import('./terms/ko-KR'),
  },
}

/**
 * 加载指定语言的法务正文并解析品牌占位符。
 * 未知语言回落 zh-CN；客服联系方式缺省为空串（占位符解析为空，与 PC 默认值一致）。
 */
export async function loadLegalText(
  doc: LegalDoc,
  language: string,
  config?: Pick<PublicRuntimeConfig, 'supportEmail' | 'supportPhone'>,
): Promise<string> {
  const docLoaders = LOADERS[doc]
  const raw = await (docLoaders[language] ?? docLoaders['zh-CN'])()
  const vars: Record<string, string> = {
    productName: LEGAL_PRODUCT_NAMES[language] ?? LEGAL_PRODUCT_NAMES['zh-CN']!,
    productShortName: LEGAL_PRODUCT_SHORT_NAME,
    entityName: LEGAL_ENTITY_NAMES[language] ?? LEGAL_ENTITY_NAMES['zh-CN']!,
    supportPhone: config?.supportPhone ?? '',
    supportEmail: config?.supportEmail ?? '',
  }
  return resolvePlaceholders(raw.default, vars)
}
