import { useState, useCallback, useRef } from 'react';
import {
  versionControlControllerGetFileHistory,
  mxcadFileAccessControllerGetFilesDataFile,
  MxLogEntryDto,
} from '@/api-sdk';
import { ProjectPermission } from '@/constants/permissions';
import { t } from '@/languages';
import { handleError, getErrorMessage } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';

interface UseVersionHistoryOptions {
  projectId: string | null | undefined;
  projectPermissions?: Record<string, boolean>;
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ) => void;
}

export interface UseVersionHistoryReturn {
  showVersionHistoryModal: boolean;
  setShowVersionHistoryModal: (show: boolean) => void;
  versionHistoryNode: FileSystemNode | null;
  versionHistoryEntries: MxLogEntryDto[];
  versionHistoryTotal: number;
  versionHistoryLoading: boolean;
  versionHistoryError: string | null;
  /** 正在预热的版本号（非 null 时展示等待提示，按钮 loading） */
  openingRevision: number | null;
  /** 预热失败提示（非 null 时展示错误，不打开编辑器） */
  openingVersionError: string | null;
  handleShowVersionHistory: (node: FileSystemNode) => Promise<void>;
  handleOpenHistoricalVersion: (revision: number) => Promise<void>;
  closeVersionHistory: () => void;
}

export function useVersionHistory({
  projectId,
  projectPermissions,
  showToast,
}: UseVersionHistoryOptions): UseVersionHistoryReturn {
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistoryNode, setVersionHistoryNode] =
    useState<FileSystemNode | null>(null);
  const [versionHistoryEntries, setVersionHistoryEntries] = useState<
    MxLogEntryDto[]
  >([]);
  const [versionHistoryTotal, setVersionHistoryTotal] = useState(0);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(
    null
  );
  const [openingRevision, setOpeningRevision] = useState<number | null>(null);
  const [openingVersionError, setOpeningVersionError] = useState<string | null>(
    null
  );
  /** 预热进行中标志（ref 同步防重入：连点两个版本时忽略后到的点击） */
  const openingInFlightRef = useRef(false);

  const closeVersionHistory = useCallback(() => {
    setShowVersionHistoryModal(false);
    setVersionHistoryNode(null);
    setVersionHistoryEntries([]);
    setVersionHistoryTotal(0);
    setVersionHistoryError(null);
    setOpeningRevision(null);
    setOpeningVersionError(null);
  }, []);

  const handleShowVersionHistory = useCallback(
    async (node: FileSystemNode) => {
      if (
        projectPermissions &&
        !projectPermissions[ProjectPermission.VERSION_READ]
      ) {
        showToast?.(t('您没有权限查看版本历史'), 'warning');
        return;
      }

      if (!projectId || !node.path) return;

      setVersionHistoryNode(node);
      setShowVersionHistoryModal(true);
      setVersionHistoryLoading(true);
      setVersionHistoryError(null);

      try {
        const result = await versionControlControllerGetFileHistory({
          query: { projectId, filePath: node.path, limit: 50 },
        });
        if (result.error) throw result.error;
        const data = result.data;
        if (data?.success) {
          setVersionHistoryEntries(data.entries || []);
          setVersionHistoryTotal(data.totalCount ?? data.entries?.length ?? 0);
        } else {
          setVersionHistoryError(data?.message || t('加载版本历史失败'));
        }
      } catch (error: unknown) {
        handleError(error, t('版本历史加载失败'));
        setVersionHistoryError(
          error instanceof Error ? error.message : t('加载版本历史失败')
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [projectId, projectPermissions, showToast]
  );

  const handleOpenHistoricalVersion = useCallback(
    async (revision: number) => {
      const node = versionHistoryNode;
      if (!node?.path || !node.id) return;
      if (openingInFlightRef.current) return;

      openingInFlightRef.current = true;
      setOpeningRevision(revision);
      setOpeningVersionError(null);

      try {
        // 预热：请求带 v 的版本文件（warmup=1 时后端只生成 _v<rev>.mxweb 缓存，不返回内容）。
        // 历史版本首次访问需「MX 版本库分片下载 + bin→mxweb 转换」，冷路径可能耗时数十秒，
        // 直接打开编辑器会被其 60s 打开超时拖爆（偶尔打不开的根因）；预热完成后编辑器读取缓存即快。
        const { error } = await mxcadFileAccessControllerGetFilesDataFile({
          path: { path: node.path },
          query: { v: String(revision), warmup: '1' },
          parseAs: 'arrayBuffer',
        });
        if (error) {
          // 后端错误体无 status 字段（只有 code），此前 401/404 分支恒不命中，
          // 全部落到通用文案；改用 code + 透传后端 message
          const code = (error as { code?: string }).code;
          setOpeningVersionError(
            code === 'UNAUTHORIZED'
              ? t('请登录后访问此文件')
              : code === 'NOT_FOUND'
                ? t('文件不存在或已被删除')
                : getErrorMessage(error) || t('历史版本文件准备失败，请重试')
          );
          return;
        }
      } catch (error) {
        setOpeningVersionError(
          getErrorMessage(error) || t('历史版本文件准备失败，请重试')
        );
        return;
      } finally {
        openingInFlightRef.current = false;
        setOpeningRevision(null);
      }

      const url = `/cad-editor/${node.id}?nodeId=${node.parentId}&v=${revision}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.open(url, '_blank');
    },
    [versionHistoryNode]
  );

  return {
    showVersionHistoryModal,
    setShowVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryTotal,
    versionHistoryLoading,
    versionHistoryError,
    openingRevision,
    openingVersionError,
    handleShowVersionHistory,
    handleOpenHistoricalVersion,
    closeVersionHistory,
  };
}
