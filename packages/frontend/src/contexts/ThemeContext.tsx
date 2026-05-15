/**
 * 主题上下文 - 管理明暗主题状态并与 CAD 编辑器主题同步
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  // 监听 localStorage 变化（来自其他标签页的主题切换）
  // 仅更新 React 状态 + DOM，不写入 localStorage（避免跨标签页循环）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue !== null) {
        const newDark = e.newValue === 'true';
        setIsDark(newDark);
        applyThemeToDOM(newDark);
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
  // isDark 变化时通过事件通知 CAD 编辑器同步 Vuetify 主题
  // 不直接 import('mxcad-app')，避免样式污染非 CAD 页面
  useEffect(() => {
    if (window.MxCAD) {
      window.dispatchEvent(new CustomEvent('react-theme-changed', { detail: { isDark } }));
    }
  }, [isDark]);

  const toggleTheme = useCallback(async () => {
    const newTheme = !isDark;

    // 先更新自身状态（React + DOM + localStorage）
    setIsDark(newTheme);
    applyThemeToDOM(newTheme);
    storeTheme(newTheme);

    // mxcad-app Vuetify 同步由上方 isDark 变化的 useEffect 处理
  }, [isDark]);

  const setTheme = useCallback(async (dark: boolean) => {
    // 先更新自身状态（React + DOM + localStorage）
    setIsDark(dark);
    applyThemeToDOM(dark);
    storeTheme(dark);

    // mxcad-app Vuetify 同步由上方 isDark 变化的 useEffect 处理
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
    if (window.mxcadApp?.useTheme) {
      try {
        // 获取当前 mxcad-app 的主题
        const theme = window.mxcadApp.useTheme();
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
