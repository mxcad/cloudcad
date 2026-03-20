/**
 * 侧边栏相关类型定义
 */

/** 侧边栏 Tab 类型 */
export type SidebarTab = 'drawings' | 'gallery' | 'collaborate';

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
