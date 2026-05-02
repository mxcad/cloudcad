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

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface UIState {
  // Toast notifications
  toasts: Toast[];
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;

  // Modal state
  activeModal: string | null;
  openModal: (modalId: string) => void;
  closeModal: () => void;

  // Global loading state
  globalLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  setLoadingMessage: (message: string) => void;
  setLoadingProgress: (progress: number) => void;
  resetLoading: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  activeModal: null,
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),

  globalLoading: false,
  loadingMessage: '',
  loadingProgress: 0,
  setGlobalLoading: (loading, message = '') =>
    set({ globalLoading: loading, loadingMessage: message, loadingProgress: loading ? 0 : 0 }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  resetLoading: () => set({ globalLoading: false, loadingMessage: '', loadingProgress: 0 }),
}));
