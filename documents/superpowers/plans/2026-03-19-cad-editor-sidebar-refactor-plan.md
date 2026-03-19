# CAD 编辑器侧边栏重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 CAD 编辑器侧边栏，实现统一的侧边栏容器组件，支持 Tab 切换、三种显示模式和项目图纸快速访问功能。

**Architecture:** 新建 `SidebarContainer` 统一管理侧边栏状态和宽度，现有 `CADEditorSidebar` 和 `CollaborateSidebar` 调整为 Tab 内容组件。新增 `ProjectDrawingsPanel` 实现项目图纸列表。设置通过 localStorage 持久化。

**Tech Stack:** React, TypeScript, CSS Modules, localStorage

---

## 文件结构

| 文件 | 责任 | 操作 |
|------|------|------|
| `packages/frontend/src/types/sidebar.ts` | 侧边栏类型定义 | 创建 |
| `packages/frontend/src/hooks/useSidebarSettings.ts` | 设置管理 Hook | 创建 |
| `packages/frontend/src/hooks/useDrawingModifyState.ts` | 图纸修改状态检测 | 创建 |
| `packages/frontend/src/components/sidebar/SidebarContainer.tsx` | 统一侧边栏容器 | 创建 |
| `packages/frontend/src/components/sidebar/SidebarTabBar.tsx` | Tab 切换栏 | 创建 |
| `packages/frontend/src/components/sidebar/SidebarTrigger.tsx` | 收起状态触发条 | 创建 |
| `packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx` | 设置弹窗 | 创建 |
| `packages/frontend/src/components/sidebar/sidebar.module.css` | 侧边栏样式 | 创建 |
| `packages/frontend/src/components/ProjectDrawingsPanel.tsx` | 项目图纸面板 | 创建 |
| `packages/frontend/src/contexts/SidebarContext.tsx` | 扩展设置管理 | 修改 |
| `packages/frontend/src/components/CADEditorSidebar.tsx` | 移除宽度管理 | 修改 |
| `packages/frontend/src/components/CollaborateSidebar.tsx` | 移除宽度管理 | 修改 |
| `packages/frontend/src/pages/CADEditorDirect.tsx` | 集成新容器 | 修改 |

---

## Task 1: 创建类型定义

**Files:**
- Create: `packages/frontend/src/types/sidebar.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/types/sidebar.ts
git commit -m "feat(sidebar): 添加侧边栏类型定义"
```

---

## Task 2: 创建设置管理 Hook

**Files:**
- Create: `packages/frontend/src/hooks/useSidebarSettings.ts`

- [ ] **Step 1: 创建设置管理 Hook**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/hooks/useSidebarSettings.ts
git commit -m "feat(sidebar): 添加设置管理 Hook"
```

---

## Task 3: 创建图纸修改状态检测 Hook

**Files:**
- Create: `packages/frontend/src/hooks/useDrawingModifyState.ts`

- [ ] **Step 1: 创建图纸修改状态检测 Hook**

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { mxcadManager } from '../services/mxcadManager';

/**
 * 图纸修改状态检测 Hook
 * 使用 MxCAD API 检测图纸是否有未保存的修改
 */
export function useDrawingModifyState() {
  const isModified = useRef(false);

  useEffect(() => {
    const mxcad = mxcadManager.getCurrentMxCAD();
    if (!mxcad) return;

    const handler = () => {
      isModified.current = true;
    };

    // 监听数据库修改事件
    mxcad.on('databaseModify', handler);

    // 组件卸载时清理事件监听，防止内存泄漏
    return () => {
      mxcad.off('databaseModify', handler);
    };
  }, []);

  // 重置修改状态（在保存或打开新图纸后调用）
  const resetModified = useCallback(() => {
    isModified.current = false;
  }, []);

  return {
    isModified,
    resetModified,
  };
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/hooks/useDrawingModifyState.ts
git commit -m "feat(sidebar): 添加图纸修改状态检测 Hook"
```

---

## Task 4: 创建侧边栏样式文件

**Files:**
- Create: `packages/frontend/src/components/sidebar/sidebar.module.css`

- [ ] **Step 1: 创建样式文件**

```css
/* 侧边栏容器 */
.sidebarContainer {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  background: #ffffff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  transition: transform 200ms ease-out, width 200ms ease-out;
}

.sidebarContainer.collapsed {
  transform: translateX(-100%);
}

/* Tab 栏 */
.tabBar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 8px;
  height: 44px;
  flex-shrink: 0;
  background: #f9fafb;
}

.tabList {
  display: flex;
  gap: 4px;
  flex: 1;
}

.tab {
  padding: 8px 12px;
  font-size: 13px;
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 150ms ease;
}

.tab:hover {
  background: #e5e7eb;
  color: #374151;
}

.tab.active {
  background: #3b82f6;
  color: #ffffff;
}

.tabBarButton {
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease;
}

.tabBarButton:hover {
  background: #e5e7eb;
  color: #374151;
}

/* 内容区域 */
.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 触发条（收起状态） */
.trigger {
  position: fixed;
  top: 0;
  left: 0;
  width: 40px;
  height: 100vh;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  z-index: 999;
  cursor: pointer;
  transition: background 150ms ease;
}

.trigger:hover {
  background: #f3f4f6;
}

.triggerIcon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #6b7280;
  transition: all 150ms ease;
}

.triggerIcon:hover {
  background: #e5e7eb;
  color: #3b82f6;
}

.triggerIcon.active {
  background: #3b82f6;
  color: #ffffff;
}

.triggerDivider {
  width: 24px;
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}

/* 调整宽度手柄 */
.resizeHandle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
  background: transparent;
  transition: background 150ms ease;
}

.resizeHandle:hover,
.resizeHandle.active {
  background: #3b82f6;
}

/* 设置弹窗 */
.settingsOverlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.settingsModal {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.settingsHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.settingsTitle {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.settingsClose {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
}

.settingsClose:hover {
  background: #f3f4f6;
}

.settingsGroup {
  margin-bottom: 20px;
}

.settingsLabel {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
  display: block;
}

.settingsOptions {
  display: flex;
  gap: 8px;
}

.settingsOption {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  color: #6b7280;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 150ms ease;
}

.settingsOption:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.settingsOption.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #3b82f6;
}

.settingsSlider {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settingsSlider input[type="range"] {
  flex: 1;
  height: 6px;
  appearance: none;
  background: #e5e7eb;
  border-radius: 3px;
  cursor: pointer;
}

.settingsSlider input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.settingsSliderValue {
  font-size: 13px;
  color: #6b7280;
  min-width: 60px;
  text-align: right;
}

.settingsCheckbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.settingsCheckbox input {
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
}

.settingsFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.settingsButton {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease;
}

.settingsButton.secondary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  color: #374151;
}

.settingsButton.secondary:hover {
  background: #f3f4f6;
}

.settingsButton.primary {
  background: #3b82f6;
  border: 1px solid #3b82f6;
  color: #ffffff;
}

.settingsButton.primary:hover {
  background: #2563eb;
}

/* 项目图纸面板 */
.projectDrawingsPanel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.searchBox {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.searchInput {
  width: 100%;
  padding: 8px 12px;
  padding-left: 36px;
  font-size: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  outline: none;
  transition: border-color 150ms ease;
}

.searchInput:focus {
  border-color: #3b82f6;
}

.searchWrapper {
  position: relative;
}

.searchIcon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
}

.drawingList {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.drawingItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms ease;
}

.drawingItem:hover {
  background: #f3f4f6;
}

.drawingThumbnail {
  width: 48px;
  height: 48px;
  background: #f9fafb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.drawingThumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.drawingInfo {
  flex: 1;
  min-width: 0;
}

.drawingName {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawingMeta {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.drawingStatus {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #f59e0b;
  margin-top: 2px;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}

/* 空状态 */
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: #6b7280;
}

.emptyIcon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  color: #d1d5db;
}

.emptyText {
  font-size: 14px;
  text-align: center;
}

/* 确认对话框 */
.confirmDialog {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.confirmIcon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: #f59e0b;
}

.confirmMessage {
  font-size: 15px;
  color: #374151;
  text-align: center;
  margin-bottom: 24px;
}

.confirmActions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/components/sidebar/sidebar.module.css
git commit -m "feat(sidebar): 添加侧边栏样式文件"
```

---

## Task 5: 创建 SidebarTabBar 组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarTabBar.tsx`

- [ ] **Step 1: 创建 Tab 切换栏组件**

```typescript
import React from 'react';
import { Settings, X } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
  onCloseClick: () => void;
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'project', label: '项目图纸' },
  { id: 'gallery', label: '图库' },
  { id: 'collaborate', label: '协同' },
];

export const SidebarTabBar: React.FC<SidebarTabBarProps> = ({
  activeTab,
  onTabChange,
  onSettingsClick,
  onCloseClick,
}) => {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        className={styles.tabBarButton}
        onClick={onSettingsClick}
        title="设置"
      >
        <Settings size={18} />
      </button>
      <button
        className={styles.tabBarButton}
        onClick={onCloseClick}
        title="关闭"
      >
        <X size={18} />
      </button>
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/components/sidebar/SidebarTabBar.tsx
git commit -m "feat(sidebar): 添加 Tab 切换栏组件"
```

---

## Task 6: 创建 SidebarTrigger 组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarTrigger.tsx`

- [ ] **Step 1: 创建收起状态触发条组件**

```typescript
import React from 'react';
import { FolderOpen, Image, Users, Settings } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
}

const TAB_ICONS: { id: SidebarTab; icon: React.ReactNode }[] = [
  { id: 'project', icon: <FolderOpen size={18} /> },
  { id: 'gallery', icon: <Image size={18} /> },
  { id: 'collaborate', icon: <Users size={18} /> },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  onTabClick,
  onSettingsClick,
}) => {
  return (
    <div className={styles.trigger}>
      {TAB_ICONS.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.triggerIcon} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabClick(tab.id)}
          title={tab.id === 'project' ? '项目图纸' : tab.id === 'gallery' ? '图库' : '协同'}
        >
          {tab.icon}
        </button>
      ))}
      <div className={styles.triggerDivider} />
      <button
        className={styles.triggerIcon}
        onClick={onSettingsClick}
        title="设置"
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/components/sidebar/SidebarTrigger.tsx
git commit -m "feat(sidebar): 添加触发条组件"
```

---

## Task 7: 创建 SidebarSettingsModal 组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx`

- [ ] **Step 1: 创建设置弹窗组件**

```typescript
import React from 'react';
import { X } from 'lucide-react';
import {
  SidebarSettings,
  SidebarDisplayMode,
  DrawingOpenMode,
  SidebarTab,
  DEFAULT_SIDEBAR_SETTINGS,
} from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarSettingsModalProps {
  settings: SidebarSettings;
  onUpdateSettings: (updates: Partial<SidebarSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const DISPLAY_MODES: { id: SidebarDisplayMode; label: string }[] = [
  { id: 'manual', label: '手动控制' },
  { id: 'auto-hide', label: '自动隐藏' },
  { id: 'collapse', label: '可收起' },
];

const OPEN_MODES: { id: DrawingOpenMode; label: string }[] = [
  { id: 'direct', label: '直接切换' },
  { id: 'confirm', label: '确认后切换' },
  { id: 'new-tab', label: '新标签打开' },
];

const DEFAULT_TABS: { id: SidebarTab; label: string }[] = [
  { id: 'project', label: '项目图纸' },
  { id: 'gallery', label: '图库' },
  { id: 'collaborate', label: '协同' },
];

export const SidebarSettingsModal: React.FC<SidebarSettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onReset,
  onClose,
}) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.settingsOverlay} onClick={handleOverlayClick}>
      <div className={styles.settingsModal}>
        <div className={styles.settingsHeader}>
          <h2 className={styles.settingsTitle}>侧边栏设置</h2>
          <button className={styles.settingsClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 显示模式 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>显示模式</label>
          <div className={styles.settingsOptions}>
            {DISPLAY_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.settingsOption} ${settings.displayMode === mode.id ? styles.active : ''}`}
                onClick={() => onUpdateSettings({ displayMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 图纸打开方式 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>图纸打开方式</label>
          <div className={styles.settingsOptions}>
            {OPEN_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.settingsOption} ${settings.openMode === mode.id ? styles.active : ''}`}
                onClick={() => onUpdateSettings({ openMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 默认 Tab */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>默认 Tab</label>
          <select
            value={settings.defaultTab}
            onChange={(e) => onUpdateSettings({ defaultTab: e.target.value as SidebarTab })}
            className={styles.searchInput}
            style={{ paddingLeft: '12px' }}
          >
            {DEFAULT_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* 侧边栏宽度 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsLabel}>侧边栏宽度</label>
          <div className={styles.settingsSlider}>
            <input
              type="range"
              min={200}
              max={600}
              value={settings.width}
              onChange={(e) => onUpdateSettings({ width: Number(e.target.value) })}
            />
            <span className={styles.settingsSliderValue}>{settings.width}px</span>
          </div>
        </div>

        {/* 记住状态 */}
        <div className={styles.settingsGroup}>
          <label className={styles.settingsCheckbox}>
            <input
              type="checkbox"
              checked={settings.rememberState}
              onChange={(e) => onUpdateSettings({ rememberState: e.target.checked })}
            />
            记住上次状态
          </label>
        </div>

        {/* 底部按钮 */}
        <div className={styles.settingsFooter}>
          <button
            className={`${styles.settingsButton} ${styles.secondary}`}
            onClick={onReset}
          >
            恢复默认
          </button>
          <button
            className={`${styles.settingsButton} ${styles.primary}`}
            onClick={onClose}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx
git commit -m "feat(sidebar): 添加设置弹窗组件"
```

---

## Task 8: 创建 ProjectDrawingsPanel 组件

**Files:**
- Create: `packages/frontend/src/components/ProjectDrawingsPanel.tsx`

- [ ] **Step 1: 先查看 useFileSystem hook 接口**

阅读 `packages/frontend/src/hooks/file-system/useFileSystem.ts` 了解接口。

- [ ] **Step 2: 创建项目图纸面板组件**

```typescript
import React, { useState, useMemo } from 'react';
import { Search, FileImage, AlertCircle } from 'lucide-react';
import { useFileSystem } from '../hooks/file-system/useFileSystem';
import { FileSystemNode } from '../types/filesystem';
import { DrawingOpenMode } from '../types/sidebar';
import styles from './sidebar.module.css';

interface ProjectDrawingsPanelProps {
  projectId: string;
  openMode: DrawingOpenMode;
  onDrawingOpen: (node: FileSystemNode, openMode: DrawingOpenMode) => void;
  onDrawingModified: () => boolean;
}

// 图纸文件扩展名
const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

/** 检查是否为图纸文件 */
function isDrawingFile(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return DRAWING_EXTENSIONS.includes(ext);
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化日期 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  openMode,
  onDrawingOpen,
  onDrawingModified,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { nodes, loading } = useFileSystem({
    mode: 'project',
    projectId,
  });

  // 过滤图纸文件
  const drawingNodes = useMemo(() => {
    const drawings = nodes.filter((node) => 
      node.type === 'file' && isDrawingFile(node.name)
    );
    
    if (!searchQuery) return drawings;
    
    return drawings.filter((node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [nodes, searchQuery]);

  const handleDrawingClick = (node: FileSystemNode) => {
    onDrawingOpen(node, openMode);
  };

  if (loading) {
    return (
      <div className={styles.projectDrawingsPanel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyText}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.projectDrawingsPanel}>
      {/* 搜索框 */}
      <div className={styles.searchBox}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="搜索图纸..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* 图纸列表 */}
      <div className={styles.drawingList}>
        {drawingNodes.length === 0 ? (
          <div className={styles.emptyState}>
            <FileImage size={48} className={styles.emptyIcon} />
            <div className={styles.emptyText}>
              {searchQuery ? '未找到匹配的图纸' : '当前项目暂无图纸文件'}
            </div>
          </div>
        ) : (
          drawingNodes.map((node) => (
            <div
              key={node.id}
              className={styles.drawingItem}
              onClick={() => handleDrawingClick(node)}
            >
              <div className={styles.drawingThumbnail}>
                <FileImage size={24} color="#9ca3af" />
              </div>
              <div className={styles.drawingInfo}>
                <div className={styles.drawingName}>{node.name}</div>
                <div className={styles.drawingMeta}>
                  {node.updatedAt && formatDate(node.updatedAt)}
                  {node.size && ` · ${formatFileSize(node.size)}`}
                </div>
                {/* 已修改状态指示 */}
                {false && (
                  <div className={styles.drawingStatus}>
                    <span className={styles.statusDot} />
                    已修改
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/components/ProjectDrawingsPanel.tsx
git commit -m "feat(sidebar): 添加项目图纸面板组件"
```

---

## Task 9: 创建 SidebarContainer 核心容器组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarContainer.tsx`

- [ ] **Step 1: 创建核心容器组件**

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SidebarTab } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import { useDrawingModifyState } from '../../hooks/useDrawingModifyState';
import { mxcadManager } from '../../services/mxcadManager';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { SidebarSettingsModal } from './SidebarSettingsModal';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import { CADEditorSidebar } from '../CADEditorSidebar';
import { CollaborateSidebar } from '../CollaborateSidebar';
import { FileSystemNode } from '../../types/filesystem';
import styles from './sidebar.module.css';

interface SidebarContainerProps {
  projectId: string;
  onInsertFile?: (file: FileSystemNode) => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  onInsertFile,
}) => {
  const {
    settings,
    updateSettings,
    resetSettings,
    setWidth,
    setIsVisible,
    setLastActiveTab,
  } = useSidebarSettings();

  const { isModified, resetModified } = useDrawingModifyState();
  
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    if (settings.rememberState && settings.lastActiveTab) {
      return settings.lastActiveTab;
    }
    return settings.defaultTab;
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [pendingDrawing, setPendingDrawing] = useState<FileSystemNode | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // 根据 displayMode 决定是否显示
  const isVisible = settings.isVisible;
  const isCollapsed = !isVisible;

  // 调整 MxCAD 容器位置
  useEffect(() => {
    const width = isCollapsed ? 0 : settings.width;
    mxcadManager.adjustContainerPosition(width);
  }, [settings.width, isCollapsed]);

  // Tab 切换
  const handleTabChange = useCallback((tab: SidebarTab) => {
    setActiveTab(tab);
    if (settings.rememberState) {
      setLastActiveTab(tab);
    }
    if (isCollapsed) {
      setIsVisible(true);
    }
  }, [settings.rememberState, isCollapsed, setLastActiveTab, setIsVisible]);

  // 关闭侧边栏
  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, [setIsVisible]);

  // 打开设置弹窗
  const handleSettingsClick = useCallback(() => {
    setShowSettings(true);
  }, []);

  // 宽度调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const newWidth = e.clientX;
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setWidth]);

  // 图纸打开处理
  const handleDrawingOpen = useCallback((node: FileSystemNode, openMode: string) => {
    if (openMode === 'confirm' && isModified.current) {
      setPendingDrawing(node);
      setShowConfirmDialog(true);
    } else {
      // 直接打开
      openDrawing(node);
    }
  }, [isModified]);

  const openDrawing = useCallback((node: FileSystemNode) => {
    // 调用文件打开逻辑
    console.log('Opening drawing:', node.name);
    resetModified();
    setPendingDrawing(null);
    setShowConfirmDialog(false);
  }, [resetModified]);

  // 确认对话框处理
  const handleConfirmSave = useCallback(() => {
    // TODO: 保存当前图纸
    if (pendingDrawing) {
      openDrawing(pendingDrawing);
    }
  }, [pendingDrawing, openDrawing]);

  const handleConfirmDiscard = useCallback(() => {
    if (pendingDrawing) {
      openDrawing(pendingDrawing);
    }
  }, [pendingDrawing, openDrawing]);

  const handleConfirmCancel = useCallback(() => {
    setPendingDrawing(null);
    setShowConfirmDialog(false);
  }, []);

  // 自动隐藏模式的悬停处理
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTriggerMouseEnter = useCallback(() => {
    if (settings.displayMode === 'auto-hide') {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      setIsHovering(true);
      setIsVisible(true);
    }
  }, [settings.displayMode, setIsVisible]);

  const handleContainerMouseLeave = useCallback(() => {
    if (settings.displayMode === 'auto-hide' && !showSettings && !showConfirmDialog) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovering(false);
        setIsVisible(false);
      }, 300);
    }
  }, [settings.displayMode, showSettings, showConfirmDialog, setIsVisible]);

  // 渲染 Tab 内容
  const renderTabContent = () => {
    switch (activeTab) {
      case 'project':
        return (
          <ProjectDrawingsPanel
            projectId={projectId}
            openMode={settings.openMode}
            onDrawingOpen={handleDrawingOpen}
            onDrawingModified={() => isModified.current}
          />
        );
      case 'gallery':
        return <CADEditorSidebar onInsertFile={onInsertFile} />;
      case 'collaborate':
        return <CollaborateSidebar />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* 收起状态的触发条 */}
      {isCollapsed && (
        <SidebarTrigger
          activeTab={activeTab}
          onTabClick={handleTabChange}
          onSettingsClick={handleSettingsClick}
        />
      )}

      {/* 展开的侧边栏容器 */}
      <div
        ref={containerRef}
        className={`${styles.sidebarContainer} ${isCollapsed ? styles.collapsed : ''}`}
        style={{ width: isCollapsed ? 0 : settings.width }}
        onMouseLeave={handleContainerMouseLeave}
      >
        <SidebarTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSettingsClick={handleSettingsClick}
          onCloseClick={handleClose}
        />
        
        <div className={styles.content}>
          {renderTabContent()}
        </div>

        {/* 调整宽度手柄 */}
        <div
          className={`${styles.resizeHandle} ${isResizing ? styles.active : ''}`}
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* 设置弹窗 */}
      {showSettings && (
        <SidebarSettingsModal
          settings={settings}
          onUpdateSettings={updateSettings}
          onReset={resetSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className={styles.settingsOverlay} onClick={(e) => e.target === e.currentTarget && handleConfirmCancel()}>
          <div className={styles.confirmDialog}>
            <AlertCircle size={48} className={styles.confirmIcon} />
            <p className={styles.confirmMessage}>
              当前图纸已修改，是否保存？
            </p>
            <div className={styles.confirmActions}>
              <button
                className={`${styles.settingsButton} ${styles.secondary}`}
                onClick={handleConfirmDiscard}
              >
                不保存
              </button>
              <button
                className={`${styles.settingsButton} ${styles.primary}`}
                onClick={handleConfirmSave}
              >
                保存
              </button>
              <button
                className={`${styles.settingsButton} ${styles.secondary}`}
                onClick={handleConfirmCancel}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/src/components/sidebar/SidebarContainer.tsx
git commit -m "feat(sidebar): 添加侧边栏容器核心组件"
```

---

## Task 10: 扩展 SidebarContext

**Files:**
- Modify: `packages/frontend/src/contexts/SidebarContext.tsx`

- [ ] **Step 1: 读取现有文件**

读取 `packages/frontend/src/contexts/SidebarContext.tsx` 的完整内容。

- [ ] **Step 2: 扩展 SidebarType 类型**

将第 13 行的 `SidebarType` 类型定义修改为：

```typescript
export type SidebarType = 'project' | 'gallery' | 'collaborate';
```

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/contexts/SidebarContext.tsx
git commit -m "feat(sidebar): 扩展 SidebarType 类型添加 project"
```

---

## Task 11: 重构 CADEditorSidebar 组件

**Files:**
- Modify: `packages/frontend/src/components/CADEditorSidebar.tsx`

- [ ] **Step 1: 读取现有文件**

读取 `packages/frontend/src/components/CADEditorSidebar.tsx` 的完整内容。

- [ ] **Step 2: 移除宽度管理相关代码**

需要移除：
1. `width` state 及其初始化
2. `isResizing` state
3. `useEffect` 中的 `mxcadManager.adjustContainerPosition()` 调用
4. 宽度拖拽相关的 JSX（调整手柄）

保留：
- `useSidebar('gallery')` 获取 `isActive` 和 `close`
- 核心业务逻辑（图库数据获取、分类、搜索、分页）
- `onInsertFile` 回调

修改后的组件结构（伪代码）：

```typescript
export const CADEditorSidebar: React.FC<CADEditorSidebarProps> = ({
  onInsertFile,
}) => {
  // 移除：const [width, setWidth] = useState(300);
  // 移除：const [isResizing, setIsResizing] = useState(false);
  
  // 保留：获取 isActive 用于判断当前 Tab 是否激活
  const { isActive, close } = useSidebar('gallery');
  
  // 移除：adjustContainerPosition 的 useEffect
  
  // ... 保留其他业务逻辑 ...
  
  return (
    <div className={styles.sidebar}>
      {/* 移除调整宽度手柄 */}
      {/* 保留其他内容 */}
    </div>
  );
};
```

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/components/CADEditorSidebar.tsx
git commit -m "refactor(sidebar): 移除 CADEditorSidebar 宽度管理逻辑"
```

---

## Task 12: 重构 CollaborateSidebar 组件

**Files:**
- Modify: `packages/frontend/src/components/CollaborateSidebar.tsx`

- [ ] **Step 1: 读取现有文件**

读取 `packages/frontend/src/components/CollaborateSidebar.tsx` 的完整内容。

- [ ] **Step 2: 移除宽度管理相关代码**

需要移除：
1. `width` state 及其初始化
2. `useEffect` 中的 `mxcadManager.adjustContainerPosition()` 调用
3. 宽度拖拽相关的 JSX

保留：
- `useSidebar('collaborate')` 获取 `isActive` 和 `close`
- 核心业务逻辑（协同会话管理）

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/components/CollaborateSidebar.tsx
git commit -m "refactor(sidebar): 移除 CollaborateSidebar 宽度管理逻辑"
```

---

## Task 13: 集成到 CADEditorDirect 页面

**Files:**
- Modify: `packages/frontend/src/pages/CADEditorDirect.tsx`

- [ ] **Step 1: 读取现有文件**

读取 `packages/frontend/src/pages/CADEditorDirect.tsx` 的相关部分（侧边栏渲染部分）。

- [ ] **Step 2: 添加导入**

在文件顶部添加导入：

```typescript
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
```

- [ ] **Step 3: 替换侧边栏渲染**

找到现有的侧边栏渲染代码（约第 620-668 行），将其替换为 `SidebarContainer`：

```tsx
// 替换现有的 SidebarProvider 包裹的侧边栏渲染
<SidebarProvider>
  <CADEditorContent
    // ... 其他 props
  />
</SidebarProvider>

// 在 CADEditorContent 内部，替换现有的 CADEditorSidebar 和 CollaborateSidebar
// 为：
<SidebarContainer
  projectId={projectId}
  onInsertFile={handleInsertFile}
/>
```

- [ ] **Step 4: 提交**

```bash
git add packages/frontend/src/pages/CADEditorDirect.tsx
git commit -m "feat(sidebar): 集成 SidebarContainer 到 CADEditorDirect 页面"
```

---

## Task 14: 验证三种显示模式

- [ ] **Step 1: 启动前端开发服务器**

```bash
pnpm --filter frontend dev
```

- [ ] **Step 2: 验证手动控制模式**

1. 进入 CAD 编辑器
2. 打开设置，选择"手动控制"
3. 确认侧边栏保持当前状态不变
4. 点击 Tab 切换，确认功能正常
5. 点击关闭按钮，确认侧边栏收起

- [ ] **Step 3: 验证自动隐藏模式**

1. 打开设置，选择"自动隐藏"
2. 确认侧边栏默认收起为触发条
3. 鼠标悬停触发条，确认侧边栏展开
4. 鼠标移出，确认 300ms 后自动收起
5. 确认展开状态有关闭按钮

- [ ] **Step 4: 验证可收起模式**

1. 打开设置，选择"可收起"
2. 确认侧边栏收起为触发条
3. 点击触发条，确认侧边栏展开
4. 点击关闭按钮，确认侧边栏收起

- [ ] **Step 5: 提交验证**

```bash
git add -A
git commit -m "test: 验证侧边栏三种显示模式"
```

---

## Task 15: 验证三种图纸打开方式

- [ ] **Step 1: 验证直接切换模式**

1. 打开设置，选择"直接切换"
2. 在项目图纸 Tab 选择一个图纸
3. 确认直接打开，无确认对话框

- [ ] **Step 2: 验证确认后切换模式**

1. 打开设置，选择"确认后切换"
2. 打开一个图纸并修改
3. 选择另一个图纸
4. 确认弹出"是否保存"对话框
5. 测试"保存"、"不保存"、"取消"三个按钮

- [ ] **Step 3: 验证新标签打开模式**

1. 打开设置，选择"新标签打开"
2. 选择多个图纸
3. 确认打开行为（当前版本为预留接口）

- [ ] **Step 4: 提交验证**

```bash
git add -A
git commit -m "test: 验证三种图纸打开方式"
```

---

## Task 16: 最终验证与提交

- [ ] **Step 1: 完整功能测试**

1. 测试所有 Tab 切换
2. 测试设置保存与恢复
3. 测试宽度调整
4. 测试搜索功能
5. 测试右键菜单（如有实现）

- [ ] **Step 2: 检查类型错误**

```bash
pnpm --filter frontend type-check
```

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat(sidebar): 完成 CAD 编辑器侧边栏重构

- 新增 SidebarContainer 统一管理侧边栏状态和宽度
- 新增 ProjectDrawingsPanel 实现项目图纸快速访问
- 支持三种显示模式：手动控制、自动隐藏、可收起
- 支持三种图纸打开方式：直接切换、确认后切换、新标签打开
- 设置通过 localStorage 持久化
- 保持与现有 MxCAD 命令的兼容性"
```

---

## 总结

| Task | 描述 | 文件 |
|------|------|------|
| 1 | 创建类型定义 | `types/sidebar.ts` |
| 2 | 创建设置管理 Hook | `hooks/useSidebarSettings.ts` |
| 3 | 创建图纸修改状态检测 Hook | `hooks/useDrawingModifyState.ts` |
| 4 | 创建样式文件 | `components/sidebar/sidebar.module.css` |
| 5 | 创建 Tab 切换栏组件 | `components/sidebar/SidebarTabBar.tsx` |
| 6 | 创建触发条组件 | `components/sidebar/SidebarTrigger.tsx` |
| 7 | 创建设置弹窗组件 | `components/sidebar/SidebarSettingsModal.tsx` |
| 8 | 创建项目图纸面板组件 | `components/ProjectDrawingsPanel.tsx` |
| 9 | 创建核心容器组件 | `components/sidebar/SidebarContainer.tsx` |
| 10 | 扩展 SidebarContext | `contexts/SidebarContext.tsx` |
| 11 | 重构 CADEditorSidebar | `components/CADEditorSidebar.tsx` |
| 12 | 重构 CollaborateSidebar | `components/CollaborateSidebar.tsx` |
| 13 | 集成到 CADEditorDirect | `pages/CADEditorDirect.tsx` |
| 14 | 验证显示模式 | - |
| 15 | 验证打开方式 | - |
| 16 | 最终验证与提交 | - |
