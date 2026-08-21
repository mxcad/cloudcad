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

import { Module, Global, InternalServerErrorException, Provider, Logger } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * 构建期（generate:swagger）会启动整个 AppModule，服务可能在此期间发出 Redis 命令，
 * 触发 ioredis 自动连接。Redis 不可达时若客户端没有 error 监听器，Node 会把 error 事件
 * 视为未处理错误直接崩溃进程（实例：Redis 未启动时 pnpm build 崩溃）。这里统一挂监听兜底。
 */
const redisErrorLogger = new Logger('RedisModule');

function attachRedisErrorHandler(client: Redis): Redis {
  client.on('error', (err) => {
    // AggregateError（Node autoSelectFamily 多地址尝试）的 message 为空，补打 code 便于排查
    redisErrorLogger.warn(
      `Redis 连接错误: ${err.message || (err as NodeJS.ErrnoException).code || String(err)}`
    );
  });
  return client;
}

/** swagger 生成不需要 Redis，连接失败立即放弃重试，避免重试风暴拖慢构建 */
const isSwaggerGeneration = process.env.GENERATE_SWAGGER === '1';
const retryStrategy = isSwaggerGeneration ? (): null => null : undefined;

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService<AppConfig>) => {
    const redisConfig = configService.get('redis', { infer: true });
    if (!redisConfig) {
      throw new InternalServerErrorException('Redis configuration is missing');
    }
    return attachRedisErrorHandler(
      new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        enableReadyCheck: false,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        lazyConnect: true,
        retryStrategy,
      })
    );
  },
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [
    NestRedisModule.forRootAsync({
      useFactory: (configService: ConfigService<AppConfig>) => {
        const redisConfig = configService.get('redis', { infer: true });
        if (!redisConfig) {
          throw new InternalServerErrorException('Redis configuration is missing');
        }
        return {
          type: 'single',
          options: {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            db: redisConfig.db,
            enableReadyCheck: false,
            maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
            lazyConnect: true,
            retryStrategy,
          },
          onClientReady: (client: Redis) => {
            attachRedisErrorHandler(client);
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [redisClientProvider],
  exports: [NestRedisModule, REDIS_CLIENT],
})
export class RedisModule {}