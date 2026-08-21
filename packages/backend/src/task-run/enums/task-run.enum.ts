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

/**
 * 后台任务执行记录本地枚举副本
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * Prisma 枚举不可直接 @ApiProperty，DTO 使用本地枚举显式转换
 */

export enum TaskRunStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum TaskRunTrigger {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}
