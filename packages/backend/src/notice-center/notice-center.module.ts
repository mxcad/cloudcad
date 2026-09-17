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

/**
 * 通用通知中心模块。
 *
 * 故意不加 @Global()：通知写入方必须是显式 seam。当前唯一消费方向是 HTTP 读端
 * （前端 get current / SSE stream），没有任何 module 注入 NoticeCenterService 生产通知；
 * @Global() 会让全仓任意 module 零成本拿到注入权，并让 app 启动时为不存在的生产者
 * 常驻一条 Redis 订阅连接。后续 kind='download' 的定向推送方（batch-download 等）
 * 落地时，在自己的 module imports 里加 NoticeCenterModule 即可，无需全仓可见。
 *
 * NOTICE_REDIS_SUBSCRIBER 是本模块专属的第二条 Redis 连接：ioredis 进入订阅模式
 * 后独占连接、不能再发命令，所以不能复用 RedisModule 的命令连接。订阅连接用
 * lazyConnect: false，保证 onModuleInit 时已经连上可以 subscribe。
 */

import {
  InternalServerErrorException,
  Logger,
  Module,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/app.config';
import { DatabaseModule } from '../database/database.module';
import { PermissionModule } from '../permission/permission.module';
import { NoticeCenterController } from './notice-center.controller';
import { NoticeCenterScheduler } from './notice-center.scheduler';
import { NoticeCenterService } from './notice-center.service';
import { NoticeSseService } from './notice-sse.service';
import { NOTICE_REDIS_SUBSCRIBER } from './notice.types';

const subscriberLogger = new Logger('NoticeRedisSubscriber');

/**
 * 构建期（generate:swagger）会启动整个 AppModule 触发 onModuleInit，若 Redis 不可达
 * 且客户端没有 error 监听，Node 会把 error 事件当成未处理错误直接崩掉进程。
 * 与 RedisModule 同样的两处兜底：error 监听 + 生成期不重试。
 */
const isSwaggerGeneration = process.env.GENERATE_SWAGGER === '1';
const retryStrategy = isSwaggerGeneration ? (): null => null : undefined;

const noticeSubscriberProvider: Provider = {
  provide: NOTICE_REDIS_SUBSCRIBER,
  useFactory: (configService: ConfigService<AppConfig>) => {
    const redisConfig = configService.get('redis', { infer: true });
    if (!redisConfig) {
      throw new InternalServerErrorException('Redis configuration is missing');
    }
    const client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      enableReadyCheck: false,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      lazyConnect: false,
      retryStrategy,
    });
    // ioredis 5.x 的 RedisOptions 不含 onerror；订阅模式独占连接，
    // 连接失败若没有 error 监听会被 Node 当成未处理错误直接崩掉进程
    client.on('error', (err) => {
      subscriberLogger.warn(
        `通知订阅连接错误: ${err.message || (err as NodeJS.ErrnoException).code || String(err)}`
      );
    });
    return client;
  },
  inject: [ConfigService],
};

@Module({
  imports: [DatabaseModule, PermissionModule],
  controllers: [NoticeCenterController],
  providers: [
    NoticeCenterService,
    NoticeSseService,
    NoticeCenterScheduler,
    noticeSubscriberProvider,
  ],
  exports: [NoticeCenterService, NoticeSseService],
})
export class NoticeCenterModule {}
