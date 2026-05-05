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
// @deprecated Use @/api-sdk instead.

import { getApiClient } from './apiClient';
import type {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  DeactivateAccountDto,
  OperationMethods,
} from '../types/api-client';

export const usersApi = {
  list: (params?: Parameters<OperationMethods['UsersController_findAll']>[0]) =>
    getApiClient().UsersController_findAll(params || undefined),

  search: (
    params?: Parameters<OperationMethods['UsersController_searchUsers']>[0]
  ) => getApiClient().UsersController_searchUsers(params || undefined),

  searchByEmail: (email: string) =>
    getApiClient().UsersController_searchByEmail({ email }),

  create: (data: CreateUserDto) =>
    getApiClient().UsersController_create(null, data),

  update: (id: string, data: UpdateUserDto) =>
    getApiClient().UsersController_update({ id }, data),

  delete: (id: string) => getApiClient().UsersController_remove({ id }),

  deleteImmediately: (id: string) => getApiClient().UsersController_deleteImmediately({ id }),

  restore: (id: string) => getApiClient().UsersController_restore({ id }),
  restoreAccount: (data: { token: string }) => getApiClient().UsersController_restoreAccount(null, data as any),

  getProfile: () => getApiClient().UsersController_getProfile(),

  updateProfile: (data: UpdateUserDto) =>
    getApiClient().UsersController_updateProfile(null, data),

  changePassword: (data: ChangePasswordDto) =>
    getApiClient().UsersController_changePassword(null, data),

  getDashboardStats: () => getApiClient().UsersController_getDashboardStats(),

  deactivateAccount: (data: DeactivateAccountDto) =>
    getApiClient().UsersController_deactivateAccount(null, data),

  getWechatDeactivateQr: () =>
    getApiClient().get<{ token: string; qrUrl: string }>(
      '/users/me/deactivate/wechat-qr',
      {
        headers: { 'Content-Type': 'application/json' },
      }
    ),
};
