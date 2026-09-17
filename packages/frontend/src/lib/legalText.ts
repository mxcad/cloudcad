import {
  getBrandLegalNames,
  getBrandProfile,
  type BrandSupport,
} from '@/constants/appConfig';

const LEGAL_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/**
 * 解析法务正文里的品牌占位符。
 *
 * 走 i18n paragraph 的文案无法用 i18n 变量注入品牌实体（paragraph 分支直接
 * `setResult(paragraphText)`，不经 `scope.translate()`），故在文案里用
 * `{{双花括号}}` 占位符并在这一处自行替换。刻意区别于 i18n 的 `{单花括号}`
 * flexvars，避免被二次插值。
 *
 * 未知占位符原样保留：配置漏项时页面会直接显示 `{{xxx}}`，比静默吞掉更容易被发现。
 */
export function resolveLegalText(
  text: string,
  language?: string,
  support?: BrandSupport
): string {
  const profile = getBrandProfile();
  const legalNames = getBrandLegalNames(language);
  const contact = support || profile.support;

  const vars: Record<string, string> = {
    productName: legalNames.productName,
    productShortName: profile.legal.productShortName,
    entityName: legalNames.entityName,
    supportPhone: contact.phone,
    supportEmail: contact.email,
  };

  return text.replace(LEGAL_PLACEHOLDER_RE, (match, key) => vars[key] ?? match);
}
