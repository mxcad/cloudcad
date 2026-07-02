import React, { useState } from 'react';
import { useVoerkaI18n } from '@voerkai18n/react';
import { Languages, Check } from 'lucide-react';
import { i18nScope, t } from '@/languages';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { Menu } from './ui/Menu';

export const LanguageSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { activeLanguage, changeLanguage, languages } = useVoerkaI18n(i18nScope);
  const changeLanguageHandler = async (lang: string) => {
    const { mxcadApp } = await import("mxcad-app")
    changeLanguage(lang)
    mxcadApp.i18nScope.change(lang)
  }
  const languageLabels: Record<string, string> = {
    'zh-CN': t('简体中文'),
    'en-US': 'English',
    'ko-KR': '한국어',
    'zh-TW': t('繁體中文'),
  };

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Tooltip content={t('切换语言')}>
        <Menu.Trigger>
          <Button
            variant="secondary"
            className="relative rounded-xl transition-all duration-300 ease-out
                       hover:scale-110 active:scale-95
                       hover:bg-[var(--bg-tertiary)]
                       group"
            aria-label={t('切换语言')}
          >
            <Languages
              size={20}
              className="text-[var(--text-tertiary)]
                         group-hover:text-[var(--accent-500)]
                         transition-colors duration-300"
            />
          </Button>
        </Menu.Trigger>
      </Tooltip>

      <Menu.Content align="end" sideOffset={8} className="w-40">
        {languages.map((lang) => (
          <Menu.Item
            key={lang.name}
            onClick={async () => {
              try {
                await changeLanguageHandler(lang.name);
              } catch (err) {
                console.error('[i18n] switch failed:', err);
              }
              setOpen(false);
            }}
          >
            <span className="flex items-center justify-between w-full">
              <span>{languageLabels[lang.name] || lang.title}</span>
              {lang.name === activeLanguage && (
                <Check size={14} className="text-[var(--accent-500)]" />
              )}
            </span>
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
};

export default LanguageSwitcher;
