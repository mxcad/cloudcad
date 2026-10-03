import { ref, readonly } from 'vue';
import { versionControlControllerGetFileHistory } from '../api-sdk';
import { useEditorState } from './useEditorState';
import { openDrawing } from '../services/drawingOpener';
import type { DrawingOpenRequest } from '../services/drawingOpener';
import { warmupHistoricalVersion } from '../services/versionWarmup';
import { showToast } from 'vant';
import { t } from '@/languages';

export interface VersionEntry {
  revision: number;
  author: string;
  date: string;
  message: string;
  userName?: string;
}

/** 显式版本历史目标（列表内入口：文件未打开编辑器，直接传节点的 projectId+path） */
export interface VersionHistoryTarget {
  projectId: string;
  filePath: string;
}

const loading = ref(false);
const entries = ref<VersionEntry[]>([]);
const totalCount = ref(0);
const error = ref<string | null>(null);

export function useVersionHistory() {
  const editorState = useEditorState();

  async function loadHistory(target?: VersionHistoryTarget): Promise<void> {
    let projectId: string;
    let filePath: string;

    if (target) {
      projectId = target.projectId;
      filePath = target.filePath;
    } else {
      const state = editorState.state;
      const fileInfo = state.fileInfo as Record<string, unknown> | null;

      projectId = state.projectId || (fileInfo?.parentId as string) || '';
      filePath = (fileInfo?.path as string) || '';
    }

    if (!projectId || !filePath) {
      error.value = t('缺少项目信息或文件路径');
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const result = await versionControlControllerGetFileHistory({
        query: {
          projectId,
          filePath,
          limit: 50,
        },
      });

      if (result.error) {
        throw result.error;
      }

      const data = result.data as { success: boolean; message?: string; entries?: VersionEntry[]; totalCount?: number } | undefined;

      if (data?.success) {
        entries.value = data.entries || [];
        totalCount.value = data.totalCount ?? data.entries?.length ?? 0;
      } else {
        error.value = data?.message || t('加载版本历史失败');
        entries.value = [];
        totalCount.value = 0;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('加载版本历史失败');
      error.value = msg;
      entries.value = [];
      totalCount.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 由当前编辑器状态还原 openDrawing 请求，保留分享/资源库来源语义 */
  function buildCurrentFileRequest(): DrawingOpenRequest | null {
    const fileId = editorState.state.fileId;
    if (!fileId) return null;

    // 分享链接的来源标记只在 URL 上（editorState 不存 shareToken）
    const shareToken = new URLSearchParams(window.location.search).get('shareToken');
    if (shareToken) return { source: 'share', token: shareToken, nodeId: fileId };

    const libraryKey = editorState.state.libraryKey;
    if (libraryKey) return { source: 'library', libraryKey, nodeId: fileId };

    return { source: 'node', nodeId: fileId };
  }

  /**
   * 打开历史版本：更新 hash 之前的 ?v= 后原地重载文件，不整站刷新。
   *
   * useFileLoader 从 window.location.search 读版本号（hash 路由下 # 之后不参与），
   * 所以用 replaceState 原地改 search，与 stores/editor.ts 的 resetNewFile 同口径；
   * 原实现走 window.location.href 会销毁并重建 WebGL 引擎实例。
   */
  async function openHistoricalVersion(revision: number): Promise<boolean> {
    const request = buildCurrentFileRequest();
    if (!request) {
      showToast(t('无法打开历史版本：缺少文件ID'));
      return false;
    }

    // H3：先预热（对齐 PC）——冷路径「分片下载 + bin→mxweb 转换」可能耗时数十秒，
    // 直接打开会被编辑器 60s 打开超时拖爆。弹窗「准备中」态覆盖等待；失败置 error 由弹窗展示。
    const fileInfo = editorState.state.fileInfo as Record<string, unknown> | null;
    const filePath = (fileInfo?.path as string) || '';
    if (filePath) {
      try {
        await warmupHistoricalVersion(filePath, revision);
      } catch (e) {
        error.value = e instanceof Error ? e.message : t('历史版本文件准备失败，请重试');
        return false;
      }
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('v', String(revision));
    window.history.replaceState(history.state, '', currentUrl.toString());

    try {
      return await openDrawing(request);
    } catch {
      return false;
    }
  }

  function reset() {
    entries.value = [];
    totalCount.value = 0;
    error.value = null;
    loading.value = false;
  }

  return {
    loading: readonly(loading),
    entries: readonly(entries),
    totalCount: readonly(totalCount),
    error: readonly(error),
    loadHistory,
    openHistoricalVersion,
    reset,
  };
}
