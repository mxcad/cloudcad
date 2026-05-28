import { ref, readonly } from 'vue';
import { versionControlControllerGetFileHistory } from '../api-sdk';
import { useEditorState } from './useEditorState';
import { showToast } from 'vant';

export interface VersionEntry {
  revision: number;
  author: string;
  date: string;
  message: string;
  userName?: string;
}

const loading = ref(false);
const entries = ref<VersionEntry[]>([]);
const error = ref<string | null>(null);

export function useVersionHistory() {
  const editorState = useEditorState();

  async function loadHistory(): Promise<void> {
    const state = editorState.state;
    const fileInfo = state.fileInfo as Record<string, unknown> | null;

    const projectId = state.projectId || (fileInfo?.parentId as string) || '';
    const filePath = (fileInfo?.path as string) || '';

    if (!projectId || !filePath) {
      error.value = '缺少项目信息或文件路径';
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

      const data = result.data as { success: boolean; message?: string; entries?: VersionEntry[] } | undefined;

      if (data?.success) {
        entries.value = data.entries || [];
      } else {
        error.value = data?.message || '加载版本历史失败';
        entries.value = [];
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载版本历史失败';
      error.value = msg;
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  function openHistoricalVersion(revision: number): void {
    const fileId = editorState.state.fileId;
    if (!fileId) {
      showToast('无法打开历史版本：缺少文件ID');
      return;
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('v', String(revision));
    window.location.href = currentUrl.toString();
  }

  function reset() {
    entries.value = [];
    error.value = null;
    loading.value = false;
  }

  return {
    loading: readonly(loading),
    entries: readonly(entries),
    error: readonly(error),
    loadHistory,
    openHistoricalVersion,
    reset,
  };
}
