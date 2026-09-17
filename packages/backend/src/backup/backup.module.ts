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
/////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AlertModule } from '../alert/alert.module';
import { TaskRunModule } from '../task-run/task-run.module';
import { PermissionModule } from '../permission/permission.module';
import { MetricsModule } from '../metrics/metrics.module';
import { BackupController } from './backup.controller';
import { BackupScheduler } from './backup.scheduler';
import { BackupService } from './backup.service';

/**
 * 数据库备份模块（#318）：每日全量 pg_dump + 本地轮转 + 管理端点
 */
@Module({
  // MetricsModule：轮转清理 cleanup_* 指标埋点（#325）
  imports: [
    CommonModule,
    AlertModule,
    TaskRunModule,
    PermissionModule,
    MetricsModule,
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupScheduler],
  exports: [BackupService],
})
export class BackupModule {}
