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

import { Module, Global } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';

@Global()
@Module({
  imports: [
    NestRedisModule.forRootAsync({
      useFactory: (configService: ConfigService<AppConfig>) => {
        const redisConfig = configService.get('redis', { infer: true })!;
        return {
          type: 'single',
          options: {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            db: redisConfig.db,
            enableReadyCheck: false,
            maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
            retryDelayOnFailover: redisConfig.retryDelayOnFailover,
            lazyConnect: true,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [NestRedisModule],
})
export class RedisModule {}
