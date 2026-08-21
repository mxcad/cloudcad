import { ref, readonly } from 'vue';
import { versionControlControllerGetFileHistory } from '../api-sdk';
import { useEditorState } from './useEditorState';
import { showToast } from 'vant';
import { t } from '@/languages';

export interface VersionEntry {
  revision: number;
  author: string;
  date: string;
  message: string;
  userName?: string;
}

const loading = ref(false);
const entries = ref<VersionEntry[]>([]);
const totalCount = ref(0);
const error = ref<string | null>(null);

export function useVersionHistory() {
  const editorState = useEditorState();

  async function loadHistory(): Promise<void> {
    const state = editorState.state;
    const fileInfo = state.fileInfo as Record<string, unknown> | null;

    const projectId = state.projectId || (fileInfo?.parentId as string) || '';
    const filePath = (fileInfo?.path as string) || '';

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

  function openHistoricalVersion(revision: number): void {
    const fileId = editorState.state.fileId;
    if (!fileId) {
      showToast(t('无法打开历史版本：缺少文件ID'));
      return;
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('v', String(revision));
    window.location.href = currentUrl.toString();
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
