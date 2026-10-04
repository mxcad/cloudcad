/**
 * 法务文档（H-01）：隐私政策 / 用户协议。
 *
 * 正文与 PC 同源（PC `languages/paragraphs/<lang>/legal-*.ts` 的拷贝，各端一份），
 * 每语言一个模块、按语言懒加载。品牌占位符（{{entityName}} 等）由
 * @cloudcad/platform 的 resolvePlaceholders 解析（与 PC 共用同一实现）。
 *
 * 品牌名的默认值与解析逻辑不在这里——统一收口到 `config/brandConfig.ts`
 * （`resolveLegalVars` / `DEFAULT_BRAND`），与品牌标题、logo、版权行共用同一事实源。
 * 客服联系方式取运行时配置（GET /runtime-config/public）。
 */
import { resolvePlaceholders } from '@cloudcad/platform'
import type { PublicRuntimeConfig } from '@/composables/useRuntimeConfig'
import { DEFAULT_BRAND, resolveLegalVars } from '@/config/brandConfig'

export type LegalDoc = 'privacy' | 'terms'

/** 产品简称（对齐 PC legal.productShortName，品牌档案默认值） */
export const LEGAL_PRODUCT_SHORT_NAME = DEFAULT_BRAND.shortName

/** 版权主体（对齐 PC copyrightHolder，页脚展示） */
export const LEGAL_COPYRIGHT_HOLDER = DEFAULT_BRAND.copyrightHolder

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
 *
 * 品牌占位符的优先级与 PC 一致：运行时 `brandProfile.legal` 高于内置按语言默认值。
 * `productName` / `productShortName` 是单值（管理端只填一份，各语言共用）；
 * `identities` 是按语言映射，只取当前语言的条目，不跨语言借用——
 * 否则管理端只填了中文名会让英文条款出现中文主体。
 */
export async function loadLegalText(
  doc: LegalDoc,
  language: string,
  config?: Partial<
    Pick<PublicRuntimeConfig, 'supportEmail' | 'supportPhone' | 'brandProfile'>
  >,
): Promise<string> {
  const docLoaders = LOADERS[doc]
  const raw = await (docLoaders[language] ?? docLoaders['zh-CN'])()
  const vars: Record<string, string> = {
    ...resolveLegalVars(language, config),
    supportPhone: config?.supportPhone ?? '',
    supportEmail: config?.supportEmail ?? '',
  }
  return resolvePlaceholders(raw.default, vars)
}
