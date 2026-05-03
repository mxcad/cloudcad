import { ref, computed, onMounted } from 'vue';
import { useTheme as useVuetifyTheme } from 'vuetify';

/**
 * 主题管理 Composable
 *
 * 直接使用 Vuetify 的 useTheme()，无 React Context 同步。
 * - 从 public/ini/myVuetifyThemeConfig.json 加载自定义色板
 * - toggleTheme() 通过 theme.global.name.value 切换
 * - 自动同步到 localStorage mx-user-dark 键
 */
const STORAGE_KEY = 'mx-user-dark';

interface ThemeFile {
  defaultTheme: string;
  themes: {
    light: { colors: Record<string, string>; variables?: Record<string, unknown> };
    dark: { colors: Record<string, string>; variables?: Record<string, unknown> };
  };
}

export function useTheme() {
  const vuetifyTheme = useVuetifyTheme();
  const isDark = ref(getStored());
  const currentTheme = computed(() => (isDark.value ? 'dark' : 'light'));
  const configLoaded = ref(false);

  /** 从 JSON 加载自定义色板并注入 Vuetify */
  async function loadConfig(): Promise<void> {
    try {
      const res = await fetch('/ini/myVuetifyThemeConfig.json');
      if (!res.ok) return;
      const cfg: ThemeFile = await res.json();
      applyColors(cfg);
      configLoaded.value = true;
    } catch { /* 网络或解析错误，使用 Vuetify 默认主题 */ }
  }

  function applyColors(cfg: ThemeFile): void {
    for (const name of ['light', 'dark'] as const) {
      const target = vuetifyTheme.themes.value[name];
      const source = cfg.themes[name];
      if (target && source) {
        Object.assign(target.colors, source.colors);
        if (source.variables) Object.assign(target, { variables: source.variables });
      }
    }
  }

  /** 切换主题 */
  function toggleTheme(): void {
    const next = !isDark.value;
    vuetifyTheme.global.name.value = next ? 'dark' : 'light';
    isDark.value = next;
    persist(next);
  }

  // ===== 持久化 =====

  function getStored(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return true; }
  }

  function persist(dark: boolean): void {
    try { localStorage.setItem(STORAGE_KEY, String(dark)); } catch { /* 忽略 */ }
  }

  // ===== 跨标签页同步 =====

  function setupStorageSync(): void {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        const dark = e.newValue === 'true';
        vuetifyTheme.global.name.value = dark ? 'dark' : 'light';
        isDark.value = dark;
      }
    });
  }

  // ===== 初始化 =====

  onMounted(setupStorageSync);
  loadConfig();

  return {
    isDark,
    currentTheme,
    configLoaded,
    toggleTheme,
    loadConfig,
  };
}
