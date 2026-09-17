import { useEffect, useState } from 'react';
import { useVoerkaI18n } from '@voerkai18n/react';
import { loadAsyncModule } from '@voerkai18n/runtime';

import { i18nScope } from '@/languages';
import { resolveLegalText } from '@/lib/legalText';
import { useSupportContact } from '@/hooks/useSupportContact';

/**
 * 加载 i18n paragraph 并按当前语言解析品牌占位符。
 *
 * paragraph 分支不经过 `scope.translate()`，无法用 i18n 变量注入品牌实体，
 * 所以这里取到原始模板字符串后交给 `resolveLegalText` 处理 `{{entityName}}`
 * 一类占位符。`loadAsyncModule` 对 ESM 模块直接返回 `.default`。
 *
 * 语言切换或运行时客服配置变化时重新加载；组件卸载后丢弃迟到的结果。
 */
export function useLegalParagraph(paragraphId: string): string {
  const { activeLanguage } = useVoerkaI18n(i18nScope);
  const support = useSupportContact();
  const [text, setText] = useState('');

  useEffect(() => {
    const loader = i18nScope.activeParagraphs[paragraphId];
    if (!loader) {
      setText('');
      return;
    }

    let cancelled = false;
    loadAsyncModule(loader)
      .then((raw) => {
        if (cancelled) return;
        const template =
          typeof raw === 'string'
            ? raw
            : raw && raw.default !== undefined
              ? raw.default
              : String(raw);
        setText(resolveLegalText(template, activeLanguage, support));
      })
      .catch((error) => {
        console.error(`Failed to load i18n paragraph ${paragraphId}`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [paragraphId, activeLanguage, support]);

  return text;
}
