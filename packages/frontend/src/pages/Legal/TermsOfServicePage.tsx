import React from 'react';
import { t } from '@/languages';
import { useLegalParagraph } from '@/hooks/useLegalParagraph';
import { LegalPage } from './LegalPage';

/**
 * 用户协议。
 *
 * 正文走 i18n paragraph + `useLegalParagraph`（不是 `<Translate>`）：paragraphs
 * 不经过 `scope.translate()`，无法用 i18n 变量注入品牌实体，故在 `legalText.ts`
 * 里对 `{{productName}}` 等占位符自行解析。文案源在
 * `src/languages/translates/paragraphs/legal-terms.html`。
 */
export const TermsOfServicePage: React.FC = () => {
  const content = useLegalParagraph('legal-terms');

  return (
    <LegalPage title={t('用户协议')} updatedAt={t('2026-08-06')}>
      {content}
    </LegalPage>
  );
};

export default TermsOfServicePage;
