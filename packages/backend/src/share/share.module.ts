import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { RolesModule } from '../roles/roles.module';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { AuditLogModule } from '../audit/audit-log.module';

@Module({
  imports: [RolesModule, CommonModule, PermissionModule, AuditLogModule],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
