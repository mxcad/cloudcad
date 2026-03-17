///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
