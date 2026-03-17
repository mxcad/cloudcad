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
import type { CreateRoleDto, UpdateRoleDto } from '../types/api-client';

// 系统角色 API
export const rolesApi = {
  list: () => getApiClient().RolesController_findAll(),

  get: (id: string) => getApiClient().RolesController_findOne({ id }),

  create: (data: CreateRoleDto) =>
    getApiClient().RolesController_create(null, data),

  update: (id: string, data: UpdateRoleDto) =>
    getApiClient().RolesController_update({ id }, data),

  delete: (id: string) => getApiClient().RolesController_remove({ id }),

  getPermissions: (id: string) =>
    getApiClient().RolesController_getRolePermissions({ id }),

  addPermissions: (id: string, permissions: string[]) =>
    getApiClient().RolesController_addPermissions({ id }, { permissions }),

  removePermissions: (id: string, permissions: string[]) =>
    getApiClient().RolesController_removePermissions({ id }, { permissions }),
};

// 项目角色 API
export const projectRolesApi = {
  list: () => getApiClient().RolesController_getAllProjectRoles(),

  getSystemRoles: () => getApiClient().RolesController_getSystemProjectRoles(),

  getByProject: (projectId: string) =>
    getApiClient().RolesController_getProjectRolesByProject({ projectId }),

  get: (id: string) => getApiClient().RolesController_getProjectRole({ id }),

  create: (data: {
    projectId?: string;
    name: string;
    description?: string;
    permissions: string[];
  }) => getApiClient().RolesController_createProjectRole(null, data),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    }
  ) => getApiClient().RolesController_updateProjectRole({ id }, data),

  delete: (id: string) =>
    getApiClient().RolesController_deleteProjectRole({ id }),

  getPermissions: (id: string) =>
    getApiClient().RolesController_getProjectRolePermissions({ id }),

  addPermissions: (id: string, permissions: string[]) =>
    getApiClient().RolesController_addProjectRolePermissions(
      { id },
      { permissions }
    ),

  removePermissions: (id: string, permissions: string[]) =>
    getApiClient().RolesController_removeProjectRolePermissions(
      { id },
      { permissions }
    ),
};
