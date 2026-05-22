import { ref, readonly } from 'vue';
import { getNodeInfo, buildMxwebUrl } from '../services/fileService';
import { useEditorState } from './useEditorState';
import { openMxWeb } from '../plugins/mxcad/openMxWeb';

const loading = ref(false);
const error = ref<string | null>(null);
const progress = ref('');

export function useFileLoader() {
  const editorState = useEditorState();

  /**
   * Read fileId or nodeId from URL query params.
   */
  function getFileIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('fileId') || params.get('nodeId') || null;
  }

  /**
   * Load a file by its node ID from the server.
   */
  async function loadByNodeId(nodeId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    progress.value = '正在获取文件信息...';

    editorState.setFileId(nodeId);
    editorState.setLoading(true);

    try {
      progress.value = '正在加载图纸...';
      const nodeInfo = await getNodeInfo(nodeId);

      editorState.setFileInfo(nodeInfo as unknown as Record<string, unknown>);
      editorState.setFileName(nodeInfo.name);
      editorState.setProjectId(nodeInfo.parentId || null);

      if (!nodeInfo.path) {
        throw new Error('文件路径不存在');
      }

      const mxwebUrl = buildMxwebUrl(nodeInfo.path);
      progress.value = '正在打开图纸...';

      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
        return true;
      } else {
        throw new Error('打开文件失败');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '未知错误';
      error.value = message;
      editorState.setError(message);
      editorState.setLoading(false);
      loading.value = false;
      return false;
    }
  }

  /**
   * Try to load file from URL params. Returns true if a fileId was found and loading started.
   */
  function loadFromUrl(): boolean {
    const fileId = getFileIdFromUrl();
    if (!fileId) return false;

    return true;
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    progress: readonly(progress),
    loadByNodeId,
    loadFromUrl,
    getFileIdFromUrl,
  };
}
