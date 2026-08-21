import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { StorageManager } from './services/storage-manager.service';
import { DirectoryAllocator } from './services/directory-allocator.service';
import { FileLockService } from './services/file-lock.service';
import { FileCopyService } from './services/file-copy.service';
import { DiskMonitorService } from './services/disk-monitor.service';
import { StorageCleanupService } from './services/storage-cleanup.service';

@Module({
  imports: [StorageModule, RuntimeConfigModule],
  providers: [
    StorageManager,
    DirectoryAllocator,
    FileLockService,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
  ],
  exports: [
    StorageManager,
    DirectoryAllocator,
    FileLockService,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
  ],
})
export class StorageManagementModule {}
