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

// API 服务
export { authApi } from './authApi';
export { usersApi } from './usersApi';
export type { ProjectFilterType } from './projectApi';
export { trashApi } from './trashApi';
export { filesApi } from './filesApi';
export { fontsApi } from './fontsApi';
export { rolesApi } from './rolesApi';
export { mxcadApi } from './mxcadApi';
export { versionControlApi } from './versionControlApi';
export { auditApi } from './auditApi';
export { cacheApi } from './cacheApi';
export { publicFileApi } from './publicFileApi';

// 新的模块化项目 API（重构后推荐使用）
export { projectApi } from './projectApi';
export { nodeApi } from './nodeApi';
export { projectMemberApi } from './projectMemberApi';
export { projectPermissionApi } from './projectPermissionApi';
export { projectTrashApi } from './projectTrashApi';
export { searchApi } from './searchApi';
export { mxcadPermissionApi } from './mxcadPermissionApi';
export { mxcadSaveApi } from './mxcadSaveApi';
