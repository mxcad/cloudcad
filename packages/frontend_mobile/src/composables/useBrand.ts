import { computed } from 'vue'
import { useRuntimeConfig } from './useRuntimeConfig'
import { resolveBrand, type MobileBrand } from '@/config/brandConfig'

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
