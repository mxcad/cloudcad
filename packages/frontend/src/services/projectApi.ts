// @ts-nocheck
// @deprecated Use @/api-sdk instead.
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

import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetTrash,
  fileSystemControllerCreateProject,
  fileSystemControllerGetProject,
  fileSystemControllerUpdateProject,
  fileSystemControllerDeleteNode,
  fileSystemControllerRestoreTrashItems,
  fileSystemControllerGetStorageQuota,
  fileSystemControllerUpdateStorageQuota,
  fileSystemControllerGetPersonalSpace,
} from '@/api-sdk';
import type { CreateProjectDto } from '@/api-sdk/types.gen';

export type ProjectFilterType = 'all' | 'owned' | 'joined';

export const projectApi = {
  list: (
    filter?: ProjectFilterType,
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    fileSystemControllerGetProjects(
      {
        query: {
          filter: filter || undefined,
          page: params?.page,
          limit: params?.limit,
        },
      },
      config
    ),

  getDeleted: (
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    fileSystemControllerGetTrash(
      {
        query: {
          page: params?.page,
          limit: params?.limit,
        },
      },
      config
    ),

  create: (data: CreateProjectDto) =>
    fileSystemControllerCreateProject({ body: data }),

  get: (projectId: string) =>
    fileSystemControllerGetProject({ path: { projectId } }),

  update: (projectId: string, data: CreateProjectDto) =>
    fileSystemControllerUpdateProject({ path: { projectId }, body: data }),

  delete: (projectId: string, permanently: boolean = false) =>
    fileSystemControllerDeleteNode({
      path: { nodeId: projectId },
      query: { permanently },
    }),

  restore: (projectId: string) =>
    fileSystemControllerRestoreTrashItems({ query: { itemIds: [projectId] } }),

  getStorageInfo: () =>
    fileSystemControllerGetStorageQuota(),

  getQuota: (nodeId?: string) =>
    fileSystemControllerGetStorageQuota(
      nodeId ? { query: { nodeId } } : undefined
    ),

  updateStorageQuota: (nodeId: string, quota: number) =>
    fileSystemControllerUpdateStorageQuota({ body: { nodeId, quota } }),

  getPersonalSpace: () =>
    fileSystemControllerGetPersonalSpace(),

  getUserPersonalSpace: (_userId: string) =>
    Promise.reject(new Error('getUserPersonalSpace not available in SDK — backend endpoint does not exist')),
};