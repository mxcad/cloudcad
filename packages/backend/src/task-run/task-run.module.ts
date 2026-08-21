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
import { DatabaseModule } from '../database/database.module';
import { PermissionModule } from '../permission/permission.module';
import { AlertModule } from '../alert/alert.module';
import { TaskRunService } from './task-run.service';
import { TaskRunController } from './task-run.controller';

@Module({
  imports: [DatabaseModule, PermissionModule, AlertModule],
  controllers: [TaskRunController],
  providers: [TaskRunService],
  exports: [TaskRunService],
})
export class TaskRunModule {}
