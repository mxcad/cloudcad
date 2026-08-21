import { Module } from '@nestjs/common';
import { CONFIG } from '@cloudcad/contracts';
import { PermissionModule } from '../permission/permission.module';
import { StorageManagementModule } from '../storage-management/storage-management.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { UserCleanupService } from './user-cleanup.service';
import { UserCleanupController } from './user-cleanup.controller';

@Module({
  imports: [PermissionModule, StorageManagementModule, RuntimeConfigModule],
  providers: [UserCleanupService, { provide: CONFIG, useExisting: RuntimeConfigService }],
  controllers: [UserCleanupController],
  exports: [UserCleanupService],
})
export class UserCleanupModule {}
