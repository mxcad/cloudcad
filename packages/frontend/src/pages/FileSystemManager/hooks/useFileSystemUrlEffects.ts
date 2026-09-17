import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  nodeControllerUpdateNode,
  nodeControllerResolvePath,
  nodeControllerGetParentContext,
  projectControllerCreateProject,
} from '@/api-sdk';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { resolveRootKindFromMode } from '@/lib/crossProjectPaste';
import { t } from '@/languages';
import { useCopy } from '@/hooks/useCopy';
import { getErrorMessage } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';

interface UseFileSystemNavigationOptions {
  mode: 'project' | 'personal-space';
  urlProjectId: string | undefined;
  isAtRoot: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  pagination: { page: number; limit?: number };
  handlePageChange: (page: number) => void;
  editingProject: FileSystemNode | null;
  handleEnterFolder: (node: FileSystemNode) => void;
  handleUpdateProjectSubmit: (
    fn: (
      id: string,
      data: { name?: string; description?: string }
    ) => Promise<void>
  ) => void;
  handleCreateProjectSubmit: (
    fn: (name: string, description: string) => Promise<void>
  ) => void;
  showToast: (
    message: string,
    type?: 'info' | 'success' | 'error' | 'warning'
  ) => void;
}

export function useFileSystemUrlEffects({
  mode,
  urlProjectId,
  isAtRoot,
  searchTerm,
  setSearchTerm,
  pagination,
  handlePageChange,
  editingProject,
  handleEnterFolder,
  handleUpdateProjectSubmit,
  handleCreateProjectSubmit,
  showToast,
}: UseFileSystemNavigationOptions) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { copy: copyPathText } = useCopy({
    successMessage: t('路径已复制到剪贴板'),
    failMessage: t('复制失败'),
  });

  const highlightNodeId = searchParams.get('highlight');
  const pageFromUrl = searchParams.get('page');
  const searchQueryFromUrl = searchParams.get('search');

  useEffect(() => {
    if (searchQueryFromUrl && searchQueryFromUrl !== searchTerm) {
      setSearchTerm(searchQueryFromUrl);
    }
  }, [searchQueryFromUrl, searchTerm, setSearchTerm]);

  const prevPageFromUrlRef = useRef(pageFromUrl);
  useEffect(() => {
    if (!pageFromUrl || isAtRoot) return;
    const pageNum = parseInt(pageFromUrl, 10);
    if (isNaN(pageNum) || pageNum < 1) return;

    if (
      prevPageFromUrlRef.current !== pageFromUrl ||
      pagination.page !== pageNum
    ) {
      prevPageFromUrlRef.current = pageFromUrl;
      handlePageChange(pageNum);
    }

    const timer = setTimeout(() => {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('page');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFromUrl, isAtRoot, searchParams, navigate]);

  useEffect(() => {
    if (!highlightNodeId) return;
    const timer = setTimeout(() => {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('highlight');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }, 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildNodeUrl = useCallback(
    (node: FileSystemNode): string => {
      if (mode === 'personal-space') {
        return `/personal-space/${node.id}`;
      }
      const pid = urlProjectId || node.projectId;
      if (pid) {
        return `/projects/${pid}/files/${node.id}`;
      }
      return '#';
    },
    [mode, urlProjectId]
  );

  const handleOpen = useCallback(
    (node: FileSystemNode) => {
      handleEnterFolder(node);
    },
    [handleEnterFolder]
  );

  const handleOpenInNewTab = useCallback(
    (node: FileSystemNode) => {
      const url = buildNodeUrl(node);
      if (url !== '#') window.open(window.location.origin + url, '_blank');
    },
    [buildNodeUrl]
  );

  const handleBreadcrumbPathSubmit = useCallback(
    async (path: string) => {
      const normalizedPath = path.replace(/\s*\/\s*/g, ' > ');
      const query: { path: string; projectId?: string } = {
        path: normalizedPath,
      };
      if (mode === 'project' && urlProjectId) {
        query.projectId = urlProjectId;
      }
      if (!query.projectId && mode !== 'personal-space') return;
      try {
        const result = await nodeControllerResolvePath({ query });
        if (result.error) throw result.error;
        const node = result.data as FileSystemNode;
        if (node?.id) {
          const url = buildNodeUrl(node);
          navigate(url);
        }
      } catch (error) {
        // 透传后端真实原因（无权限/服务错误等），不再一律误报"路径不存在"
        showToast(getErrorMessage(error) || t('路径不存在或无法访问'), 'error');
      }
    },
    [mode, urlProjectId, navigate, buildNodeUrl, showToast]
  );

  const handleOpenFileLocation = useCallback(
    async (node: FileSystemNode) => {
      if (!node.parentId) return;
      try {
        const result = await nodeControllerGetParentContext({
          path: { nodeId: node.id },
          query: { pageSize: pagination?.limit || 30 },
        });
        if (result.error) throw result.error;
        if (!result.data) throw new Error('parent-context 返回空');
        const ctx = result.data;
        const baseUrl = buildNodeUrl({
          ...node,
          id: node.parentId,
        } as FileSystemNode);
        const url = `${window.location.origin}${baseUrl}?highlight=${node.id}&page=${ctx.pageNumber}`;
        window.open(url, '_blank');
      } catch {
        const baseUrl = buildNodeUrl({
          ...node,
          id: node.parentId,
        } as FileSystemNode);
        window.open(window.location.origin + baseUrl, '_blank');
      }
    },
    [buildNodeUrl, pagination]
  );

  const handleCopyClipboard = useCallback(
    (node: FileSystemNode) => {
      useFileSystemClipboardStore
        .getState()
        .setClipboard([node.id], 'copy', urlProjectId || '', {
          sourceParentIds: { [node.id]: node.parentId || '' },
          sourceRootKind: resolveRootKindFromMode(mode),
        });
      showToast(t('已复制'), 'info');
    },
    [urlProjectId, mode, showToast]
  );

  const handleCut = useCallback(
    (node: FileSystemNode) => {
      useFileSystemClipboardStore
        .getState()
        .setClipboard([node.id], 'cut', urlProjectId || '', {
          sourceParentIds: { [node.id]: node.parentId || '' },
          sourceRootKind: resolveRootKindFromMode(mode),
        });
      showToast(t('已剪切'), 'info');
    },
    [urlProjectId, mode, showToast]
  );

  const handleFolderDownload = useCallback((node: FileSystemNode) => {
    useBatchDownloadStore.getState().openFolderDialog(node.id, node.name);
  }, []);

  const handleCopyPath = useCallback(
    async (node: FileSystemNode) => {
      const path = node.ancestorPath
        ? `${node.ancestorPath} > ${node.name}`
        : node.name;
      await copyPathText(path);
    },
    [copyPathText]
  );

  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editingProject) {
        handleUpdateProjectSubmit(async (id, data) => {
          await nodeControllerUpdateNode({
            path: { nodeId: id },
            body: {
              name: data.name ?? undefined,
              description: data.description,
            },
            throwOnError: true,
          } as Parameters<typeof nodeControllerUpdateNode>[0]);
        });
      } else {
        handleCreateProjectSubmit(async (name, description) => {
          await projectControllerCreateProject({
            body: { name, description },
            throwOnError: true,
          } as Parameters<typeof projectControllerCreateProject>[0]);
        });
      }
    },
    [editingProject, handleCreateProjectSubmit, handleUpdateProjectSubmit]
  );

  const handleUploadExternalReference = useCallback(
    (_node: FileSystemNode) => {},
    []
  );

  return {
    buildNodeUrl,
    handleOpen,
    handleOpenInNewTab,
    handleBreadcrumbPathSubmit,
    handleOpenFileLocation,
    handleCopyClipboard,
    handleCut,
    handleFolderDownload,
    handleCopyPath,
    handleSubmitProject,
    handleUploadExternalReference,
    highlightNodeId,
  };
}
