import { useState, useCallback, useRef } from 'react';
import {
  versionControlControllerGetFileHistory,
  mxcadFileAccessControllerGetFilesDataFile,
  MxLogEntryDto,
} from '@/api-sdk';
import { ProjectPermission } from '@/constants/permissions';
import { t } from '@/languages';
import { handleError, getErrorMessage } from '@/utils/errorHandler';
import { getCadEditorBackUrl } from '@/utils/cadEditorRoute';
import type { FileSystemNode } from '@/types/filesystem';

/** 历史版本预热轮询间隔 */
const HISTORY_WARMUP_POLL_INTERVAL_MS = 2000;
/**
 * 历史版本预热等待上限（6 分钟）：需覆盖后端单次转换的等待上限
 * （conversion-service `CONVERSION_SERVICE_POLL_TIMEOUT` 默认 300s）再加裕量，
 * 否则后端仍在转换时前端已放弃。
 */
const HISTORY_WARMUP_POLL_TIMEOUT_MS = 360_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /** 预热轮询令牌（单调递增）：关闭弹窗时递增，使在途轮询自行退出 */
  const warmupPollSeqRef = useRef(0);
  /** 在途轮询的令牌（0 = 空闲）：防重入 + 判断本循环是否仍为当前轮询 */
  const inFlightPollSeqRef = useRef(0);

  const closeVersionHistory = useCallback(() => {
    // 使在途预热轮询失效：否则转换完成后仍会打开编辑器
    warmupPollSeqRef.current += 1;
    inFlightPollSeqRef.current = 0;
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
      // 已有预热在途：忽略后到的点击（连点两个版本时只保留先到的）
      if (inFlightPollSeqRef.current !== 0) return;

      // 轮询令牌：本次预热专属；关闭弹窗会使旧轮询自行退出
      const pollSeq = ++warmupPollSeqRef.current;
      inFlightPollSeqRef.current = pollSeq;

      setOpeningRevision(revision);
      setOpeningVersionError(null);

      const warmupUrl = {
        path: { path: node.path },
        query: { v: String(revision), warmup: '1' },
        parseAs: 'arrayBuffer' as const,
      };
      const fail = (message: string) => {
        if (inFlightPollSeqRef.current === pollSeq)
          setOpeningVersionError(message);
      };

      try {
        // 预热：请求带 v 的版本文件（warmup=1 时后端只生成 _v<rev>.mxweb 缓存，不返回内容）。
        // 历史版本首次访问需「MX 版本库分片下载 + bin→mxweb 转换」，冷路径可能耗时数十秒，
        // 直接打开编辑器会被其 60s 打开超时拖爆（偶尔打不开的根因）；预热完成后编辑器读取缓存即快。
        //
        // 后端转换是异步的：首次请求只「发起」转换并返回 202（PROCESSING），完成后返回 204。
        // 这里轮询直到 204，绝不提前打开编辑器（conversion-service 模式下转换在远端进程执行，
        // 单次请求等待会撞上 nginx proxy_read_timeout 被断连）。
        const startedAt = Date.now();
        while (inFlightPollSeqRef.current === pollSeq) {
          if (Date.now() - startedAt > HISTORY_WARMUP_POLL_TIMEOUT_MS) {
            fail(t('历史版本文件准备超时，请稍后重试'));
            return;
          }

          let result;
          try {
            result = await mxcadFileAccessControllerGetFilesDataFile(warmupUrl);
          } catch (error) {
            fail(getErrorMessage(error) || t('历史版本文件准备失败，请重试'));
            return;
          }

          if (result.error) {
            // 后端错误体无 status 字段（只有 code），此前 401/404 分支恒不命中，
            // 全部落到通用文案；改用 code + 透传后端 message
            const code = (result.error as { code?: string }).code;
            fail(
              code === 'UNAUTHORIZED'
                ? t('请登录后访问此文件')
                : code === 'NOT_FOUND'
                  ? t('文件不存在或已被删除')
                  : getErrorMessage(result.error) ||
                    t('历史版本文件准备失败，请重试')
            );
            return;
          }

          const status = result.response?.status;
          if (status !== 202) {
            // 204（缓存已生成）或其他 2xx（已完成并直接返回内容）：转换彻底完成
            break;
          }

          await sleep(HISTORY_WARMUP_POLL_INTERVAL_MS);
        }
      } finally {
        if (inFlightPollSeqRef.current === pollSeq) {
          inFlightPollSeqRef.current = 0;
          setOpeningRevision(null);
        }
      }

      // 轮询令牌已被 closeVersionHistory 递增（弹窗已关闭）：不再打开编辑器。
      // 注意必须比对单调递增的 warmupPollSeqRef —— inFlightPollSeqRef 在 finally 中已清零。
      if (warmupPollSeqRef.current !== pollSeq) return;

      const back = getCadEditorBackUrl();
      const url = `/cad-editor/${node.id}?nodeId=${node.parentId}&v=${revision}${back ? `&back=${encodeURIComponent(back)}` : ''}`;
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
