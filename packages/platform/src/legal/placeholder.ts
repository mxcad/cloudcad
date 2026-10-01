/**
 * 法务文本品牌占位符解析——跨端共享的纯替换。
 *
 * 背景：隐私政策/用户协议正文走 i18n paragraph，paragraph 分支不经
 * `scope.translate()`，无法用 i18n 变量注入品牌实体，故文案里用
 * `{{双花括号}}` 占位符（`{{entityName}}` 等）在端包自行替换。
 * 过去 PC `lib/legalText.ts` 独有一份替换实现；移动端合规页（H-01）需要同源，
 * 这里收敛为唯一实现。品牌实体映射（getBrandLegalNames 等）留端包 appConfig。
 *
 * 刻意区别于 i18n 的 `{单花括号}` flexvars，避免被二次插值。
 * 未知占位符原样保留：配置漏项时页面会直接显示 `{{xxx}}`，比静默吞掉更容易被发现。
 */

const LEGAL_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/**
 * 替换文本中的 `{{key}}` 占位符。
 * `vars[key]` 缺失时原样保留占位符（漏项可见，不静默吞掉）。
 */
export function resolvePlaceholders(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(LEGAL_PLACEHOLDER_RE, (match, key) => vars[key] ?? match);
}
