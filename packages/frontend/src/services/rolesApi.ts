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

import type { CreateRoleDto, UpdateRoleDto } from '@/api-sdk';
import {
  rolesControllerFindAll,
  rolesControllerFindOne,
  rolesControllerCreate,
  rolesControllerUpdate,
  rolesControllerRemove,
  rolesControllerGetRolePermissions,
  rolesControllerAddPermissions,
  rolesControllerRemovePermissions,
  rolesControllerGetAllProjectRoles,
  rolesControllerGetSystemProjectRoles,
  rolesControllerGetProjectRolesByProject,
  rolesControllerCreateProjectRole,
  rolesControllerUpdateProjectRole,
  rolesControllerDeleteProjectRole,
  rolesControllerGetProjectRolePermissions,
  rolesControllerAddProjectRolePermissions,
  rolesControllerRemoveProjectRolePermissions,
} from '@/api-sdk';

export const rolesApi = {
  list: () => rolesControllerFindAll().then((r) => r.data),

  get: (id: string) =>
    rolesControllerFindOne({ path: { id } }).then((r) => r.data),

  create: (data: CreateRoleDto) =>
    rolesControllerCreate({ body: data }).then((r) => r.data),

  update: (id: string, data: UpdateRoleDto) =>
    rolesControllerUpdate({ path: { id }, body: data }).then((r) => r.data),

  delete: (id: string) =>
    rolesControllerRemove({ path: { id } }).then((r) => r.data),

  getPermissions: (id: string) =>
    rolesControllerGetRolePermissions({ path: { id } }).then((r) => r.data),

  addPermissions: (id: string, permissions: string[]) =>
    rolesControllerAddPermissions({ path: { id }, body: { permissions } }).then(
      (r) => r.data
    ),

  removePermissions: (id: string, permissions: string[]) =>
    rolesControllerRemovePermissions({
      path: { id },
      body: { permissions },
    }).then((r) => r.data),
};

export const projectRolesApi = {
  list: () => rolesControllerGetAllProjectRoles().then((r) => r.data),

  getSystemRoles: () =>
    rolesControllerGetSystemProjectRoles().then((r) => r.data),

  getByProject: (projectId: string) =>
    rolesControllerGetProjectRolesByProject({ path: { projectId } }).then(
      (r) => r.data
    ),

  create: (data: {
    projectId?: string;
    name: string;
    description?: string;
    permissions: string[];
  }) =>
    rolesControllerCreateProjectRole({ body: data }).then((r) => r.data),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    }
  ) =>
    rolesControllerUpdateProjectRole({ path: { id }, body: data }).then(
      (r) => r.data
    ),

  delete: (id: string) =>
    rolesControllerDeleteProjectRole({ path: { id } }).then((r) => r.data),

  getPermissions: (id: string) =>
    rolesControllerGetProjectRolePermissions({ path: { id } }).then(
      (r) => r.data
    ),

  addPermissions: (id: string, permissions: string[]) =>
    rolesControllerAddProjectRolePermissions({
      path: { id },
      body: { permissions },
    }).then((r) => r.data),

  removePermissions: (id: string, permissions: string[]) =>
    rolesControllerRemoveProjectRolePermissions({
      path: { id },
      body: { permissions },
    }).then((r) => r.data),
};
