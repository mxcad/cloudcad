import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ProjectPermissionService } from './project-permission.service';
import { ProjectRolesService } from './project-roles.service';
import { CommonModule } from '../common/common.module';
import { AuditLogModule } from '../audit/audit-log.module';

@Module({
  imports: [CommonModule, AuditLogModule],
  controllers: [RolesController],
  providers: [RolesService, ProjectPermissionService, ProjectRolesService],
  exports: [RolesService, ProjectPermissionService, ProjectRolesService],
})
export class RolesModule {}
