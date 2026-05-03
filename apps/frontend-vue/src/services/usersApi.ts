///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';

function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`/api/users${path}`, data);
}

function get<T>(path: string, params?: Record<string, unknown>) {
  return getApiClient().get<T>(`/api/users${path}`, { params });
}

function patch<T>(path: string, data?: unknown) {
  return getApiClient().patch<T>(`/api/users${path}`, data);
}

function del<T>(path: string, data?: unknown) {
  return getApiClient().delete<T>(`/api/users${path}`, data);
}

export interface UserResponseDto {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED';
  role?: {
    id: string;
    name: string;
    isSystem: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserDto {
  username: string;
  email?: string;
  phone?: string;
  password: string;
  roleId: string;
  nickname?: string;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  nickname?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  password?: string;
}

export interface ListUsersParams {
  search?: string;
  roleId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ListUsersResponse {
  users: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 用户 API — 来源：apps/frontend/src/services/usersApi.ts
 */
export const usersApi = {
  list: (params?: ListUsersParams) =>
    get<ListUsersResponse>('/list', params),

  create: (data: CreateUserDto) =>
    post<UserResponseDto>('', data),

  update: (id: string, data: UpdateUserDto) =>
    patch<UserResponseDto>(`/${id}`, data),

  delete: (id: string) =>
    del<void>(`/${id}`),

  deleteImmediately: (id: string) =>
    del<void>(`/${id}/immediately`),

  restore: (id: string) =>
    post<void>(`/${id}/restore`),

  getProfile: () =>
    get<UserResponseDto>('/profile'),

  updateProfile: (data: { username?: string; nickname?: string }) =>
    post<void>('/profile', data),

  changePassword: (data: { oldPassword?: string; newPassword: string }) =>
    post<void>('/change-password', data),

  deactivateAccount: (data: {
    password?: string;
    phoneCode?: string;
    emailCode?: string;
    wechatConfirm?: string;
  }) =>
    post<void>('/deactivate', data),

  search: (params?: { keyword?: string; roleId?: string; status?: string; page?: number; limit?: number }) =>
    get<{ users: UserResponseDto[]; total: number; page: number; limit: number }>('/search', params),

  searchByEmail: (email: string) =>
    get<{ user?: UserResponseDto }>('/search-by-email', { email }),

  getWechatDeactivateQr: () =>
    get<{ token: string; qrUrl: string }>('/me/deactivate/wechat-qr'),

  getDashboardStats: () =>
    get<UserDashboardStatsDto>('/dashboard-stats'),
};

/**
 * 用户仪表盘统计 — 来源：apps/frontend/src/services/usersApi.ts
 */
export interface UserDashboardStatsDto {
  projectCount: number;
  totalFiles: number;
  todayUploads: number;
  storage: {
    used: number;
    total: number;
    usagePercent: number;
  };
  fileTypeStats: {
    dwg: number;
    dxf: number;
    other: number;
  };
}

export const dashboardApi = {
  getStats: () =>
    get<UserDashboardStatsDto>('/dashboard-stats'),
};
