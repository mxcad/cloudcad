import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { CacheArchitectureModule } from '../cache-architecture/cache-architecture.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { ClsModule } from './cls/cls.module';
import { FileExtensionsService } from './services/file-extensions.service';
import { FtsQueryBuilder } from '../file-system/search/fts-query-builder';
import { AncestorQueryService } from './services/ancestor-query.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    CacheArchitectureModule,
    RuntimeConfigModule,
    ClsModule,
  ],
  providers: [
    FileExtensionsService,
    FtsQueryBuilder,
    AncestorQueryService,
  ],
  exports: [
    FileExtensionsService,
    FtsQueryBuilder,
    AncestorQueryService,
    ClsModule,
    RuntimeConfigModule,
  ],
})
export class CommonModule {}
