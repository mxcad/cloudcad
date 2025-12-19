import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TerminusModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
