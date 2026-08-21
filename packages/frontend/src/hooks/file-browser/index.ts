///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * FileBrowserCore - 文件浏览器无头内核（#230 方案 B）
 *
 * 纯逻辑 hooks，零 JSX 零 DOM 感知（Façade 出口，ADR-0029）：
 * - useFileBrowserData：数据加载骨架/分页/搜索/面包屑/导航（navigation: 'url' | 'controlled'）
 * - useFileBrowserSelection：多选状态机 + 批量模式开关（multiple: 'always' | 'batch-only' | false）
 * - useFileBrowserActions：CRUD/剪贴板/移动复制/拖拽回调 + enableTrash 子域开关 + onOpen 注入
 * - useFileBrowserModals：弹窗状态机（SelectFolder 收敛 + 枚举身份 + 表单值），渲染归外壳
 * - useFileBrowser：聚合（A+B+C+D 一键组合）
 * - buildNodeActions：右键菜单动作构建纯函数
 * - useLibraryLoader：库模式/普通节点数据源适配器（外壳注入 source）
 */

export { useFileBrowserData } from './useFileBrowserData';
export type {
  UseFileBrowserDataOptions,
  UseFileBrowserDataReturn,
} from './useFileBrowserData';
export { useFileBrowserSelection } from './useFileBrowserSelection';
export type {
  UseFileBrowserSelectionOptions,
  UseFileBrowserSelectionReturn,
} from './useFileBrowserSelection';
export { useFileBrowserActions } from './useFileBrowserActions';
export type {
  UseFileBrowserActionsOptions,
  UseFileBrowserActionsReturn,
  FileBrowserClipboard,
  FileBrowserTrash,
} from './useFileBrowserActions';
export { useFileBrowserModals } from './useFileBrowserModals';
export type {
  UseFileBrowserModalsOptions,
  UseFileBrowserModalsReturn,
} from './useFileBrowserModals';
export { useFileBrowser } from './useFileBrowser';
export type {
  UseFileBrowserOptions,
  UseFileBrowserReturn,
} from './useFileBrowser';
export { buildNodeActions } from './buildNodeActions';
export type {
  BuildNodeActionsOptions,
  BuildNodeActionsResult,
  BuildNodeActionsPermissions,
  BuildNodeActionsCallbacks,
} from './buildNodeActions';
export { useLibraryLoader } from './useLibraryLoader';
export type {
  UseLibraryLoaderOptions,
  UseLibraryLoaderReturn,
} from './useLibraryLoader';
export type {
  FileBrowserNavigationMode,
  FileBrowserSelectionMode,
  FileBrowserSource,
  FileBrowserPermissions,
  FileBrowserModalId,
  FileBrowserModalState,
  FolderPickSourceNode,
  LibraryType,
  ShowToastFn,
  ShowConfirmFn,
} from './fileBrowserTypes';
