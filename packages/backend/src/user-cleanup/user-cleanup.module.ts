import { Module } from '@nestjs/common';
import { CONFIG } from '@cloudcad/contracts';
import { PermissionModule } from '../permission/permission.module';
import { StorageManagementModule } from '../storage-management/storage-management.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { UserCleanupService } from './user-cleanup.service';
import { UserCleanupController } from './user-cleanup.controller';

@Module({
  // 注意：UserCleanupScheduler 的清理指标埋点由 SchedulerModule（已导入 MetricsModule）提供，
  // 本模块自身无 CleanupMetricsService 消费者，不导入 MetricsModule（#325 模块健康审查）
  imports: [PermissionModule, StorageManagementModule, RuntimeConfigModule],
  providers: [UserCleanupService, { provide: CONFIG, useExisting: RuntimeConfigService }],
  controllers: [UserCleanupController],
  exports: [UserCleanupService],
})
export class UserCleanupModule {}
