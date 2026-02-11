import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VersionControlService } from './version-control.service';
import { VersionControlController } from './version-control.controller';
import { RolesModule } from '../roles/roles.module';
import { DatabaseModule } from '../database/database.module';
import { VersionControlPermissionGuard } from './version-control-permission.guard';

@Module({
  imports: [ConfigModule, RolesModule, DatabaseModule],
  controllers: [VersionControlController],
  providers: [VersionControlService, VersionControlPermissionGuard],
  exports: [VersionControlService],
})
export class VersionControlModule {}