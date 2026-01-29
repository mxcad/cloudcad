import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { StorageModule } from '../storage/storage.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TerminusModule, StorageModule, CommonModule],
  controllers: [HealthController],
})
export class HealthModule {}
