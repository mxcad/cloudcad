///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef } from 'react';
import { nodeControllerGetNode } from '@/api-sdk';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';

import type { LibraryType } from '../types';
import type { UseProjectDrawingsDataReturn } from './useProjectDrawingsData';

export interface UseProjectDrawingsEffectsOptions {
  data: UseProjectDrawingsDataReturn;
  projectId?: string;
  visible: boolean;
  isPersonalSpace: boolean;
  personalSpaceId?: string | null;
  parentId?: string | null;
  libraryType?: LibraryType;
  /** 子tab标识，用于持久化状态（仅非库模式使用） */
  tabId?: string;
}

/**
 * ProjectDrawingsPanel 副作用层
 *
 * 全部 useEffect（初始化/库加载/可见性恢复/parentId 导航/分类切换/错误提示）
 * 与快捷键注册。剪贴板快捷键回调来自内核 useFileBrowserActions.clipboard。
 */
export function useProjectDrawingsEffects({
  data,
  projectId,
  visible,
  isPersonalSpace,
  personalSpaceId,
  parentId: initialParentId,
  libraryType,
  tabId,
}: UseProjectDrawingsEffectsOptions) {
  const {
    selectedProjectId,
    setSelectedProjectId,
    breadcrumb,
    setBreadcrumb,
    resetNodes,
    loadNodes,
    loadNodesRef,
    buildBreadcrumbPathRef,
    isLibraryMode,
    getCategoryNodeId,
    selectedCategoryPath,
    libraryRootId,
    loadRootId,
    listInitializedRef,
    searchQuery,
    setSearchQuery,
    setCurrentPage,
    currentPage,
    checkSkipVisibilityReload,
    loadNodesError,
    showToast,
    undoStack,
    redoStack,
    clearMultiSelection,
    categoriesLoaded,
  } = data;

  const {
    sidebarHandleCopy,
    sidebarHandleCut,
    sidebarHandlePaste,
    sidebarHandleUndo,
    sidebarHandleRedo,
  } = {
    sidebarHandleCopy: data.fileBrowser.clipboard.copy,
    sidebarHandleCut: data.fileBrowser.clipboard.cut,
    sidebarHandlePaste: data.fileBrowser.clipboard.paste,
    sidebarHandleUndo: data.fileBrowser.clipboard.undo,
    sidebarHandleRedo: data.fileBrowser.clipboard.redo,
  };

  const panelRef = useRef<HTMLDivElement>(null);

  // 持久化状态标识（仅非库模式使用）
  const isPersistentMode = !isLibraryMode && !!tabId;
  const persistentInitializedRef = useRef(false);
  // parentId 导航已锚定的项目根：非空即表示目录归属已由当前图纸的父目录确定，
  // 项目根初始化不得再覆盖（否则正确目录会被切回项目根、当前图纸高亮丢失）
  const parentNavigatedProjectIdRef = useRef<string | null>(null);

  // Initialize: load project root
  useEffect(() => {
    if (!visible) return;
    if (!selectedProjectId) {
      // 回到项目列表：目录归属重新交回项目根初始化
      parentNavigatedProjectIdRef.current = null;
      // 库模式由专门的 useLoadNodes 初始化 effect 管理，此处不干预
      if (!isLibraryMode) {
        resetNodes();
        setBreadcrumb([]);
      }
      return;
    }

    // 已按当前图纸的父目录导航到本项目：不再回落项目根。
    // parentId 导航会 setSelectedProjectId，本 effect 会因此重跑。
    if (parentNavigatedProjectIdRef.current === selectedProjectId) return;

    // 持久化模式：如果已初始化过，跳过重新加载
    if (isPersistentMode && persistentInitializedRef.current) {
      return;
    }

    // 在飞请求返回后复核归属：请求期间若发生 parentId 导航，结果作废
    const supersededByParentNavigation = () =>
      parentNavigatedProjectIdRef.current === selectedProjectId;

    const initProject = async () => {
      try {
        const response = await nodeControllerGetNode({
          path: { nodeId: selectedProjectId },
        });
        // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
        if (response.error) throw response.error;
        const projectNode = response.data;
        if (supersededByParentNavigation()) return;
        if (projectNode)
          setBreadcrumb([{ id: projectNode.id, name: projectNode.name }]);
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载项目信息失败');
      }
    };

    // 先等待项目根节点就绪（可能触发服务端懒创建），再加载子节点
    initProject().then(() => {
      if (supersededByParentNavigation()) return;
      loadNodes(selectedProjectId);
      // 标记持久化模式已初始化
      if (isPersistentMode) {
        persistentInitializedRef.current = true;
      }
    });
  }, [visible, selectedProjectId, loadNodes, isPersistentMode]);

  // Sync projectId in personal space
  useEffect(() => {
    if (isPersonalSpace && projectId && projectId !== selectedProjectId)
      setSelectedProjectId(projectId);
  }, [isPersonalSpace, projectId, selectedProjectId]);

  // Library mode: load on categories loaded
  // libraryRootId 可能因 API 降级或时序竞争为 null，此时用 useLoadNodes 的
  // libraryRootId（来自 React Query 缓存）作为兜底，确保 loadNodes 总能被调用
  useEffect(() => {
    if (!visible || !isLibraryMode || listInitializedRef.current) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    listInitializedRef.current = true;
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, 1, '', false);
  }, [
    visible,
    isLibraryMode,
    categoriesLoaded,
    libraryRootId,
    libraryType,
    loadRootId,
  ]);

  // 分类选择：当用户点击分类时重新加载节点列表
  // 注意：不依赖 visible，只依赖 selectedCategoryPath，以免切标签页时重置搜索/页码
  useEffect(() => {
    if (!isLibraryMode || !listInitializedRef.current) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    setSearchQuery('');
    setCurrentPage(1);
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, 1, '', false);
  }, [selectedCategoryPath, isLibraryMode, libraryRootId, loadRootId]);

  // 可见性恢复时重新加载当前页（不重置搜索/页码）
  // 只在 visible 从 false→true 翻转时执行（prevVisibleRef 门控）：
  // 旧实现 deps 含 nodes，滚动加载 append/prepend 合并后 nodes 变化会误触发本 effect，
  // 以 replace 模式重载当前页，把刚追加/前插的列表冲掉（滚动到底「加载中然后没有了」）。
  // removeLocalNode / updateLocalNode 等本地乐观操作通过 checkSkipVisibilityReload 跳过 reload，
  // 避免删除/重命名后误触发全量查询失效导致数据显示异常
  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (prevVisibleRef.current === visible) return;
    prevVisibleRef.current = visible;
    if (!visible || !isLibraryMode || !listInitializedRef.current) return;
    if (checkSkipVisibilityReload()) return;
    const rootId = libraryRootId || loadRootId;
    if (!rootId) return;
    const nodeId = getCategoryNodeId(selectedCategoryPath, rootId);
    if (nodeId) loadNodes(nodeId, currentPage, searchQuery, false);
  }, [
    visible,
    isLibraryMode,
    libraryRootId,
    loadRootId,
    selectedCategoryPath,
    currentPage,
    searchQuery,
    loadNodes,
    checkSkipVisibilityReload,
  ]);

  // Reset on libraryType change (skip on mount to avoid race with init effect)
  const prevLibraryTypeRef = useRef(libraryType);
  useEffect(() => {
    if (prevLibraryTypeRef.current === libraryType) return;
    prevLibraryTypeRef.current = libraryType;
    listInitializedRef.current = false;
    resetNodes();
    setBreadcrumb([]);
    setSearchQuery('');
  }, [libraryType]);

  // parentId navigation
  // visible 门控：面板隐藏时不导航（不发 buildBreadcrumbPath/loadNodes/权限请求），
  // 切到该 tab 时再定位到当前文件的父目录
  useEffect(() => {
    if (!visible) return;
    const navigate = async () => {
      if (!initialParentId || initialParentId.trim() === '') return;

      let path: { id: string; name: string }[];
      try {
        path = await buildBreadcrumbPathRef.current(initialParentId);
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 导航到 parentId 失败');
        return;
      }
      if (path.length === 0) return;

      // 目录归属：父目录回溯到的根决定当前图纸属于哪个空间。
      // 面板只承载自己空间的目录——个人空间面板不得显示项目目录，反之亦然。
      if (personalSpaceId) {
        const inPersonalSpace = path[0]?.id === personalSpaceId;
        if (isPersonalSpace && !inPersonalSpace) return;
        if (!isPersonalSpace && inPersonalSpace) {
          // 我的项目 tab：当前图纸不在任何项目内，回到项目列表
          setSelectedProjectId(null);
          setBreadcrumb([]);
          resetNodes();
          return;
        }
      }

      // 同步声明目录归属：项目根初始化（含已在飞的请求）不得再覆盖
      const rootId = path[0]?.id || initialParentId;
      parentNavigatedProjectIdRef.current = rootId;
      setBreadcrumb(path);
      setSelectedProjectId(rootId);
      await loadNodesRef.current(initialParentId);
    };
    navigate();
  }, [visible, initialParentId, isPersonalSpace, personalSpaceId]);

  // Clear multi-selection when navigating to a different category
  useEffect(() => {
    clearMultiSelection();
  }, [selectedCategoryPath]);

  // API 错误时显示 toast
  useEffect(() => {
    if (loadNodesError) {
      showToast(t(`加载失败: ${loadNodesError}`), 'error');
    }
  }, [loadNodesError]);

  useSelectionShortcuts({
    containerRef: panelRef,
    enabled: true,
    enabledKeys: ['clear'],
    onUndo: sidebarHandleUndo,
    onRedo: sidebarHandleRedo,
    onCopy: sidebarHandleCopy,
    onCut: sidebarHandleCut,
    onPaste: sidebarHandlePaste,
    onDeleteSelected: () => {},
    onRenameSelected: () => {},
    onClearSelection: clearMultiSelection,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  return { panelRef };
}

export type UseProjectDrawingsEffectsReturn = ReturnType<
  typeof useProjectDrawingsEffects
>;
