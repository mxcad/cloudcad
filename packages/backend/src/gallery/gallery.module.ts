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
import { JwtModule } from '@nestjs/jwt';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { DatabaseModule } from '../database/database.module';
import { MxCadModule } from '../mxcad/mxcad.module';
import { CommonModule } from '../common/common.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { RolesModule } from '../roles/roles.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

/**
 * 图库模块
 */
@Module({
  imports: [
    DatabaseModule,
    MxCadModule,
    CommonModule,
    FileSystemModule,
    RolesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn', '1h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [GalleryController],
  providers: [GalleryService, RequireProjectPermissionGuard],
  exports: [GalleryService],
})
export class GalleryModule {}
