import { useState, useEffect, useCallback } from 'react';
import {
  SidebarSettings,
  DEFAULT_SIDEBAR_SETTINGS,
  SIDEBAR_SETTINGS_STORAGE_KEY,
  SidebarTab,
  SidebarDisplayMode,
  DrawingOpenMode,
} from '../types/sidebar';

/**
 * 侧边栏设置管理 Hook
 * 负责设置的读取、保存和更新
 */
export function useSidebarSettings() {
  const [settings, setSettings] = useState<SidebarSettings>(() => {
    // 从 localStorage 读取设置
    try {
      const stored = localStorage.getItem(SIDEBAR_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SIDEBAR_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('Failed to parse sidebar settings:', error);
    }
    return DEFAULT_SIDEBAR_SETTINGS;
  });

  // 保存设置到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.error('Failed to save sidebar settings:', error);
    }
  }, [settings]);

  // 更新设置
  const updateSettings = useCallback((updates: Partial<SidebarSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // 重置为默认设置
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SIDEBAR_SETTINGS);
  }, []);

  // 设置显示模式
  const setDisplayMode = useCallback((mode: SidebarDisplayMode) => {
    updateSettings({ displayMode: mode });
  }, [updateSettings]);

  // 设置打开方式
  const setOpenMode = useCallback((mode: DrawingOpenMode) => {
    updateSettings({ openMode: mode });
  }, [updateSettings]);

  // 设置默认 Tab
  const setDefaultTab = useCallback((tab: SidebarTab) => {
    updateSettings({ defaultTab: tab });
  }, [updateSettings]);

  // 设置宽度
  const setWidth = useCallback((width: number) => {
    // 限制宽度范围
    const clampedWidth = Math.max(200, Math.min(600, width));
    updateSettings({ width: clampedWidth });
  }, [updateSettings]);

  // 设置可见性
  const setIsVisible = useCallback((isVisible: boolean) => {
    updateSettings({ isVisible });
  }, [updateSettings]);

  // 设置上次激活的 Tab
  const setLastActiveTab = useCallback((tab: SidebarTab | null) => {
    updateSettings({ lastActiveTab: tab });
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    setDisplayMode,
    setOpenMode,
    setDefaultTab,
    setWidth,
    setIsVisible,
    setLastActiveTab,
  };
}
