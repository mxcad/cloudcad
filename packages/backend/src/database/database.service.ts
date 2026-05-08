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

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  private readonly slowQueryThresholdMs: number;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const dbConfig = configService.get<{
      username: string; password: string; host: string; port: number;
      database: string; maxConnections: number; idleTimeoutMillis: number; connectionTimeoutMillis: number;
    }>('database');
    if (!dbConfig) {
      throw new Error('无法获取数据库配置，请检查 .env 文件或环境变量');
    }

    // 优先使用 DATABASE_URL 环境变量，否则根据各配置项拼接
    let databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      const encodedPassword = encodeURIComponent(dbConfig.password);
      databaseUrl = `postgresql://${dbConfig.username}:${encodedPassword}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
    }

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      max: dbConfig.maxConnections,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    });

    const isDev = process.env.NODE_ENV !== 'production';

    super({
      log: isDev
        ? [
            // 开发环境：query 事件用于慢查询检测，不通过 stdout 打印全量 SQL
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'info' },
          ]
        : [
            // 生产环境：只保留 error + warn
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ],
      adapter,
    });

    // 慢查询阈值（毫秒），可通过 LOG_SLOW_QUERY_THRESHOLD_MS 环境变量覆盖
    this.slowQueryThresholdMs = parseInt(
      process.env.LOG_SLOW_QUERY_THRESHOLD_MS || '500',
      10,
    ) || 500;

    // 慢查询监听：仅开发环境，超过阈值的 SQL 才打印
    if (isDev) {
      this.$on('query', (event) => {
        if (event.duration >= this.slowQueryThresholdMs) {
          this.logger.warn(
            `🐢 慢查询 (${event.duration}ms): ${event.query?.substring(0, 200) || 'N/A'}`,
          );
        }
      });
    }

    if (isDev) {
      this.logger.log(
        `数据库连接URL: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`
      );
    }
  }

  async onModuleInit() {
    const startTime = Date.now();
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) this.logger.log('正在连接数据库...');

    try {
      const connectPromise = this.$connect();
      const timeout = this.configService.get('database', {
        infer: true,
      })!.connectionTimeoutMillis;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`数据库连接超时 (${timeout}ms)`)),
          timeout
        )
      );

      await Promise.race([connectPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      if (isDev) {
        this.logger.log(`✅ 数据库连接成功，耗时 ${duration}ms`);
      } else {
        this.logger.log(`数据库连接成功 (${duration}ms)`);
      }
    } catch (error) {
      this.logger.error('数据库连接失败:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log('数据库连接已断开');
    }
  }

  async healthCheck() {
    try {
      await this.$queryRaw`SELECT 1`;
      return { status: 'healthy', message: '数据库连接正常' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: '数据库连接失败',
        error: error.message,
      };
    }
  }
}
