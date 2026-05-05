import { useEffect, useRef } from 'react';

/**
 * 初始化主题同步 - 监听 mxcad-app 的 Vuetify 主题变化
 * 当 mxcad-app 切换主题时，通过 CustomEvent 通知 React ThemeContext
 *
 * 从 CADEditorDirect.tsx 提取的独立 hook
 */
export function useThemeSync() {
  const isInitialized = useRef(false);

  const initThemeSync = async () => {
    if (isInitialized.current) {
      return;
    }

    try {
      const { mxcadApp } = await import('mxcad-app');
      const vuetify = await mxcadApp.getVuetify();
      const { watch } = await import('vue') as any;

      const storedTheme = localStorage.getItem('mx-user-dark');
      const userThemeIsDark = storedTheme ? storedTheme === 'true' : true;
      const currentMxcadTheme = vuetify.theme.global.name.value;
      const mxcadIsDark = currentMxcadTheme === 'dark';

      if (userThemeIsDark !== mxcadIsDark) {
        vuetify.theme.change(userThemeIsDark ? 'dark' : 'light');
      }

      watch(
        () => vuetify.theme.global.name.value,
        (themeName: any) => {
          const isDark = themeName === 'dark';

          window.dispatchEvent(
            new CustomEvent('mxcad-theme-changed', {
              detail: { isDark },
            })
          );

          const theme = isDark ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', theme);
          document.body.setAttribute('data-theme', theme);

          if (isDark) {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
          } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
          }

          localStorage.setItem('mx-user-dark', String(isDark));
        }
      );

      isInitialized.current = true;
    } catch (error: unknown) {
      // Theme sync is non-critical; failure is silent
      void error;
    }
  };

  useEffect(() => {
    return () => {
      isInitialized.current = false;
    };
  }, []);

  return { initThemeSync, isInitialized };
}
