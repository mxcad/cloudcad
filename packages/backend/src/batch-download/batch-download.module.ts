import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageManagementModule } from '../storage-management/storage-management.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { PublicFileModule } from '../public-file/public-file.module';
import { AuthModule } from '../auth/auth.module';
import { MxCadModule } from '../mxcad/mxcad.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { AlertModule } from '../alert/alert.module';
import { TaskRunModule } from '../task-run/task-run.module';
import { MetricsModule } from '../metrics/metrics.module';
import { BatchDownloadController } from './batch-download.controller';
import { BatchDownloadService } from './batch-download.service';
import { BatchDownloadOrchestrator } from './batch-download-orchestrator';
import { BatchDownloadJob } from './batch-download-job';
import { BatchDownloadCleanupService } from './batch-download-cleanup.service';
import { ArchiveWriter } from './archive-writer';
import { ConversionRunner } from './conversion-runner';
import { SseManager } from './sse-manager';
import { FolderExpanderService } from './folder-expander.service';
import { ProgressTrackerService } from './progress-tracker.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    CommonModule,
    PermissionModule,
    StorageManagementModule,
    FileSystemModule,
    PublicFileModule,
    AuthModule.forRoot(),
    MxCadModule,
    AuditLogModule,
    RuntimeConfigModule,
    AlertModule,
    TaskRunModule,
    MetricsModule,
  ],
  controllers: [BatchDownloadController],
  providers: [
    BatchDownloadService,
    BatchDownloadJob,
    BatchDownloadOrchestrator,
    BatchDownloadCleanupService,
    ArchiveWriter,
    ConversionRunner,
    SseManager,
    FolderExpanderService,
    ProgressTrackerService,
  ],
  exports: [
    BatchDownloadService,
    FolderExpanderService,
    ProgressTrackerService,
  ],
})
export class BatchDownloadModule {}
