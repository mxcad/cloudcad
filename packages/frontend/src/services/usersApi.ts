///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import type {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
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

  getProfile: () => getApiClient().UsersController_getProfile(),

  updateProfile: (data: UpdateUserDto) =>
    getApiClient().UsersController_updateProfile(null, data),

  changePassword: (data: ChangePasswordDto) =>
    getApiClient().UsersController_changePassword(null, data),

  getDashboardStats: () => getApiClient().UsersController_getDashboardStats(),
};
