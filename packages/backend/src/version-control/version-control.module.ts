import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VersionControlService } from './version-control.service';

@Module({
  imports: [ConfigModule],
  providers: [VersionControlService],
  exports: [VersionControlService],
})
export class VersionControlModule {}