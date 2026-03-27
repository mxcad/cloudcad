///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { useState, useEffect, useCallback } from 'react';
import {
  SidebarSettings,
  DEFAULT_SIDEBAR_SETTINGS,
  SidebarTab,
  DrawingsSubTab,
} from '../types/sidebar';

// localStorage 版本控制
const STORAGE_VERSION = 'v1';
const SIDEBAR_SETTINGS_STORAGE_KEY = `sidebarSettings:${STORAGE_VERSION}`;

/**
 * 安全的 localStorage 操作工具
 */
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      // 隐私模式或 storage 被禁用时返回 null
      return null;
    }
  },
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      // quota exceeded 或 storage 被禁用时返回 false
      return false;
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略错误
    }
  },
};

/**
 * 最小化设置数据，只存储必要字段
 */
const minimizeSettings = (settings: SidebarSettings): Partial<SidebarSettings> => ({
  defaultTab: settings.defaultTab,
  defaultDrawingsSubTab: settings.defaultDrawingsSubTab,
  width: settings.width,
  isVisible: settings.isVisible,
  lastActiveTab: settings.lastActiveTab,
  lastDrawingsSubTab: settings.lastDrawingsSubTab,
});

/**
 * 侧边栏设置管理 Hook
 * 负责设置的读取、保存和更新
 * - 使用版本控制避免 schema 冲突
 * - 最小化存储数据
 * - 安全处理 localStorage 错误
 */
export function useSidebarSettings() {
  const [settings, setSettings] = useState<SidebarSettings>(() => {
    // 从 localStorage 读取设置
    const stored = safeStorage.getItem(SIDEBAR_SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SIDEBAR_SETTINGS, ...parsed };
      } catch (error) {
        console.error('Failed to parse sidebar settings:', error);
        // 解析失败时清除损坏的数据
        safeStorage.removeItem(SIDEBAR_SETTINGS_STORAGE_KEY);
      }
    }
    return DEFAULT_SIDEBAR_SETTINGS;
  });

  // 保存设置到 localStorage
  useEffect(() => {
    const minimized = minimizeSettings(settings);
    const success = safeStorage.setItem(
      SIDEBAR_SETTINGS_STORAGE_KEY,
      JSON.stringify(minimized)
    );
    if (!success) {
      console.warn('Failed to save sidebar settings to localStorage');
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

  // 设置默认 Tab
  const setDefaultTab = useCallback((tab: SidebarTab) => {
    updateSettings({ defaultTab: tab });
  }, [updateSettings]);

  // 设置默认图纸子 Tab
  const setDefaultDrawingsSubTab = useCallback((tab: DrawingsSubTab) => {
    updateSettings({ defaultDrawingsSubTab: tab });
  }, [updateSettings]);

  // 设置宽度
  const setWidth = useCallback((width: number) => {
    // 限制宽度范围
    const clampedWidth = Math.max(300, Math.min(600, width));
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

  // 设置上次激活的图纸子 Tab
  const setLastDrawingsSubTab = useCallback((tab: DrawingsSubTab | null) => {
    updateSettings({ lastDrawingsSubTab: tab });
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    setDefaultTab,
    setDefaultDrawingsSubTab,
    setWidth,
    setIsVisible,
    setLastActiveTab,
    setLastDrawingsSubTab,
  };
}
