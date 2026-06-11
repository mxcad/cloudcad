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
    console.warn(`[Loading] hide called but refCount already 0, source:${source || 'unknown'}`);
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
