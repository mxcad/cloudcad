import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private configService: ConfigService<AppConfig>) {
    // 从 database 配置获取连接参数
    const dbConfig = configService.get('database', { infer: true })!;

    // 确保密码是字符串类型并进行URL编码
    const encodedPassword = encodeURIComponent(dbConfig.password);
    const databaseUrl = `postgresql://${dbConfig.username}:${encodedPassword}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

    console.log('数据库连接URL:', databaseUrl.replace(/:[^:@]*@/, ':***@')); // 隐藏密码的日志

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });

    super({
      log: ['info', 'warn', 'error'],
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('数据库连接成功');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('数据库连接已断开');
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
