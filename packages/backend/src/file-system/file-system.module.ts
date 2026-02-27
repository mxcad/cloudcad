import { Module } from '@nestjs/common';
import { FileSystemController } from './file-system.controller';
import { FileSystemService } from './file-system.service';
import { FileHashService } from './file-hash.service';
import { FileValidationService } from './file-validation.service';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RolesModule } from '../roles/roles.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    StorageModule,
    AuditLogModule,
    RolesModule,
    VersionControlModule,
  ],
  controllers: [FileSystemController],
  providers: [
    FileSystemService,
    FileHashService,
    FileValidationService,
    FileSystemPermissionService,
    RequireProjectPermissionGuard,
  ],
  exports: [
    FileSystemService,
    FileHashService,
    FileValidationService,
    FileSystemPermissionService,
  ],
})
export class FileSystemModule {}
