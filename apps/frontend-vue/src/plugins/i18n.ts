import { i18nPlugin } from '@voerkai18n/vue';

/**
 * voerka-i18n 初始化
 *
 * 分库结构：
 * - 默认语言包：zh-CN
 * - 支持语言：zh-CN、en
 *
 * 使用方式：
 * - 组件内：const { t, language } = useVoerkaI18n()
 * - 模板内：{{ t('key') }}
 * - composable 内：import { t } from '@voerkai18n/runtime'
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const i18n = i18nPlugin as any;

export default i18n;
