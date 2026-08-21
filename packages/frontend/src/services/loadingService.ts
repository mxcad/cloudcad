import { useUIStore } from '../stores/uiStore';

let loadingRefCount = 0;
let loadingSource: string | null = null;

export const showGlobalLoading = (message?: string, source?: string): void => {
  loadingRefCount++;
  loadingSource = source || 'unknown';
  useUIStore.setState({
    globalLoading: true,
    loadingMessage: message || '',
    loadingProgress: 0,
  });
};

export const hideGlobalLoading = (source?: string): void => {
  if (loadingRefCount <= 0) {
    // hide 幂等：全局 loading 为引用计数模型，监听器兜底与调用方显式 hide 可能同时触发。
    // 且 openFile 在"文件已打开"等路径不会触发 openFileComplete 事件（此时只有调用方 hide），
    // 因此不能只依赖单一来源。refCount 为 0 时 hide 是无害的 no-op，仅记录调试信息。
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(
        `[Loading] hide called but refCount already 0, source:${source || 'unknown'}`
      );
    }
    return;
  }
  loadingRefCount--;
  if (loadingRefCount === 0) {
    loadingSource = null;
    useUIStore.setState({
      globalLoading: false,
      loadingMessage: '',
      loadingProgress: 0,
    });
  }
};

export const setLoadingMessage = (message: string): void => {
  useUIStore.setState({ loadingMessage: message });
};

export const setLoadingProgress = (progress: number): void => {
  useUIStore.setState({ loadingProgress: progress });
};

export const resetLoading = (source?: string): void => {
  loadingRefCount = 0;
  loadingSource = null;
  useUIStore.setState({
    globalLoading: false,
    loadingMessage: '',
    loadingProgress: 0,
  });
};

export const getLoadingState = () => {
  const store = useUIStore.getState();
  return {
    globalLoading: store.globalLoading,
    loadingMessage: store.loadingMessage,
    loadingProgress: store.loadingProgress,
    refCount: loadingRefCount,
    source: loadingSource,
  };
};
