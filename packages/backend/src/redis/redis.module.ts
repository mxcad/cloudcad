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
