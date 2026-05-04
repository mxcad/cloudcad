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

  constructor(private readonly configService: ConfigService<AppConfig>) {
    // 优先使用 DATABASE_URL 环境变量
    let databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      const dbConfig = configService.get<{
        username: string; password: string; host: string; port: number;
        database: string; maxConnections: number; idleTimeoutMillis: number; connectionTimeoutMillis: number;
      }>('database');
      if (!dbConfig) {
        throw new Error('无法获取数据库配置，请检查 .env 文件或环境变量');
      }
      const encodedPassword = encodeURIComponent(dbConfig.password);
      databaseUrl = `postgresql://${dbConfig.username}:${encodedPassword}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
    }

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });

    const isDev = process.env.NODE_ENV !== 'production';

    super({
      log: isDev
        ? [
            { emit: 'stdout', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ],
      adapter,
    });

    this.logger.log(
      `数据库连接URL: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`
    );
  }

  async onModuleInit() {
    const startTime = Date.now();
    this.logger.log('正在连接数据库...');

    try {
      // 使用 Promise.race 实现连接超时
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
      this.logger.log(`✅ 数据库连接成功，耗时 ${duration}ms`);
    } catch (error) {
      this.logger.error('数据库连接失败:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('数据库连接已断开');
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
