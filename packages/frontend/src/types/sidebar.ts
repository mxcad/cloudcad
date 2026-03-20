///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * 侧边栏相关类型定义
 * CloudCAD 完美主题系统 2.0
 */

/**
 * 侧边栏 Tab 类型
 * 注意：'gallery' 已合并到 'drawings' 的子 Tab 中（drawings-gallery / blocks-gallery）
 */
export type SidebarTab = 'drawings' | 'collaborate';

/** 图纸子 Tab 类型 */
export type DrawingsSubTab = 'my-project' | 'my-drawings' | 'drawings-gallery' | 'blocks-gallery';

/** 侧边栏设置 */
export interface SidebarSettings {
  /** 默认 Tab */
  defaultTab: SidebarTab;
  /** 默认图纸子 Tab */
  defaultDrawingsSubTab: DrawingsSubTab;
  /** 侧边栏宽度 (px) */
  width: number;
  /** 记住上次状态 */
  rememberState: boolean;
  /** 上次激活的 Tab */
  lastActiveTab: SidebarTab | null;
  /** 上次激活的图纸子 Tab */
  lastDrawingsSubTab: DrawingsSubTab | null;
  /** 是否可见 */
  isVisible: boolean;
}

/** 默认设置 */
export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  defaultTab: 'drawings',
  defaultDrawingsSubTab: 'my-project',
  width: 300,
  rememberState: true,
  lastActiveTab: null,
  lastDrawingsSubTab: null,
  isVisible: true,
};

/** localStorage 存储键 */
export const SIDEBAR_SETTINGS_STORAGE_KEY = 'cad-editor-sidebar-settings';
