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
// @deprecated Use @/api-sdk directly instead.

import type {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  DeactivateAccountDto,
} from '../types/api-client';
import { client } from '@/api-sdk/client.gen';
import {
  usersControllerFindAll,
  usersControllerSearchUsers,
  usersControllerSearchByEmail,
  usersControllerCreate,
  usersControllerUpdate,
  usersControllerRemove,
  usersControllerDeleteImmediately,
  usersControllerRestore,
  usersControllerRestoreAccount,
  usersControllerGetProfile,
  usersControllerUpdateProfile,
  usersControllerChangePassword,
  usersControllerGetDashboardStats,
  usersControllerDeactivateAccount,
} from '@/api-sdk';

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    usersControllerFindAll(params ? { query: params } : undefined).then(
      (r) => r.data
    ),

  search: (params?: Record<string, unknown>) =>
    usersControllerSearchUsers(params ? { query: params } : undefined).then(
      (r) => r.data
    ),

  searchByEmail: (email: string) =>
    usersControllerSearchByEmail({ query: { email } }).then((r) => r.data),

  create: (data: CreateUserDto) =>
    usersControllerCreate({ body: data }).then((r) => r.data),

  update: (id: string, data: UpdateUserDto) =>
    usersControllerUpdate({ path: { id }, body: data }).then((r) => r.data),

  delete: (id: string) =>
    usersControllerRemove({ path: { id } }).then((r) => r.data),

  deleteImmediately: (id: string) =>
    usersControllerDeleteImmediately({ path: { id } }).then((r) => r.data),

  restore: (id: string) =>
    usersControllerRestore({ path: { id } }).then((r) => r.data),

  restoreAccount: (data: { token: string }) =>
    usersControllerRestoreAccount({ body: data }).then((r) => r.data),

  getProfile: () =>
    usersControllerGetProfile().then((r) => r.data),

  updateProfile: (data: UpdateUserDto) =>
    usersControllerUpdateProfile({ body: data }).then((r) => r.data),

  changePassword: (data: ChangePasswordDto) =>
    usersControllerChangePassword({ body: data }).then((r) => r.data),

  getDashboardStats: () =>
    usersControllerGetDashboardStats().then((r) => r.data),

  deactivateAccount: (data: DeactivateAccountDto) =>
    usersControllerDeactivateAccount({ body: data }).then((r) => r.data),

  getWechatDeactivateQr: () =>
    client.get<{ token: string; qrUrl: string }>(
      '/users/me/deactivate/wechat-qr',
      {
        headers: { 'Content-Type': 'application/json' },
      }
    ),
};
