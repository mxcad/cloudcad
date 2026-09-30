import { useUIStore } from '../stores/uiStore';

/**
 * 全局 loading 的命名门面（非 React 调用方的消费形态）。
 * 引用计数不变式实现在 uiStore 内部（globalLoading === true ⟺ refCount > 0），
 * 这里不再持有任何镜像状态。
 */

export const showGlobalLoading = (message?: string, source?: string): void => {
  useUIStore.getState().showGlobalLoading(message, source);
};

export const hideGlobalLoading = (_source?: string): void => {
  const { loadingRefCount, hideGlobalLoading: hide } =
    useUIStore.getState();
  if (loadingRefCount <= 0 && import.meta.env?.DEV) {
    // hide 幂等：refCount 为 0 时 hide 是无害 no-op，仅记录调试信息
    // eslint-disable-next-line no-console
    console.debug('[Loading] hide called but refCount already 0');
  }
  hide();
};

export const setLoadingMessage = (message: string): void => {
  useUIStore.getState().setLoadingMessage(message);
};

export const setLoadingProgress = (progress: number): void => {
  useUIStore.getState().setLoadingProgress(progress);
};

export const resetLoading = (): void => {
  useUIStore.getState().resetLoading();
};

export const getLoadingState = () => {
  const store = useUIStore.getState();
  return {
    globalLoading: store.globalLoading,
    loadingMessage: store.loadingMessage,
    loadingProgress: store.loadingProgress,
    refCount: store.loadingRefCount,
    source: store.loadingSource,
  };
};
