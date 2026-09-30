///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { create } from 'zustand';

export interface UIState {
  // Global loading state（引用计数是本域唯一不变式：
  // globalLoading === true ⟺ loadingRefCount > 0，计数由 show/hide 内部维护，
  // 不再暴露裸 set 让调用方绕过计数把全屏 loading 卡死）
  globalLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  loadingRefCount: number;
  /** 最近一次 show 的来源标识（如 autoJoin/handleJoin），归零时清空；
   *  CADEditorDirect 的 OPEN_COMPLETE 兜底 hide 据此避开协同流程自管的 loading */
  loadingSource: string | null;
  /** 进入全局 loading（引用计数 +1） */
  showGlobalLoading: (message?: string, source?: string) => void;
  /** 退出一层全局 loading（引用计数 -1，归零才真正隐藏；0 时为无害 no-op） */
  hideGlobalLoading: () => void;
  /** 强制清零（登出等全局复位场景） */
  resetLoading: () => void;
  setLoadingMessage: (message: string) => void;
  setLoadingProgress: (progress: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  globalLoading: false,
  loadingMessage: '',
  loadingProgress: 0,
  loadingRefCount: 0,
  loadingSource: null,
  showGlobalLoading: (message = '', source?: string) =>
    set((state) => ({
      globalLoading: true,
      loadingRefCount: state.loadingRefCount + 1,
      loadingMessage: message,
      loadingProgress: 0,
      loadingSource: source || 'unknown',
    })),
  hideGlobalLoading: () =>
    set((state) => {
      if (state.loadingRefCount <= 0) return state;
      const loadingRefCount = state.loadingRefCount - 1;
      return loadingRefCount === 0
        ? {
            globalLoading: false,
            loadingMessage: '',
            loadingProgress: 0,
            loadingRefCount,
            loadingSource: null,
          }
        : { loadingRefCount };
    }),
  resetLoading: () =>
    set({
      globalLoading: false,
      loadingMessage: '',
      loadingProgress: 0,
      loadingRefCount: 0,
      loadingSource: null,
    }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
}));
