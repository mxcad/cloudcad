///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';

const API = '/api/fonts';

function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`${API}${path}`, data);
}

function get<T>(path: string, params?: Record<string, unknown>) {
  return getApiClient().get<T>(`${API}${path}`, { params });
}

function del<T>(path: string) {
  return getApiClient().delete<T>(`${API}${path}`);
}

/**
 * 字体 API — 来源：apps/frontend/src/services/index.ts (fontsApi)
 */
export const fontsApi = {
  /** 获取字体列表 — 来源：fontsApi.getFonts */
  getFonts: (tab: 'backend' | 'frontend') =>
    get<FontInfo[]>('/', { tab }),

  /** 删除字体 — 来源：fontsApi.deleteFont */
  deleteFont: (name: string, tab: 'backend' | 'frontend') =>
    del<void>(`/${encodeURIComponent(name)}?tab=${tab}`),

  /** 下载字体 — 来源：fontsApi.downloadFont */
  downloadFont: (name: string, tab: 'backend' | 'frontend') =>
    getApiClient().get(`${API}/${encodeURIComponent(name)}/download`, {
      params: { tab },
      responseType: 'blob',
    }),

  /** 上传字体 — 来源：fontsApi.uploadFont */
  uploadFont: (file: File, target: 'backend' | 'frontend' | 'both') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', target);
    return post<void>('/upload', formData);
  },
};

/** 来源：apps/frontend/src/types/filesystem.ts FontInfo */
export interface FontInfo {
  name: string;
  extension: string;
  size: number;
  createdAt: string;
  updatedAt?: string;
  creator?: string;
}
