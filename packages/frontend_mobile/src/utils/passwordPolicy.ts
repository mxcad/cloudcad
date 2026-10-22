import { computed } from 'vue'
import { t } from '@/languages'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import type { PasswordRequirement } from '@cloudcad/platform'

/**
 * 口令策略参数与文案的唯一出口（移动端，与 PC `lib/passwordPolicy.ts` 同构）。
 *
 * 口令策略（最小长度 / 字符类别构成）是**按部署可配置的运行时事实**：
 * 后端 runtimeConfig 键 passwordPolicyMinLength / passwordPolicyMinCategories
 * （运维可改、env 可覆盖、安全模式 profile 有不同目标值），经
 * /runtime-config/public 下发。所有口令要求提示（placeholder / 建议清单）
 * 与提交前预检必须经 usePasswordPolicy() 取生效值、经本文件的文案函数渲染——
 * 禁止把策略数字写死成静态文案（门禁：pnpm scan:password-policy；
 * 后端改默认值时前端自动跟随，无需改前端）。
 *
 * 旧后端未公开该两键时，useRuntimeConfig 回落 secure 基线默认（10/3），
 * 与 @cloudcad/platform 的 PASSWORD_POLICY 兜底一致。
 */
export interface PasswordPolicyParams {
  /** 最小长度（生效值；旧后端回落 10） */
  minLength: number
  /** 至少需要的字符类别数（0 = 不要求；生效值；旧后端回落 3） */
  minCategories: number
}

/** 读取生效口令策略参数（来自 /runtime-config/public；响应式，配置晚到后自动刷新） */
export function usePasswordPolicy() {
  const { config } = useRuntimeConfig()
  return computed<PasswordPolicyParams>(() => ({
    minLength: config.value.passwordPolicyMinLength,
    minCategories: config.value.passwordPolicyMinCategories,
  }))
}

/**
 * 口令要求提示（placeholder 用），由生效策略值推导。
 * minCategories：0 = 不要求类别构成；≥4 = 四类全要。
 */
export function passwordPolicyHint({ minLength, minCategories }: PasswordPolicyParams): string {
  if (minLength > 0 && minCategories >= 4) {
    return t('至少 {min} 位，需包含大小写字母、数字、特殊字符', { min: String(minLength) })
  }
  if (minLength > 0) {
    return minCategories > 0
      ? t('至少 {min} 位，需包含大小写字母、数字、特殊字符中至少 {cats} 类', {
          min: String(minLength),
          cats: String(minCategories),
        })
      : t('至少 {min} 位', { min: String(minLength) })
  }
  if (minCategories >= 4) {
    return t('需包含大小写字母、数字、特殊字符')
  }
  if (minCategories > 0) {
    return t('需包含大小写字母、数字、特殊字符中至少 {cats} 类', { cats: String(minCategories) })
  }
  return t('无密码复杂度要求')
}

/** 建议清单标签：最小长度要求（实时校验清单用）。 */
export function passwordLengthLabel(minLength: number): string {
  return t('至少 {min} 位', { min: String(minLength) })
}

/** 建议清单标签：类别构成要求（对齐后端 password_policy.complexity 语义）。 */
export function passwordComplexityMessage(minCategories: number): string {
  return t('密码需包含大小写字母、数字、特殊字符中至少 {cats} 类', {
    cats: String(minCategories),
  })
}

/** 清单文案（platform 只给 key，i18n 文案按端渲染，唯一出口） */
export function passwordRequirementLabel(
  requirement: PasswordRequirement,
  { minLength, minCategories }: PasswordPolicyParams,
): string {
  return requirement.key === 'length'
    ? passwordLengthLabel(minLength)
    : passwordComplexityMessage(minCategories)
}
