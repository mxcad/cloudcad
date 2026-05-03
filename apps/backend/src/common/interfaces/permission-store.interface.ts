///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { SystemPermission, ProjectPermission } from '../enums/permissions.enum';

export const IPERMISSION_STORE = Symbol('IPermissionStore');

export interface IPermissionStore {
  getUserSystemPermissions(userId: string): Promise<SystemPermission[]>;

  checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;

  getUserProjectPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;

  checkProjectPermission(
    userId: string,
    projectId: string,
    permission: ProjectPermission
  ): Promise<boolean>;

  getUserProjectRole(userId: string, projectId: string): Promise<string | null>;

  isProjectOwner(userId: string, projectId: string): Promise<boolean>;

  clearUserCache(userId: string): Promise<void>;

  clearProjectCache(projectId: string): Promise<void>;
}
