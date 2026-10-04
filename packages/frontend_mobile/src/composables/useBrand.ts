import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useRuntimeConfig } from './useRuntimeConfig'
import {
  resolveBrand,
  resolveLegalVars,
  type BrandLegalVars,
  type MobileBrand,
} from '@/config/brandConfig'

/**
 * 品牌档案的响应式出口（组件内用）。
 *
 * 纯解析逻辑在 `config/brandConfig.ts`（可测），这里只负责挂上 `useRuntimeConfig`
 * 的响应式源——管理端改完品牌配置，下一次公开配置取回后页面自动跟着变。
 */
export function useBrand() {
  const { config } = useRuntimeConfig()
  const brand = computed<MobileBrand>(() => resolveBrand(config.value))
  return { brand }
}

/**
 * 法务正文品牌变量的响应式出口。`language` 传 `i18n.activeLanguage`（Ref 或取值函数）。
 */
export function useBrandLegalVars(language: MaybeRefOrGetter<string>) {
  const { config } = useRuntimeConfig()
  const legalVars = computed<BrandLegalVars>(() =>
    resolveLegalVars(toValue(language), config.value),
  )
  return { legalVars }
}
