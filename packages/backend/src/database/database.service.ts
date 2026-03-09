import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private configService: ConfigService) {
    // 手动构建DATABASE_URL，确保格式正确
    const dbHost = configService.get('DB_HOST', 'localhost');
    const dbPort = configService.get('DB_PORT', '5432');
    const dbUser = configService.get('DB_USERNAME', 'postgres');
    const dbPassword = configService.get('DB_PASSWORD', 'password');
    const dbDatabase = configService.get('DB_DATABASE', 'cloudcad');

    // 确保密码是字符串类型并进行URL编码
    const encodedPassword = encodeURIComponent(String(dbPassword));
    const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbDatabase}`;

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
