///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { SystemPermission, type Permission } from '@/constants/permissions';
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetRootNode,
} from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { parseCADEditorRoute } from '../cadEditorUtils';

interface FileInfo {
  fileHash?: string;
  path?: string;
  parentId?: string | null;
  id?: string;
  isRoot?: string | boolean;
  name?: string;
  deletedAt?: string | null;
  updatedAt?: string;
  libraryKey?: string | null;
}

interface UseFileLoaderOptions {
  fileId: string | null;
  isActive: boolean;
  isAuthenticated: boolean;
  isHomeMode: boolean;
  libraryKeyParam: 'drawing' | 'block' | null;
  versionParam: string | null;
  personalSpaceId: string | null;
  searchParams: URLSearchParams;
  hasPermission: (permission: Permission) => boolean;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onCurrentProjectIdChange: (projectId: string | null) => void;
  onCurrentFileHashChange: (hash: string) => void;
  onCheckMissingReferences: (identifier: string, shouldRetry: boolean, forceOpen: boolean) => Promise<boolean>;
}

/**
 * 文件加载 hook —— 从 CADEditorDirect.tsx 提取的大文件加载逻辑
 *
 * 负责：
 * - 根据 fileId 获取文件信息（项目文件 / 图纸库 / 图块库）
 * - 首次初始化或 URL 变化时重新加载 mxweb 文件
 * - 设置文件上下文（currentFileInfo, navigate, cacheTimestamp）
 * - 检查外部参照
 */
export function useFileLoader(options: UseFileLoaderOptions) {
  const {
    fileId,
    isActive,
    isAuthenticated,
    isHomeMode,
    libraryKeyParam,
    versionParam,
    personalSpaceId,
    searchParams,
    hasPermission,
    onLoadingChange,
    onErrorChange,
    onCurrentProjectIdChange,
    onCurrentFileHashChange,
    onCheckMissingReferences,
  } = options;

  const navigate = useNavigate();

  // Refs for tracking loaded state
  const isInitializedRef = useRef(false);
  const loadedFileUrlRef = useRef<string | null>(null);
  const currentFileIdRef = useRef<string | null>(null);

  const getFileUrl = useCallback(
    (file: FileInfo): { mxcadFileUrl: string; cacheTimestamp: number | undefined } | null => {
      if (!file.path) return null;

      let mxcadFileUrl: string;
      let cacheTimestamp: number | undefined;

      if (versionParam) {
        mxcadFileUrl = libraryKeyParam
          ? `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?v=${versionParam}`
          : `/api/v1/mxcad/filesData/${file.path}?v=${versionParam}`;
      } else if (file.updatedAt) {
        cacheTimestamp = new Date(file.updatedAt).getTime();
        mxcadFileUrl = libraryKeyParam
          ? `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?t=${cacheTimestamp}`
          : `/api/v1/mxcad/filesData/${file.path}?t=${cacheTimestamp}`;
      } else {
        return null;
      }

      return { mxcadFileUrl, cacheTimestamp };
    },
    [libraryKeyParam, versionParam],
  );

  const loadFile = useCallback(async () => {
    if (!fileId || !isActive) return;

    onLoadingChange(true);
    onErrorChange(null);

    try {
      const { mxcadManager } = await import('@/services/mxcadManager');

      let file: FileInfo | undefined;

      if (libraryKeyParam === 'drawing') {
        const { libraryApi } = await import('@/services/libraryApi');
        const nodeResponse = await libraryApi.getDrawingNode(fileId);
        file = nodeResponse.data as FileInfo;
      } else if (libraryKeyParam === 'block') {
        const { libraryApi } = await import('@/services/libraryApi');
        const nodeResponse = await libraryApi.getBlockNode(fileId);
        file = nodeResponse.data as FileInfo;
      } else {
        try {
          const { data: fileNode } = (await fileSystemControllerGetNode({
            path: { nodeId: fileId },
          })) as any;
          file = fileNode as FileInfo;
        } catch (error: unknown) {
          handleError(error, 'CADEditorDirect:getFileNode');
          const axiosError = error as { response?: { status?: number } };
          if (axiosError.response?.status === 401) {
            onErrorChange('请登录后访问此文件');
          } else if (axiosError.response?.status === 404) {
            onErrorChange('文件不存在或已被删除');
          } else {
            onErrorChange('获取文件信息失败，请检查网络连接');
          }
          onLoadingChange(false);
          return;
        }
      }

      if (!file) {
        onErrorChange('文件不存在');
        onLoadingChange(false);
        return;
      }

      if (file.deletedAt) {
        onErrorChange('文件已被删除');
        onLoadingChange(false);
        return;
      }

      if (!file.fileHash) {
        onErrorChange('文件尚未转换完成');
        onLoadingChange(false);
        return;
      }

      // Set file info + navigate function
      const { setCurrentFileInfo, setNavigateFunction, setCacheTimestamp } =
        await import('@/services/mxcadManager');

      let projectId: string | null | undefined = file.parentId || null;

      const shouldGetRoot =
        !libraryKeyParam ||
        (libraryKeyParam === 'drawing' &&
          hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)) ||
        (libraryKeyParam === 'block' &&
          hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));

      if (shouldGetRoot) {
        if (!file.isRoot && file.parentId) {
          try {
            if (!file.id) throw new Error('节点ID缺失');
            const { data: rootNode } = await fileSystemControllerGetRootNode({
              path: { nodeId: file.id },
            });
            if (rootNode?.id) {
              projectId = rootNode.id;
            }
          } catch (error: unknown) {
            handleError(error, 'CADEditorDirect:getRootNode');
          }
        } else if (file.isRoot) {
          projectId = file.id;
        }
      }

      const nodeIdParam = searchParams.get('nodeId');
      const fromPlatform = !!nodeIdParam;

      setCurrentFileInfo({
        fileId: file.id || '',
        parentId: file.parentId || null,
        projectId,
        name: file.name || '',
        personalSpaceId,
        libraryKey:
          (libraryKeyParam === 'drawing' || libraryKeyParam === 'block'
            ? libraryKeyParam
            : file.libraryKey === 'drawing' || file.libraryKey === 'block'
              ? file.libraryKey
              : undefined) as 'drawing' | 'block' | undefined,
        fromPlatform,
        updatedAt: file.updatedAt,
      });
      setNavigateFunction(navigate);

      if (projectId && !libraryKeyParam) {
        onCurrentProjectIdChange(projectId);
      } else if (!libraryKeyParam) {
        onCurrentProjectIdChange(null);
      }

      const urlResult = getFileUrl(file);
      if (!urlResult) {
        onErrorChange('无法构造文件访问URL');
        onLoadingChange(false);
        return;
      }

      const { mxcadFileUrl, cacheTimestamp } = urlResult;

      if (versionParam) {
        setCacheTimestamp(undefined);
      } else if (cacheTimestamp) {
        setCacheTimestamp(cacheTimestamp);
      }

      // Handle already-created MxCAD
      if (isInitializedRef.current && mxcadManager.isCreated()) {
        if (loadedFileUrlRef.current === mxcadFileUrl) {
          mxcadManager.showMxCAD(true);
          onLoadingChange(false);
          return;
        }

        await mxcadManager.openFile(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
        loadedFileUrlRef.current = mxcadFileUrl;
        currentFileIdRef.current = fileId;
        onLoadingChange(false);
        return;
      }

      // Check if MxCAD was created by another component
      if (mxcadManager.isCreated()) {
        isInitializedRef.current = true;
        loadedFileUrlRef.current = mxcadFileUrl;
        currentFileIdRef.current = fileId;
        mxcadManager.showMxCAD(true);
        onLoadingChange(false);
        return;
      }

      // First-time initialization
      const loadMxCADDependencies = async () => {
        // @ts-expect-error - mxcad-app has no type definitions
        await import('mxcad-app/style');
        return { mxcadManager };
      };

      await loadMxCADDependencies();

      const { mxcadApp } = await import('mxcad-app');
      const configUrl = window.location.origin;
      mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
      mxcadApp.initConfig({
        uiConfig: `${configUrl}/ini/myUiConfig.json`,
        sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
        serverConfig: `${configUrl}/ini/myServerConfig.json`,
        quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
        themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
      });

      const serverConfig = await (
        window as unknown as {
          MxPluginContext: {
            getServerConfig: () => {
              uploadFileConfig?: {
                create?: { formData?: Record<string, string> };
              };
            };
          };
        }
      ).MxPluginContext.getServerConfig();

      if (serverConfig?.uploadFileConfig?.create) {
        let nodeId = file.parentId || '';
        if (!nodeId) {
          nodeId =
            searchParams.get('nodeId') ||
            searchParams.get('parent') ||
            '';
        }
        serverConfig.uploadFileConfig.create.formData = {
          ...serverConfig.uploadFileConfig.create.formData,
          nodeId,
        };
      }

      await mxcadManager.initializeMxCADView(mxcadFileUrl);
      mxcadManager.showMxCAD(true);

      isInitializedRef.current = true;
      loadedFileUrlRef.current = mxcadFileUrl;
      currentFileIdRef.current = fileId;

      onLoadingChange(false);

      // Check external references
      try {
        if (isAuthenticated && fileId && !libraryKeyParam) {
          await onCheckMissingReferences(fileId, false, false);
        } else if (!isAuthenticated && file.fileHash) {
          onCurrentFileHashChange(file.fileHash);
          await onCheckMissingReferences(file.fileHash, false, false);
        }
      } catch (error: unknown) {
        handleError(error, 'CADEditorDirect:checkMissingReferences');
      }
    } catch (error: unknown) {
      handleError(error, 'CADEditorDirect:loadFile');
      onErrorChange('CAD编辑器初始化失败');
      onLoadingChange(false);
    }
  }, [
    fileId,
    isActive,
    isAuthenticated,
    libraryKeyParam,
    versionParam,
    personalSpaceId,
    searchParams,
    hasPermission,
    navigate,
    getFileUrl,
    onLoadingChange,
    onErrorChange,
    onCurrentProjectIdChange,
    onCurrentFileHashChange,
    onCheckMissingReferences,
  ]);

  // Load file when fileId changes
  useEffect(() => {
    loadFile();
  }, [loadFile]);

  return {
    isInitializedRef,
    loadedFileUrlRef,
    currentFileIdRef,
  };
}
