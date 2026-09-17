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

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common.module';
import { StorageManagementModule } from '../../storage-management/storage-management.module';
import { UserCleanupModule } from '../../user-cleanup/user-cleanup.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AlertModule } from '../../alert/alert.module';
import { CacheCleanupScheduler } from './cache-cleanup.scheduler';
import { AuditCleanupScheduler } from './audit-cleanup.scheduler';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';
import { UserCleanupScheduler } from '../../user-cleanup/user-cleanup.scheduler';
import { PermissionModule } from '../../permission/permission.module';
import { TaskRunModule } from '../../task-run/task-run.module';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  imports: [ScheduleModule.forRoot(), CommonModule, StorageManagementModule, UserCleanupModule, AuditLogModule, PermissionModule, AlertModule, TaskRunModule, MetricsModule],
  providers: [CacheCleanupScheduler, AuditCleanupScheduler, StorageCleanupScheduler, UserCleanupScheduler],
})
export class SchedulerModule {}