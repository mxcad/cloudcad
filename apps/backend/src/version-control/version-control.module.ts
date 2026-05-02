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

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VersionControlService } from './version-control.service';
import { VersionControlController } from './version-control.controller';
import { RolesModule } from '../roles/roles.module';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { FileSystemModule } from '../file-system/file-system.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    forwardRef(() => RolesModule),
    forwardRef(() => FileSystemModule),
  ],
  controllers: [VersionControlController],
  providers: [VersionControlService],
  exports: [VersionControlService],
})
export class VersionControlModule {}
