/**
 * 侧边栏相关类型定义
 */

/** 侧边栏 Tab 类型 */
export type SidebarTab = 'project' | 'gallery' | 'collaborate';

/** 侧边栏显示模式 */
export type SidebarDisplayMode = 'manual' | 'auto-hide' | 'collapse';

/** 图纸打开方式 */
export type DrawingOpenMode = 'direct' | 'confirm' | 'new-tab';

/** 侧边栏设置 */
export interface SidebarSettings {
  /** 显示模式 */
  displayMode: SidebarDisplayMode;
  /** 图纸打开方式 */
  openMode: DrawingOpenMode;
  /** 默认 Tab */
  defaultTab: SidebarTab;
  /** 侧边栏宽度 (px) */
  width: number;
  /** 记住上次状态 */
  rememberState: boolean;
  /** 上次激活的 Tab */
  lastActiveTab: SidebarTab | null;
  /** 是否可见 */
  isVisible: boolean;
}

/** 默认设置 */
export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  displayMode: 'manual',
  openMode: 'confirm',
  defaultTab: 'project',
  width: 300,
  rememberState: true,
  lastActiveTab: null,
  isVisible: true,
};

/** localStorage 存储键 */
export const SIDEBAR_SETTINGS_STORAGE_KEY = 'cad-editor-sidebar-settings';
