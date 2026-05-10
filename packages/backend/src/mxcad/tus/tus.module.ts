///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadCoreModule } from '../core/mxcad-core.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { CommonModule } from '../../common/common.module';
import { TusService } from './tus.service';
import { TusEventHandler } from './tus-event-handler.service';
import { TusAuthMiddleware } from './tus-auth.middleware';
import { AppConfig } from '../../config/app.config';

/**
 * Tus 上传协议模块
 *
 * 基于 @tus/server 实现标准 tus 协议的分片上传服务。
 * 支持已登录用户（创建文件节点）和匿名用户（仅存储文件）。
 *
 * tus 协议端点：
 *   POST   /api/v1/files              — 创建上传会话
 *   PATCH  /api/v1/files/:id          — 上传分片数据
 *   HEAD   /api/v1/files/:id          — 检查上传状态
 *   DELETE /api/v1/files/:id          — 取消上传
 *
 * 事件处理:
 *   onUploadFinish — 上传完成后触发文件转换和节点创建（已登录）或仅存储（匿名）
 */
@Module({
  imports: [
    ConfigModule,
    MxcadInfraModule,
    MxcadCoreModule,
    MxcadConversionModule,
    MxcadUploadModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    forwardRef(() => FileSystemModule),
    FilePermissionModule,
    StorageModule,
    VersionControlModule,
    CommonModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TusService, TusEventHandler, TusAuthMiddleware],
  exports: [TusService, TusAuthMiddleware],
})
export class TusModule {}