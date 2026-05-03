import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * 主题 Store
 *
 * 从 ThemeContext.tsx 迁移，补充 useTheme composable 无法覆盖的状态管理需求。
 * 职责：
 *   - 持久化主题偏好
 *   - 主题状态全局共享
 *   - 供路由守卫等组件外代码访问
 */
export const useThemeStore = defineStore('theme', () => {
  const THEME_KEY = 'mx-user-dark';

  const isDark = ref(getStoredTheme());
  const currentTheme = computed(() => (isDark.value ? 'dark' : 'light'));

  function getStoredTheme(): boolean {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return stored ? stored === 'true' : true;
    } catch {
      return true;
    }
  }

  function setTheme(dark: boolean): void {
    isDark.value = dark;
    try {
      localStorage.setItem(THEME_KEY, String(dark));
    } catch {
      // 隐私模式
    }
  }

  function toggleTheme(): void {
    setTheme(!isDark.value);
  }

  return {
    isDark,
    currentTheme,
    setTheme,
    toggleTheme,
  };
});
