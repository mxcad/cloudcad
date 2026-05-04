/**
 * 主题上下文 - 管理明暗主题状态并与 CAD 编辑器主题同步
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface ThemeContextType {
  /** 当前是否为暗色主题 */
  isDark: boolean;
  /** 切换主题 */
  toggleTheme: () => void;
  /** 设置主题 */
  setTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** localStorage 存储键名 */
const THEME_STORAGE_KEY = 'mx-user-dark';

/**
 * 从 localStorage 读取主题设置并立即应用到 DOM
 * 在 useState 初始化时调用,确保首次渲染前主题已正确应用
 */
function getStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    // 默认为暗色主题（与 mxcad-app 默认一致）
    const isDark = stored ? stored === 'true' : true;
    // 立即应用到 DOM,防止闪烁
    applyThemeToDOM(isDark);
    return isDark;
  } catch {
    applyThemeToDOM(true);
    return true;
  }
}

/**
 * 保存主题设置到 localStorage
 */
function storeTheme(isDark: boolean): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, String(isDark));
  } catch {
    // 忽略存储错误（如隐私模式）
  }
}

/**
 * 同步主题到 DOM
 * - 设置 document.documentElement 的 data-theme 属性（供 CSS 变量使用）
 * - 设置 document.body 的 class 和 data-theme（向后兼容）
 */
function applyThemeToDOM(isDark: boolean): void {
  const theme = isDark ? 'dark' : 'light';
  
  // 设置根元素的 data-theme（CSS 变量系统使用）
  document.documentElement.setAttribute('data-theme', theme);
  
  // 设置 body 的 class（向后兼容）
  if (isDark) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  
  // 同时设置 body 的 data-theme 属性
  document.body.setAttribute('data-theme', theme);
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(getStoredTheme);

  // 监听 localStorage 变化（来自 CAD 编辑器的主题切换）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const newTheme = e.newValue === 'true';
        setIsDark(newTheme);
        applyThemeToDOM(newTheme);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 监听来自 mxcad-app 的主题变化事件
  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<{ isDark: boolean }>) => {
      const newTheme = e.detail.isDark;
      setIsDark(newTheme);
      applyThemeToDOM(newTheme);
      storeTheme(newTheme);
    };

    window.addEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
    };
  }, []);

  const toggleTheme = useCallback(async () => {
    const newTheme = !isDark;
    
    // 尝试通过 mxcad-app 切换主题（双向同步）
    try {
      const win = window as unknown as {
        mxcadApp?: {
          getVuetify?: () => Promise<{
            theme: {
              toggle: (themes: string[]) => void;
              change: (name: string) => void;
            };
          }>;
        };
      };
      
      if (win.mxcadApp?.getVuetify) {
        const vuetify = await win.mxcadApp.getVuetify();
        // 调用 Vuetify 切换主题，Vue watch 会派发事件通知 React
        vuetify.theme.toggle(['light', 'dark']);
        console.log('[ThemeContext] 通过 mxcad-app 切换主题:', newTheme ? 'dark' : 'light');
        return; // Vue watch 会派发事件，React 会收到更新
      }
    } catch (error) {
      console.warn('[ThemeContext] mxcad-app 不可用，直接切换:', error);
    }
    
    // mxcad-app 不可用时，直接切换
    setIsDark(newTheme);
    applyThemeToDOM(newTheme);
    storeTheme(newTheme);
  }, [isDark]);

  const setTheme = useCallback(async (dark: boolean) => {
    // 尝试通过 mxcad-app 设置主题（双向同步）
    try {
      const win = window as unknown as {
        mxcadApp?: {
          getVuetify?: () => Promise<{
            theme: {
              toggle: (themes: string[]) => void;
              change: (name: string) => void;
            };
          }>;
        };
      };
      
      if (win.mxcadApp?.getVuetify) {
        const vuetify = await win.mxcadApp.getVuetify();
        // 调用 Vuetify 设置主题，Vue watch 会派发事件通知 React
        vuetify.theme.change(dark ? 'dark' : 'light');
        console.log('[ThemeContext] 通过 mxcad-app 设置主题:', dark ? 'dark' : 'light');
        return; // Vue watch 会派发事件，React 会收到更新
      }
    } catch (error) {
      console.warn('[ThemeContext] mxcad-app 不可用，直接设置:', error);
    }
    
    // mxcad-app 不可用时，直接设置
    setIsDark(dark);
    applyThemeToDOM(dark);
    storeTheme(dark);
  }, []);

  const value: ThemeContextType = {
    isDark,
    toggleTheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * 使用主题上下文的 Hook
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * 初始化主题同步（在 CAD 编辑器加载后调用）
 * 拦截 mxcad-app 的主题切换方法
 */
export function initThemeSync(): void {
  // 等待 mxcad-app 加载完成
  const checkAndSync = () => {
    // 检查 mxcad-app 是否可用
    const win = window as unknown as {
      mxcadApp?: {
        useTheme?: () => {
          global: {
            name: {
              value: string;
            };
          };
        };
      };
    };

    if (win.mxcadApp?.useTheme) {
      try {
        // 获取当前 mxcad-app 的主题
        const theme = win.mxcadApp.useTheme();
        const isDarkTheme = theme.global.name.value === 'dark';

        // 同步到当前应用
        const storedTheme = getStoredTheme();
        if (isDarkTheme !== storedTheme) {
          storeTheme(isDarkTheme);
          applyThemeToDOM(isDarkTheme);

          // 触发事件通知 React 组件
          window.dispatchEvent(new CustomEvent('mxcad-theme-changed', {
            detail: { isDark: isDarkTheme }
          }));
        }
      } catch (error) {
        console.warn('主题同步失败:', error);
      }
    }
  };

  // 延迟检查，等待 mxcad-app 初始化
  setTimeout(checkAndSync, 1000);
}

export default ThemeContext;
