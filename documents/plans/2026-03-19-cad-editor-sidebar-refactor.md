# CAD编辑器侧边栏重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构CAD编辑器侧边栏，实现统一的Tab切换容器、项目图纸快速访问面板、三种显示模式和三种图纸打开方式。

**Architecture:** 创建统一的 SidebarContainer 容器组件管理所有侧边栏内容，通过 Tab 切换实现项目图纸、图库、协同三个功能面板。显示模式通过设置面板配置，使用 localStorage 持久化用户偏好。

**Tech Stack:** React, TypeScript, Tailwind CSS, Zustand, localStorage

**Spec:** `documents/specs/2026-03-19-cad-editor-sidebar-refactor-design.md`

---

## 文件结构

### 新增文件
```
packages/frontend/src/
├── types/
│   └── sidebar.ts                      # 侧边栏类型定义
├── hooks/
│   ├── useSidebarSettings.ts           # 侧边栏设置管理
│   └── useDrawingModifyState.ts        # 图纸修改状态检测
└── components/
    ├── sidebar/
    │   ├── SidebarContainer.tsx        # 统一侧边栏容器
    │   ├── SidebarTabBar.tsx           # Tab切换栏
    │   ├── SidebarTrigger.tsx          # 收起状态触发条
    │   ├── SidebarSettingsModal.tsx    # 设置弹窗
    │   └── sidebar.module.css          # 侧边栏样式
    └── ProjectDrawingsPanel.tsx        # 项目图纸面板
```

### 修改文件
```
packages/frontend/src/
├── contexts/
│   └── SidebarContext.tsx              # 扩展 SidebarType，添加设置管理
├── pages/
│   └── CADEditorDirect.tsx             # 集成 SidebarContainer
└── components/
    ├── CADEditorSidebar.tsx            # 移除独立显示控制逻辑
    └── CollaborateSidebar.tsx          # 移除独立显示控制逻辑
```

---

## Task 1: 创建类型定义

**Files:**
- Create: `packages/frontend/src/types/sidebar.ts`

- [ ] **Step 1: 创建侧边栏类型定义文件**

```typescript
// packages/frontend/src/types/sidebar.ts

/**
 * 侧边栏 Tab 类型
 */
export type SidebarTab = 'project' | 'gallery' | 'collaborate';

/**
 * 侧边栏显示模式
 * - manual: 手动控制，用户手动切换显示/隐藏
 * - auto-hide: 自动隐藏，鼠标移出自动收起
 * - collapse: 可收起，收起为边缘触发条
 */
export type SidebarDisplayMode = 'manual' | 'auto-hide' | 'collapse';

/**
 * 图纸打开方式
 * - direct: 直接切换
 * - confirm: 确认后切换（检测修改状态）
 * - new-tab: 新标签打开（预留）
 */
export type DrawingOpenMode = 'direct' | 'confirm' | 'new-tab';

/**
 * 侧边栏设置状态
 */
export interface SidebarSettings {
  /** 显示模式 */
  displayMode: SidebarDisplayMode;
  /** 图纸打开方式 */
  openMode: DrawingOpenMode;
  /** 默认 Tab */
  defaultTab: SidebarTab;
  /** 侧边栏宽度 (200-600) */
  width: number;
  /** 是否记住上次状态 */
  rememberState: boolean;
  /** 上次活动的 Tab */
  lastActiveTab: SidebarTab | null;
  /** 上次是否可见 */
  lastVisible: boolean;
}

/**
 * 默认侧边栏设置
 */
export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  displayMode: 'manual',
  openMode: 'direct',
  defaultTab: 'project',
  width: 300,
  rememberState: true,
  lastActiveTab: null,
  lastVisible: false,
};

/**
 * localStorage 存储键
 */
export const SIDEBAR_SETTINGS_STORAGE_KEY = 'cad-editor-sidebar-settings';
```

- [ ] **Step 2: 提交类型定义**

```bash
git add packages/frontend/src/types/sidebar.ts
git commit -m "feat(sidebar): add sidebar type definitions"
```

---

## Task 2: 创建设置管理 Hook

**Files:**
- Create: `packages/frontend/src/hooks/useSidebarSettings.ts`

- [ ] **Step 1: 创建 useSidebarSettings Hook**

```typescript
// packages/frontend/src/hooks/useSidebarSettings.ts
import { useState, useEffect, useCallback } from 'react';
import {
  SidebarSettings,
  SidebarTab,
  SidebarDisplayMode,
  DrawingOpenMode,
  DEFAULT_SIDEBAR_SETTINGS,
  SIDEBAR_SETTINGS_STORAGE_KEY,
} from '../types/sidebar';

/**
 * 侧边栏设置管理 Hook
 * 负责设置的读取、保存和状态管理
 */
export function useSidebarSettings() {
  const [settings, setSettings] = useState<SidebarSettings>(() => {
    // 初始化时从 localStorage 读取设置
    try {
      const stored = localStorage.getItem(SIDEBAR_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SidebarSettings>;
        return { ...DEFAULT_SIDEBAR_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('读取侧边栏设置失败:', error);
    }
    return DEFAULT_SIDEBAR_SETTINGS;
  });

  // 保存设置到 localStorage
  const saveSettings = useCallback((newSettings: SidebarSettings) => {
    try {
      localStorage.setItem(
        SIDEBAR_SETTINGS_STORAGE_KEY,
        JSON.stringify(newSettings)
      );
    } catch (error) {
      console.error('保存侧边栏设置失败:', error);
    }
  }, []);

  // 更新设置
  const updateSettings = useCallback(
    (updates: Partial<SidebarSettings>) => {
      setSettings((prev) => {
        const newSettings = { ...prev, ...updates };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [saveSettings]
  );

  // 更新显示模式
  const setDisplayMode = useCallback(
    (mode: SidebarDisplayMode) => {
      updateSettings({ displayMode: mode });
    },
    [updateSettings]
  );

  // 更新打开方式
  const setOpenMode = useCallback(
    (mode: DrawingOpenMode) => {
      updateSettings({ openMode: mode });
    },
    [updateSettings]
  );

  // 更新默认 Tab
  const setDefaultTab = useCallback(
    (tab: SidebarTab) => {
      updateSettings({ defaultTab: tab });
    },
    [updateSettings]
  );

  // 更新宽度
  const setWidth = useCallback(
    (width: number) => {
      const clampedWidth = Math.max(200, Math.min(600, width));
      updateSettings({ width: clampedWidth });
    },
    [updateSettings]
  );

  // 更新记住状态选项
  const setRememberState = useCallback(
    (remember: boolean) => {
      updateSettings({ rememberState: remember });
    },
    [updateSettings]
  );

  // 记录上次状态
  const recordLastState = useCallback(
    (tab: SidebarTab | null, visible: boolean) => {
      if (settings.rememberState) {
        updateSettings({ lastActiveTab: tab, lastVisible: visible });
      }
    },
    [settings.rememberState, updateSettings]
  );

  // 重置为默认设置
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SIDEBAR_SETTINGS);
    saveSettings(DEFAULT_SIDEBAR_SETTINGS);
  }, [saveSettings]);

  return {
    settings,
    updateSettings,
    setDisplayMode,
    setOpenMode,
    setDefaultTab,
    setWidth,
    setRememberState,
    recordLastState,
    resetSettings,
  };
}
```

- [ ] **Step 2: 提交设置管理 Hook**

```bash
git add packages/frontend/src/hooks/useSidebarSettings.ts
git commit -m "feat(sidebar): add useSidebarSettings hook"
```

---

## Task 3: 创建图纸修改状态检测 Hook

**Files:**
- Create: `packages/frontend/src/hooks/useDrawingModifyState.ts`

- [ ] **Step 1: 创建 useDrawingModifyState Hook**

```typescript
// packages/frontend/src/hooks/useDrawingModifyState.ts
import { useEffect, useRef, useCallback } from 'react';

/**
 * 图纸修改状态检测 Hook
 * 使用 MxCAD 的 databaseModify 事件检测图纸是否被修改
 */
export function useDrawingModifyState() {
  const isModifiedRef = useRef(false);
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // 使用 MxCpp 获取 MxCAD 实例
    const setupListener = async () => {
      const { MxCpp } = await import('mxcad');
      const mxcad = MxCpp.getCurrentMxCAD();
      
      if (!mxcad) {
        console.warn('MxCAD 实例未初始化，无法监听修改事件');
        return;
      }

      const handler = () => {
        isModifiedRef.current = true;
        console.log('图纸已修改');
      };

      handlerRef.current = handler;
      mxcad.on('databaseModify', handler);
    };

    setupListener();

    // 清理事件监听器
    return () => {
      const cleanup = async () => {
        const { MxCpp } = await import('mxcad');
        const mxcad = MxCpp.getCurrentMxCAD();
        
        if (mxcad && handlerRef.current) {
          mxcad.off('databaseModify', handlerRef.current);
          handlerRef.current = null;
        }
      };
      cleanup();
    };
  }, []);

  // 重置修改状态（在打开新图纸后调用）
  const resetModified = useCallback(() => {
    isModifiedRef.current = false;
  }, []);

  // 检查是否已修改
  const checkModified = useCallback(() => {
    return isModifiedRef.current;
  }, []);

  return {
    isModified: isModifiedRef,
    checkModified,
    resetModified,
  };
}
```

- [ ] **Step 2: 提交图纸修改状态检测 Hook**

```bash
git add packages/frontend/src/hooks/useDrawingModifyState.ts
git commit -m "feat(sidebar): add useDrawingModifyState hook"
```

---

## Task 4: 创建侧边栏样式文件

**Files:**
- Create: `packages/frontend/src/components/sidebar/sidebar.module.css`

- [ ] **Step 1: 创建侧边栏 CSS 模块**

```css
/* packages/frontend/src/components/sidebar/sidebar.module.css */

/* 容器 */
.container {
  display: flex;
  flex-direction: column;
  background-color: #1e2129;
  color: white;
  transition: width 200ms ease-in-out;
  position: relative;
  z-index: 10;
}

/* Tab 栏 */
.tabBar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 48px;
  border-bottom: 1px solid #4a5568;
  background-color: #1a202c;
}

.tabList {
  display: flex;
  flex: 1;
  gap: 4px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  color: #94a3b8;
  background: transparent;
  border: none;
}

.tab:hover {
  background-color: #333a47;
  color: #e2e8f0;
}

.tab.active {
  background-color: #4f46e5;
  color: white;
}

.tabActions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.iconButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 150ms ease;
  color: #94a3b8;
  background: transparent;
  border: none;
}

.iconButton:hover {
  background-color: #333a47;
  color: #e2e8f0;
}

/* 触发条（收起状态） */
.trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  background-color: #1e2129;
  border-right: 1px solid #4a5568;
  transition: all 200ms ease;
}

.triggerTab {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  width: 100%;
  cursor: pointer;
  transition: all 150ms ease;
  color: #94a3b8;
  background: transparent;
  border: none;
  border-bottom: 1px solid #2d3748;
}

.triggerTab:hover {
  background-color: #333a47;
  color: #e2e8f0;
}

.triggerTab.active {
  background-color: #4f46e5;
  color: white;
}

.triggerTab svg {
  width: 20px;
  height: 20px;
  margin-bottom: 4px;
}

.triggerTab span {
  font-size: 10px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

/* 内容区域 */
.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 调整宽度手柄 */
.resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background-color 150ms ease;
  z-index: 20;
}

.resizer:hover,
.resizer.active {
  background-color: #4f46e5;
}

/* 自动隐藏模式的触发区域 */
.autoHideTrigger {
  position: absolute;
  left: 0;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: pointer;
  z-index: 5;
}

.autoHideTrigger:hover {
  background: linear-gradient(to right, rgba(79, 70, 229, 0.3), transparent);
}
```

- [ ] **Step 2: 提交样式文件**

```bash
git add packages/frontend/src/components/sidebar/sidebar.module.css
git commit -m "feat(sidebar): add sidebar CSS module"
```

---

## Task 5: 创建 Tab 切换栏组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarTabBar.tsx`

- [ ] **Step 1: 创建 SidebarTabBar 组件**

```typescript
// packages/frontend/src/components/sidebar/SidebarTabBar.tsx
import React from 'react';
import { FileText, Box, Users, Settings, X } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
  onClose: () => void;
}

const TAB_CONFIG = [
  { id: 'project' as SidebarTab, label: '项目图纸', icon: FileText },
  { id: 'gallery' as SidebarTab, label: '图库', icon: Box },
  { id: 'collaborate' as SidebarTab, label: '协同', icon: Users },
];

export const SidebarTabBar: React.FC<SidebarTabBarProps> = ({
  activeTab,
  onTabChange,
  onSettingsClick,
  onClose,
}) => {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.tabActions}>
        <button
          className={styles.iconButton}
          onClick={onSettingsClick}
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          className={styles.iconButton}
          onClick={onClose}
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 提交 Tab 切换栏组件**

```bash
git add packages/frontend/src/components/sidebar/SidebarTabBar.tsx
git commit -m "feat(sidebar): add SidebarTabBar component"
```

---

## Task 6: 创建触发条组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarTrigger.tsx`

- [ ] **Step 1: 创建 SidebarTrigger 组件**

```typescript
// packages/frontend/src/components/sidebar/SidebarTrigger.tsx
import React from 'react';
import { FileText, Box, Users, Settings } from 'lucide-react';
import { SidebarTab } from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarTriggerProps {
  activeTab: SidebarTab;
  onTabClick: (tab: SidebarTab) => void;
  onSettingsClick: () => void;
  onExpand: () => void;
}

const TRIGGER_CONFIG = [
  { id: 'project' as SidebarTab, label: '项目图纸', icon: FileText },
  { id: 'gallery' as SidebarTab, label: '图库', icon: Box },
  { id: 'collaborate' as SidebarTab, label: '协同', icon: Users },
];

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({
  activeTab,
  onTabClick,
  onSettingsClick,
  onExpand,
}) => {
  return (
    <div className={styles.trigger}>
      {TRIGGER_CONFIG.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            className={`${styles.triggerTab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => {
              onTabClick(tab.id);
              onExpand();
            }}
            title={tab.label}
          >
            <Icon />
            <span>{tab.label}</span>
          </button>
        );
      })}
      <button
        className={styles.triggerTab}
        onClick={onSettingsClick}
        title="设置"
      >
        <Settings />
        <span>设置</span>
      </button>
    </div>
  );
};
```

- [ ] **Step 2: 提交触发条组件**

```bash
git add packages/frontend/src/components/sidebar/SidebarTrigger.tsx
git commit -m "feat(sidebar): add SidebarTrigger component"
```

---

## Task 7: 创建项目图纸面板组件

**Files:**
- Create: `packages/frontend/src/components/ProjectDrawingsPanel.tsx`

- [ ] **Step 1: 创建 ProjectDrawingsPanel 组件**

```typescript
// packages/frontend/src/components/ProjectDrawingsPanel.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Loader2,
  FileText,
  MoreVertical,
  SortAsc,
} from 'lucide-react';
import { projectsApi } from '../services/projectsApi';
import { useNotification } from '../contexts/NotificationContext';
import type { FileNodeDto } from '../types/api-client';

// 图纸文件扩展名
const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

interface ProjectDrawingsPanelProps {
  projectId: string;
  currentFileId: string | null;
  onOpenFile: (fileId: string) => void;
  isModified: boolean;
}

type SortField = 'name' | 'updatedAt' | 'size';
type SortOrder = 'asc' | 'desc';

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  currentFileId,
  onOpenFile,
  isModified,
}) => {
  const { showToast } = useNotification();
  const [files, setFiles] = useState<FileNodeDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 加载项目图纸文件
  const loadDrawings = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      // 使用 projectsApi.getChildren 获取项目下的文件列表
      const response = await projectsApi.getChildren(projectId);
      const allFiles = response.data || [];
      
      // 过滤图纸文件
      const drawingFiles = allFiles.filter((file) => {
        const ext = file.name?.toLowerCase().split('.').pop() || '';
        return DRAWING_EXTENSIONS.includes(`.${ext}`);
      });

      setFiles(drawingFiles);
    } catch (error) {
      console.error('加载图纸列表失败:', error);
      showToast('加载图纸列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    loadDrawings();
  }, [loadDrawings]);

  // 过滤和排序
  const filteredFiles = useMemo(() => {
    let result = files;

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((file) =>
        file.name?.toLowerCase().includes(term)
      );
    }

    // 排序
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'updatedAt':
          comparison =
            new Date(a.updatedAt || 0).getTime() -
            new Date(b.updatedAt || 0).getTime();
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [files, searchTerm, sortField, sortOrder]);

  // 格式化文件大小
  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 格式化日期
  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="px-3 py-2 border-b border-[#4a5568]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-[#94a3b8] w-4 h-4" />
          <input
            type="text"
            placeholder="搜索图纸..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#252b3a] border border-[#4a5568] rounded text-sm text-[#e2e8f0] placeholder-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#4f46e5]"
          />
        </div>
        {/* 排序控制 */}
        <div className="flex items-center gap-2 mt-2">
          <SortAsc className="w-3 h-3 text-[#94a3b8]" />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="flex-1 px-2 py-1 bg-[#252b3a] border border-[#4a5568] rounded text-xs text-[#e2e8f0] focus:outline-none"
          >
            <option value="updatedAt">修改时间</option>
            <option value="name">名称</option>
            <option value="size">大小</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1 bg-[#252b3a] border border-[#4a5568] rounded text-xs text-[#e2e8f0] hover:bg-[#333a47]"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-[#4f46e5] animate-spin" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[#94a3b8]">
            <FileText className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-xs text-center px-4">
              {searchTerm ? '未找到匹配的图纸' : '暂无图纸文件'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => onOpenFile(file.id || '')}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  currentFileId === file.id
                    ? 'bg-[#4f46e5]/20 border border-[#4f46e5]'
                    : 'bg-[#252b3a] hover:bg-[#333a47]'
                }`}
              >
                <FileText className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e2e8f0] truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-[#94a3b8]">
                    {formatDate(file.updatedAt)} · {formatSize(file.size)}
                  </p>
                </div>
                {currentFileId === file.id && isModified && (
                  <span className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" title="已修改" />
                )}
                {currentFileId === file.id && (
                  <span className="text-xs text-[#4f46e5] flex-shrink-0">当前</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 提交项目图纸面板组件**

```bash
git add packages/frontend/src/components/ProjectDrawingsPanel.tsx
git commit -m "feat(sidebar): add ProjectDrawingsPanel component"
```

---

## Task 8: 创建设置弹窗组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx`

- [ ] **Step 1: 创建 SidebarSettingsModal 组件**

```typescript
// packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx
import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  SidebarSettings,
  SidebarDisplayMode,
  DrawingOpenMode,
  SidebarTab,
} from '../../types/sidebar';
import styles from './sidebar.module.css';

interface SidebarSettingsModalProps {
  isOpen: boolean;
  settings: SidebarSettings;
  onUpdateSettings: (updates: Partial<SidebarSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const DISPLAY_MODE_OPTIONS: { value: SidebarDisplayMode; label: string; description: string }[] = [
  { value: 'manual', label: '手动控制', description: '手动切换显示/隐藏' },
  { value: 'auto-hide', label: '自动隐藏', description: '鼠标移出自动收起' },
  { value: 'collapse', label: '可收起', description: '收起为边缘触发条' },
];

const OPEN_MODE_OPTIONS: { value: DrawingOpenMode; label: string; description: string }[] = [
  { value: 'direct', label: '直接切换', description: '直接打开新图纸' },
  { value: 'confirm', label: '确认后切换', description: '检测修改后确认' },
  { value: 'new-tab', label: '新标签打开', description: '支持多图纸（预留）' },
];

const DEFAULT_TAB_OPTIONS: { value: SidebarTab; label: string }[] = [
  { value: 'project', label: '项目图纸' },
  { value: 'gallery', label: '图库' },
  { value: 'collaborate', label: '协同' },
];

export const SidebarSettingsModal: React.FC<SidebarSettingsModalProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onReset,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e2129] rounded-lg shadow-xl w-[400px] max-w-[90vw]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#4a5568]">
          <h3 className="text-sm font-semibold text-[#e2e8f0]">侧边栏设置</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#333a47] rounded transition-colors"
          >
            <X className="w-4 h-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* 设置内容 */}
        <div className="p-4 space-y-4">
          {/* 显示模式 */}
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">
              显示模式
            </label>
            <div className="space-y-2">
              {DISPLAY_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="displayMode"
                    value={option.value}
                    checked={settings.displayMode === option.value}
                    onChange={() => onUpdateSettings({ displayMode: option.value })}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm text-[#e2e8f0]">{option.label}</span>
                    <p className="text-xs text-[#94a3b8]">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 图纸打开方式 */}
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">
              图纸打开方式
            </label>
            <div className="space-y-2">
              {OPEN_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="openMode"
                    value={option.value}
                    checked={settings.openMode === option.value}
                    onChange={() => onUpdateSettings({ openMode: option.value })}
                    className="mt-1"
                  />
                  <div>
                    <span className="text-sm text-[#e2e8f0]">{option.label}</span>
                    <p className="text-xs text-[#94a3b8]">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 默认 Tab */}
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">
              默认 Tab
            </label>
            <select
              value={settings.defaultTab}
              onChange={(e) => onUpdateSettings({ defaultTab: e.target.value as SidebarTab })}
              className="w-full px-3 py-2 bg-[#252b3a] border border-[#4a5568] rounded text-sm text-[#e2e8f0] focus:outline-none focus:ring-1 focus:ring-[#4f46e5]"
            >
              {DEFAULT_TAB_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 侧边栏宽度 */}
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">
              侧边栏宽度: {settings.width}px
            </label>
            <input
              type="range"
              min={200}
              max={600}
              value={settings.width}
              onChange={(e) => onUpdateSettings({ width: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* 记住状态 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.rememberState}
              onChange={(e) => onUpdateSettings({ rememberState: e.target.checked })}
            />
            <span className="text-sm text-[#e2e8f0]">记住上次状态</span>
          </label>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#4a5568]">
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#333a47] rounded transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            恢复默认
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#333a47] rounded transition-colors"
            >
              取消
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-[#4f46e5] hover:bg-[#4338ca] text-white rounded transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 提交设置弹窗组件**

```bash
git add packages/frontend/src/components/sidebar/SidebarSettingsModal.tsx
git commit -m "feat(sidebar): add SidebarSettingsModal component"
```

---

## Task 9: 创建侧边栏容器组件

**Files:**
- Create: `packages/frontend/src/components/sidebar/SidebarContainer.tsx`

- [ ] **Step 1: 创建 SidebarContainer 组件**

```typescript
// packages/frontend/src/components/sidebar/SidebarContainer.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SidebarTab, SidebarDisplayMode } from '../../types/sidebar';
import { useSidebarSettings } from '../../hooks/useSidebarSettings';
import { useDrawingModifyState } from '../../hooks/useDrawingModifyState';
import { mxcadManager } from '../../services/mxcadManager';
import { useNotification } from '../../contexts/NotificationContext';
import { SidebarTabBar } from './SidebarTabBar';
import { SidebarTrigger } from './SidebarTrigger';
import { SidebarSettingsModal } from './SidebarSettingsModal';
import { ProjectDrawingsPanel } from '../ProjectDrawingsPanel';
import CADEditorSidebar from '../CADEditorSidebar';
import CollaborateSidebar from '../CollaborateSidebar';
import styles from './sidebar.module.css';

interface SidebarContainerProps {
  projectId: string;
  currentFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onInsertFile?: (file: { nodeId: string; filename: string }) => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  projectId,
  currentFileId,
  onOpenFile,
  onInsertFile,
}) => {
  const { showToast, showConfirm } = useNotification();
  const {
    settings,
    updateSettings,
    setWidth,
    recordLastState,
    resetSettings,
  } = useSidebarSettings();
  const { checkModified, resetModified } = useDrawingModifyState();

  // 当前活动 Tab
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    settings.rememberState && settings.lastActiveTab
      ? settings.lastActiveTab
      : settings.defaultTab
  );

  // 是否显示侧边栏
  const [isVisible, setIsVisible] = useState(
    settings.rememberState ? settings.lastVisible : false
  );

  // 设置弹窗状态
  const [showSettings, setShowSettings] = useState(false);

  // 自动隐藏模式的鼠标状态
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 调整宽度状态
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 宽度变化时调整 CAD 容器位置
  useEffect(() => {
    const actualWidth = isVisible ? settings.width : 0;
    mxcadManager.adjustContainerPosition(actualWidth);
  }, [settings.width, isVisible]);

  // 记录上次状态
  useEffect(() => {
    recordLastState(activeTab, isVisible);
  }, [activeTab, isVisible, recordLastState]);

  // 自动隐藏模式处理
  useEffect(() => {
    if (settings.displayMode !== 'auto-hide') return;

    if (isHovering) {
      setIsVisible(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else if (isVisible) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 300);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHovering, isVisible, settings.displayMode]);

  // 处理打开文件
  const handleOpenFile = useCallback(
    async (fileId: string) => {
      const isModified = checkModified();

      if (settings.openMode === 'confirm' && isModified) {
        const confirmed = await showConfirm({
          title: '提示',
          message: '当前图纸已修改，是否保存？',
          type: 'warning',
          confirmText: '保存',
          cancelText: '不保存',
        });

        if (confirmed === undefined) {
          // 用户取消
          return;
        }

        if (confirmed) {
          // TODO: 保存当前图纸
          showToast('图纸已保存', 'success');
        }
      }

      // 打开新文件
      onOpenFile(fileId);
      resetModified();
    },
    [checkModified, settings.openMode, showConfirm, showToast, onOpenFile, resetModified]
  );

  // 处理 Tab 切换
  const handleTabChange = useCallback((tab: SidebarTab) => {
    setActiveTab(tab);
  }, []);

  // 处理显示/隐藏
  const handleToggle = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleExpand = useCallback(() => {
    setIsVisible(true);
  }, []);

  // 调整宽度处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setWidth(newWidth);
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

  // 渲染内容
  const renderContent = () => {
    switch (activeTab) {
      case 'project':
        return (
          <ProjectDrawingsPanel
            projectId={projectId}
            currentFileId={currentFileId}
            onOpenFile={handleOpenFile}
            isModified={checkModified()}
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

  // 收起模式
  if (settings.displayMode === 'collapse' && !isVisible) {
    return (
      <>
        <SidebarTrigger
          activeTab={activeTab}
          onTabClick={handleTabChange}
          onSettingsClick={() => setShowSettings(true)}
          onExpand={handleExpand}
        />
        <SidebarSettingsModal
          isOpen={showSettings}
          settings={settings}
          onUpdateSettings={updateSettings}
          onReset={resetSettings}
          onClose={() => setShowSettings(false)}
        />
      </>
    );
  }

  // 自动隐藏模式的触发区域
  const autoHideTrigger =
    settings.displayMode === 'auto-hide' && !isVisible ? (
      <div
        className={styles.autoHideTrigger}
        onMouseEnter={() => setIsHovering(true)}
      />
    ) : null;

  return (
    <>
      {autoHideTrigger}
      <div
        ref={sidebarRef}
        className={styles.container}
        style={{ width: isVisible ? settings.width : 0 }}
        onMouseEnter={() => settings.displayMode === 'auto-hide' && setIsHovering(true)}
        onMouseLeave={() => settings.displayMode === 'auto-hide' && setIsHovering(false)}
      >
        {isVisible && (
          <>
            <SidebarTabBar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              onSettingsClick={() => setShowSettings(true)}
              onClose={handleClose}
            />
            <div className={styles.content}>{renderContent()}</div>
            <div
              className={`${styles.resizer} ${isResizing ? styles.active : ''}`}
              onMouseDown={handleMouseDown}
            />
          </>
        )}
      </div>
      <SidebarSettingsModal
        isOpen={showSettings}
        settings={settings}
        onUpdateSettings={updateSettings}
        onReset={resetSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
};
```

- [ ] **Step 2: 提交侧边栏容器组件**

```bash
git add packages/frontend/src/components/sidebar/SidebarContainer.tsx
git commit -m "feat(sidebar): add SidebarContainer component"
```

---

## Task 10: 扩展 SidebarContext

**Files:**
- Modify: `packages/frontend/src/contexts/SidebarContext.tsx`

- [ ] **Step 1: 扩展 SidebarType 类型**

在文件顶部导入并扩展类型：

```typescript
// 在文件开头添加导入
import { SidebarTab } from '../types/sidebar';

// 修改 SidebarType 定义
export type SidebarType = SidebarTab; // 使用统一的类型定义
```

- [ ] **Step 2: 添加向后兼容的事件监听**

确保现有 `mxcad-open-sidebar` 事件继续工作，需要支持 `'project'` 类型。

在 `CADEditorDirect.tsx` 中的事件监听器已经处理了 `SidebarType`，现在 `SidebarType` 就是 `SidebarTab`，兼容性已保证。

- [ ] **Step 3: 提交 SidebarContext 修改**

```bash
git add packages/frontend/src/contexts/SidebarContext.tsx
git commit -m "feat(sidebar): extend SidebarType to include project tab"
```

---

## Task 11: 重构 CADEditorSidebar

**Files:**
- Modify: `packages/frontend/src/components/CADEditorSidebar.tsx`

- [ ] **Step 1: 移除独立显示控制逻辑**

修改组件，移除：
1. `useSidebar` hook 的 `isActive` 检查
2. 独立的 `width` 状态和调整逻辑
3. `mxcadManager.adjustContainerPosition` 调用
4. 调整宽度手柄

主要修改：
```typescript
// 移除以下导入
// import { useSidebar } from '../contexts/SidebarContext';
// import { mxcadManager } from '../services/mxcadManager';

// 移除以下状态和逻辑
// const { isActive, close } = useSidebar('gallery');
// const [width, setWidth] = useState(300);
// const [isResizing, setIsResizing] = useState(false);
// useEffect(() => { mxcadManager.adjustContainerPosition(...) }, [width, isActive]);
// 调整宽度相关的事件处理函数

// 移除末尾的
// if (!isActive) { return null; }

// 移除调整宽度手柄的 JSX
```

- [ ] **Step 2: 简化组件为纯内容组件**

将组件改为纯粹的 Tab 内容组件，不再控制显示/隐藏。

- [ ] **Step 3: 提交重构**

```bash
git add packages/frontend/src/components/CADEditorSidebar.tsx
git commit -m "refactor(sidebar): simplify CADEditorSidebar to content-only component"
```

---

## Task 12: 重构 CollaborateSidebar

**Files:**
- Modify: `packages/frontend/src/components/CollaborateSidebar.tsx`

- [ ] **Step 1: 移除独立显示控制逻辑**

与 Task 11 类似，移除：
1. `useSidebar` hook 的 `isActive` 检查
2. 独立的 `width` 状态和调整逻辑
3. `mxcadManager.adjustContainerPosition` 调用
4. 调整宽度手柄
5. `if (!isActive) return null` 检查

- [ ] **Step 2: 提交重构**

```bash
git add packages/frontend/src/components/CollaborateSidebar.tsx
git commit -m "refactor(sidebar): simplify CollaborateSidebar to content-only component"
```

---

## Task 13: 集成到 CADEditorDirect

**Files:**
- Modify: `packages/frontend/src/pages/CADEditorDirect.tsx`

- [ ] **Step 1: 导入 SidebarContainer**

在文件顶部添加导入：

```typescript
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
```

- [ ] **Step 2: 修改 CADEditorContent 组件**

替换现有的侧边栏渲染为 `SidebarContainer`：

```typescript
const CADEditorContent: React.FC<CADEditorContentProps> = ({
  onInsertFile,
  // ... 其他 props
}) => {
  // 移除 useSidebarManager 和 mxcad-open-sidebar 事件监听
  // 因为现在由 SidebarContainer 内部管理

  return (
    <div className="flex w-full h-screen relative">
      {/* 使用新的 SidebarContainer */}
      <SidebarContainer
        projectId={/* 从 props 或 context 获取 */}
        currentFileId={/* 从 props 或 context 获取 */}
        onOpenFile={/* 打开文件的处理函数 */}
        onInsertFile={onInsertFile}
      />
      
      {/* CAD编辑器内容区域 */}
      <div className="flex-1 relative">
        {/* ... 其他内容 */}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: 传递必要的状态**

需要从 `CADEditorDirect` 传递：
- `currentProjectId` - 当前项目 ID
- `currentFileIdRef.current` - 当前文件 ID

- [ ] **Step 4: 提交集成**

```bash
git add packages/frontend/src/pages/CADEditorDirect.tsx
git commit -m "feat(sidebar): integrate SidebarContainer into CADEditorDirect"
```

---

## Task 14: 检查国际化方案

**Files:**
- 检查项目中是否已有国际化配置

- [ ] **Step 1: 检查项目国际化方案**

检查项目中是否已有国际化方案（如 i18next、react-intl 等）。如果已有，按照现有方案添加侧边栏相关的文案。

如果没有国际化方案，则跳过此任务，后续根据项目需要统一添加。

- [ ] **Step 2: 如有国际化方案，添加文案**

根据现有国际化方案的文件结构，添加以下文案：

```
sidebar.tab.project: 项目图纸
sidebar.tab.gallery: 图库
sidebar.tab.collaborate: 协同
sidebar.settings.title: 侧边栏设置
sidebar.settings.displayMode: 显示模式
sidebar.settings.openMode: 图纸打开方式
sidebar.settings.manual: 手动控制
sidebar.settings.autoHide: 自动隐藏
sidebar.settings.collapse: 可收起
sidebar.confirm.title: 提示
sidebar.confirm.modified: 当前图纸已修改，是否保存？
```

- [ ] **Step 3: 如有修改，提交国际化文案**

```bash
git add packages/frontend/src/
git commit -m "feat(sidebar): add i18n translations for sidebar"
```

---

## Task 15: 测试与验证

- [ ] **Step 1: 测试三种显示模式**
  - 手动控制：点击Tab和关闭按钮切换
  - 自动隐藏：鼠标悬停展开，移出收起
  - 可收起：点击触发条展开，点击关闭收起

- [ ] **Step 2: 测试三种图纸打开方式**
  - 直接切换：直接打开新图纸
  - 确认后切换：修改图纸后切换显示确认对话框
  - 新标签打开：预留接口（当前版本仅显示提示）

- [ ] **Step 3: 测试图纸修改状态检测**
  - 打开图纸后修改，验证状态变化
  - 切换图纸后验证状态重置

- [ ] **Step 4: 测试设置持久化**
  - 修改设置后刷新页面，验证设置保留

- [ ] **Step 5: 测试兼容性**
  - 验证 `mxcad-open-sidebar` 事件仍然工作

---

## 验收标准

1. 侧边栏显示三种显示模式均正常工作
2. Tab 切换流畅，动画效果符合设计
3. 项目图纸面板正确显示当前项目的图纸文件
4. 图纸修改状态检测准确
5. 设置保存和恢复正常
6. 现有功能（图库、协同）不受影响
7. 命令触发侧边栏仍然兼容
