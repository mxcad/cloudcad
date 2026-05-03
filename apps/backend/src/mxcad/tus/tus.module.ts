///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadCoreModule } from '../core/mxcad-core.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { TusService } from './tus.service';
import { TusEventHandler } from './tus-event-handler.service';
import { TusAuthMiddleware } from './tus-auth.middleware';
import { AppConfig } from '../../config/app.config';

/**
 * Tus 上传协议模块
 *
 * 基于 @tus/server 实现标准 tus 协议的分片上传服务。
 * 替换原有的 MxcadChunkModule + MxcadUploadModule 自定义分片逻辑。
 *
 * tus 协议端点：
 *   POST   /api/v1/files              — 创建上传会话
 *   PATCH  /api/v1/files/:id          — 上传分片数据
 *   HEAD   /api/v1/files/:id          — 检查上传状态
 *   DELETE /api/v1/files/:id          — 取消上传
 *
 * 事件处理:
 *   onUploadFinish — 上传完成后触发文件转换和节点创建
 */
@Module({
  imports: [
    ConfigModule,
    MxcadInfraModule,
    MxcadCoreModule,
    forwardRef(() => FileSystemModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TusService, TusEventHandler, TusAuthMiddleware],
  exports: [TusService, TusAuthMiddleware],
})
export class TusModule {}
