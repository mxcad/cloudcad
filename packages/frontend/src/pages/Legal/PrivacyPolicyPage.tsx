import React from 'react';
import { t } from '@/languages';
import { useLegalParagraph } from '@/hooks/useLegalParagraph';
import { LegalPage } from './LegalPage';

/**
 * 隐私政策。
 *
 * 正文走 i18n paragraph + `useLegalParagraph`（不是 `<Translate>`）：paragraphs
 * 不经过 `scope.translate()`，无法用 i18n 变量注入品牌实体，故在 `legalText.ts`
 * 里对 `{{supportEmail}}` 等占位符自行解析。文案源在
 * `src/languages/translates/paragraphs/legal-privacy.html`。
 */
export const PrivacyPolicyPage: React.FC = () => {
  const content = useLegalParagraph('legal-privacy');

  return (
    <LegalPage title={t('隐私政策')} updatedAt={t('2026-08-06')}>
      {content}
    </LegalPage>
  );
};

export default PrivacyPolicyPage;
