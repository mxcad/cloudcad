///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useEffect, useRef } from 'react';
import { libraryApi } from '../services/libraryApi';
import type { FileSystemNode } from '../types/filesystem';
import { handleError } from '../utils/errorHandler';
import { isAbortError } from '../utils/errorHandler';

/**
 * 公共资源库类型
 */
export type LibraryType = 'drawing' | 'block';

interface UseLibraryPanelOptions {
  /** 库类型 */
  libraryType: LibraryType;
  /** 打开文件回调 */
  onFileOpen?: (node: FileSystemNode) => void;
  /** Toast 显示函数 */
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface LibraryPanelState {
  /** 当前库 ID */
  libraryId: string | null;
  /** 节点列表 */
  nodes: FileSystemNode[];
  /** 当前目录 ID */
  currentFolderId: string | null;
  /** 面包屑导航 */
  breadcrumbs: Array<{ id: string; name: string }>;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 搜索关键词 */
  searchTerm: string;
  /** 视图模式 */
  viewMode: 'grid' | 'list';
}

interface UseLibraryPanelActions {
  /** 进入文件夹 */
  enterFolder: (node: FileSystemNode) => void;
  /** 返回上一级 */
  goBack: () => void;
  /** 导航到指定面包屑 */
  navigateToBreadcrumb: (index: number) => void;
  /** 刷新当前列表 */
  refresh: () => Promise<void>;
  /** 搜索 */
  setSearchTerm: (term: string) => void;
  /** 切换视图模式 */
  setViewMode: (mode: 'grid' | 'list') => void;
  /** 删除节点 */
  deleteNode: (nodeId: string) => Promise<void>;
  /** 重命名节点 */
  renameNode: (nodeId: string, name: string) => Promise<void>;
  /** 打开文件 */
  openFile: (node: FileSystemNode) => Promise<void>;
  /** 下载文件 */
  downloadNode: (node: FileSystemNode) => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
}

export type UseLibraryPanelReturn = LibraryPanelState & UseLibraryPanelActions;

/** 清理文件名，移除不安全字符 */
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * 公共资源库面板 Hook
 *
 * 专为侧边栏场景设计，不依赖路由导航
 * 提供图纸库和图块库的状态管理和操作
 */
export const useLibraryPanel = (options: UseLibraryPanelOptions): UseLibraryPanelReturn => {
  const { libraryType, onFileOpen, showToast } = options;

  // 状态
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('library:viewMode');
      if (saved === 'grid' || saved === 'list') {
        return saved;
      }
    } catch {
      // localStorage 不可用时忽略
    }
    return 'list';
  });

  // 搜索防抖
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSearchTermRef = useRef('');

  /**
   * 加载库内容
   */
  const loadNodes = useCallback(
    async (folderId: string | null, search?: string) => {
      setLoading(true);
      setError(null);

      try {
        // 首次加载时获取库 ID
        let libId = libraryId;
        if (!libId) {
          const libraryApiMethod =
            libraryType === 'drawing'
              ? libraryApi.getDrawingLibrary
              : libraryApi.getBlockLibrary;

          const libraryResponse = await libraryApiMethod();
          const library = libraryResponse.data as { id: string; name: string };
          libId = library.id;
          setLibraryId(libId);
        }

        // 加载子节点
        const childrenApiMethod =
          libraryType === 'drawing'
            ? libraryApi.getDrawingChildren
            : libraryApi.getBlockChildren;

        const targetId = folderId || libId;
        const response = await childrenApiMethod(targetId, {
          page: 1,
          limit: 100,
          search: search || undefined,
        });

        const childrenData = response.data as { nodes: FileSystemNode[] };
        setNodes(childrenData.nodes || []);
      } catch (err) {
        if (isAbortError(err)) return;

        const appError = handleError(err, '加载资源库失败');
        setError(appError.message);
        showToast?.(appError.message, 'error');
        setNodes([]);
      } finally {
        setLoading(false);
      }
    },
    [libraryType, libraryId, showToast]
  );

  /**
   * 初始化加载
   */
  useEffect(() => {
    loadNodes(null);
  }, [libraryType]); // 只在库类型变化时重新加载

  /**
   * 搜索防抖处理
   */
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (debouncedSearchTermRef.current !== searchTerm) {
        debouncedSearchTermRef.current = searchTerm;
        loadNodes(currentFolderId, searchTerm || undefined);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, currentFolderId, loadNodes]);

  /**
   * 进入文件夹
   */
  const enterFolder = useCallback(
    (node: FileSystemNode) => {
      setCurrentFolderId(node.id);
      setBreadcrumbs((prev) => [...prev, { id: node.id, name: node.name }]);
      setSearchTerm('');
      loadNodes(node.id);
    },
    [loadNodes]
  );

  /**
   * 返回上一级
   */
  const goBack = useCallback(() => {
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      const lastItem = newBreadcrumbs[newBreadcrumbs.length - 1];
      const parentFolderId = lastItem?.id ?? null;
      setCurrentFolderId(parentFolderId);
      setSearchTerm('');
      loadNodes(parentFolderId);
    }
  }, [breadcrumbs, loadNodes]);

  /**
   * 导航到指定面包屑
   */
  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const newBreadcrumbs = index < 0 ? [] : breadcrumbs.slice(0, index + 1);
      setBreadcrumbs(newBreadcrumbs);
      const lastItem = newBreadcrumbs[newBreadcrumbs.length - 1];
      const folderId = lastItem?.id ?? null;
      setCurrentFolderId(folderId);
      setSearchTerm('');
      loadNodes(folderId);
    },
    [breadcrumbs, loadNodes]
  );

  /**
   * 刷新当前列表
   */
  const refresh = useCallback(async () => {
    await loadNodes(currentFolderId, searchTerm || undefined);
  }, [loadNodes, currentFolderId, searchTerm]);

  /**
   * 删除节点
   */
  const deleteNode = useCallback(
    async (nodeId: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.deleteDrawingNode
            : libraryApi.deleteBlockNode;

        await apiMethod(nodeId, true);
        showToast?.('删除成功', 'success');
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        const appError = handleError(err, '删除失败');
        showToast?.(appError.message, 'error');
        throw err;
      }
    },
    [libraryType, refresh, showToast]
  );

  /**
   * 重命名节点
   */
  const renameNode = useCallback(
    async (nodeId: string, name: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.renameDrawingNode
            : libraryApi.renameBlockNode;

        await apiMethod(nodeId, name);
        showToast?.('重命名成功', 'success');
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        const appError = handleError(err, '重命名失败');
        showToast?.(appError.message, 'error');
        throw err;
      }
    },
    [libraryType, refresh, showToast]
  );

  /**
   * 打开文件
   */
  const openFile = useCallback(
    async (node: FileSystemNode) => {
      try {
        // 获取完整节点信息
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.getDrawingNode
            : libraryApi.getBlockNode;

        const response = await apiMethod(node.id);
        const fileData = response.data as FileSystemNode;

        // 调用回调打开文件
        onFileOpen?.(fileData);
        showToast?.(`已打开：${fileData.name}`, 'success');
      } catch (err) {
        if (isAbortError(err)) return;
        const appError = handleError(err, '打开文件失败');
        showToast?.(appError.message, 'error');
      }
    },
    [libraryType, onFileOpen, showToast]
  );

  /**
   * 下载文件
   */
  const downloadNode = useCallback(
    async (node: FileSystemNode) => {
      try {
        // 使用 libraryApi 下载文件
        const response = libraryType === 'drawing'
          ? await libraryApi.downloadDrawingNode(node.id)
          : await libraryApi.downloadBlockNode(node.id);

        // 处理下载
        const blob = new Blob([response.data as unknown as BlobPart]);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = sanitizeFileName(node.name);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        showToast?.(`已下载：${fileName}`, 'success');
      } catch (err) {
        if (isAbortError(err)) return;
        const appError = handleError(err, '下载失败');
        showToast?.(appError.message, 'error');
      }
    },
    [libraryType, showToast]
  );

  /**
   * 切换视图模式（持久化到 localStorage）
   */
  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('library:viewMode', mode);
    } catch {
      // localStorage 不可用时忽略
    }
  }, []);

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    libraryId,
    nodes,
    currentFolderId,
    breadcrumbs,
    loading,
    error,
    searchTerm,
    viewMode,
    // Actions
    enterFolder,
    goBack,
    navigateToBreadcrumb,
    refresh,
    setSearchTerm,
    setViewMode,
    deleteNode,
    renameNode,
    openFile,
    downloadNode,
    clearError,
  };
};

export default useLibraryPanel;
