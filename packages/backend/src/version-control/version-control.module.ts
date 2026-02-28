import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VersionControlService } from './version-control.service';
import { VersionControlController } from './version-control.controller';
import { RolesModule } from '../roles/roles.module';
import { DatabaseModule } from '../database/database.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

@Module({
  imports: [ConfigModule, RolesModule, DatabaseModule],
  controllers: [VersionControlController],
  providers: [VersionControlService, RequireProjectPermissionGuard],
  exports: [VersionControlService],
})
export class VersionControlModule {}
