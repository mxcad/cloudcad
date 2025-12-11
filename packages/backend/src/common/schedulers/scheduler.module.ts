import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common.module';
import { CacheCleanupScheduler } from './cache-cleanup.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), CommonModule],
  providers: [CacheCleanupScheduler],
})
export class SchedulerModule {}
