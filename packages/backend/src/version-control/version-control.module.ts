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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VersionControlController } from './version-control.controller';
import { MxVersionControlProvider } from './providers/mx-version-control.provider';
import { HttpVersionControlProvider } from './providers/http-version-control.provider';
import { VERSION_CONTROL_TOKEN } from './interfaces/version-control.interface';
import { RolesModule } from '../roles/roles.module';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { FileTreeModule } from '../file-system/file-tree/file-tree.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    RolesModule,
    PermissionModule,
    FileTreeModule,
  ],
  controllers: [VersionControlController],
  providers: [
    MxVersionControlProvider,
    HttpVersionControlProvider,
    {
      provide: VERSION_CONTROL_TOKEN,
      useFactory: (
        configService: ConfigService,
        mx: MxVersionControlProvider,
        http: HttpVersionControlProvider,
      ) => {
        const mode = configService.get<string>('STORAGE_MODE') || 'embedded';
        return mode === 'standalone' ? http : mx;
      },
      inject: [ConfigService, MxVersionControlProvider, HttpVersionControlProvider],
    },
  ],
  exports: [VERSION_CONTROL_TOKEN],
})
export class VersionControlModule {}
