import { ref } from 'vue';

/**
 * 国际化管理 Composable
 *
 * CloudCAD 作为 voerka-i18n 分库。
 * 运行时初始化后，t() 委托全局 VoerkaI18n 实例翻译；
 * 未就绪时回退到 key 占位，保证 UI 不崩溃。
 *
 * 使用方式：
 *   const { t, setLanguage, currentLanguage } = useI18n()
 */
type LanguageCode = 'zh-CN' | 'en';

interface LanguageOption {
  name: LanguageCode;
  title: string;
}

const SUPPORTED: LanguageOption[] = [
  { name: 'zh-CN', title: '简体中文' },
  { name: 'en', title: 'English' },
];

const STORAGE_KEY = 'cloudcad-language';
const DEFAULT: LanguageCode = 'zh-CN';

/** 延迟获取 voerka-i18n 全局实例（避免模块未就绪时报错） */
function resolveI18n() {
  try {
    // voerka-i18n 初始化后会在 window 上挂载全局翻译管理器
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g.__VoerkaI18n__?.t) return g.__VoerkaI18n__;
    if (g.VoerkaI18n?.t) return g.VoerkaI18n;
  } catch { /* 忽略 */ }
  return null;
}

function storedLang(): LanguageCode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && SUPPORTED.some((l) => l.name === v)) return v as LanguageCode;
  } catch { /* 忽略 */ }
  return DEFAULT;
}

export function useI18n() {
  const currentLanguage = ref<LanguageCode>(storedLang());
  const i18n = resolveI18n();

  /** 翻译：委托 voerka-i18n，不可用时返回 key 本身 */
  function t(key: string, vars?: Record<string, unknown>): string {
    if (i18n) {
      try { return i18n.t(key, vars); } catch { /* 回退 */ }
    }
    return formatFallback(key, vars);
  }

  /** 切换语言 */
  async function setLanguage(lang: LanguageCode): Promise<void> {
    if (lang === currentLanguage.value) return;
    if (i18n) {
      try { await i18n.changeLanguage(lang); } catch { /* 忽略 */ }
    }
    currentLanguage.value = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* 忽略 */ }
  }

  function formatFallback(key: string, vars?: Record<string, unknown>): string {
    if (!vars) return key;
    return key.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  }

  return {
    t,
    currentLanguage,
    setLanguage,
    supportedLanguages: SUPPORTED,
  };
}
