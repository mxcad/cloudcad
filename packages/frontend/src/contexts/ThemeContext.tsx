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
 * 从 localStorage 读取主题设置
 */
function getStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    // 默认为暗色主题（与 mxcad-app 默认一致）
    return stored ? stored === 'true' : true;
  } catch {
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
  const initializedRef = useRef(false);

  // 初始化时应用主题
  useEffect(() => {
    if (!initializedRef.current) {
      applyThemeToDOM(isDark);
      initializedRef.current = true;
    }
  }, [isDark]);

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

  const toggleTheme = useCallback(() => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    applyThemeToDOM(newTheme);
    storeTheme(newTheme);

    // 触发事件通知 CAD 编辑器主题变化
    window.dispatchEvent(new CustomEvent('cloudcad-theme-changed', {
      detail: { isDark: newTheme }
    }));
  }, [isDark]);

  const setTheme = useCallback((dark: boolean) => {
    setIsDark(dark);
    applyThemeToDOM(dark);
    storeTheme(dark);

    // 触发事件通知 CAD 编辑器主题变化
    window.dispatchEvent(new CustomEvent('cloudcad-theme-changed', {
      detail: { isDark: dark }
    }));
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
