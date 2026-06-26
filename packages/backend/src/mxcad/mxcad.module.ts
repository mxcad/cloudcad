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
import { MxcadInfraModule } from './infra/mxcad-infra.module';
import { MxcadConversionModule } from './conversion/mxcad-conversion.module';
import { MxcadNodeModule } from './node/mxcad-node.module';
import { MxcadExternalRefModule } from './external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from './save/mxcad-save.module';
import { MxcadUploadModule } from './upload/mxcad-upload.module';
import { MxcadCoreModule } from './core/mxcad-core.module';
import { ChunkUploadService } from './services/chunk-upload.service';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FileSystemModule } from '../file-system/file-system.module';
import { FileTreeModule } from '../file-system/file-tree/file-tree.module';
import { FileSystemService as MainFileSystemService } from '../file-system/file-system.service';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { RolesModule } from '../roles/roles.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { AppConfig } from '../config/app.config';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { ConversionModule } from '../conversion';
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    ConfigModule,
    RuntimeConfigModule,
    ConversionModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadSaveModule,
    MxcadCoreModule,
    MxcadUploadModule,
    forwardRef(() => FileSystemModule),
    FileTreeModule,
    forwardRef(() => StorageModule),
    VersionControlModule,
    RolesModule,
  ],
  controllers: [],
  providers: [
    ChunkUploadService,
    {
      provide: 'FileSystemServiceMain',
      useExisting: MainFileSystemService,
    },
    RequireProjectPermissionGuard,
  ],
  exports: [MxcadConversionModule, MxcadInfraModule, MxcadUploadModule],
})
export class MxCadModule {}
