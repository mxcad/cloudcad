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

export const projectRolesApi = {
  list: () => getApiClient().RolesController_getAllProjectRoles(),

  getSystemRoles: () => getApiClient().RolesController_getSystemProjectRoles(),

  getByProject: (projectId: string) =>
    getApiClient().RolesController_getProjectRolesByProject({ projectId }),

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
