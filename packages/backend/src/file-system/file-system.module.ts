import { Module } from '@nestjs/common';
import { FileSystemController } from './file-system.controller';
import { FileSystemService } from './file-system.service';
import { FileValidationService } from './file-validation.service';
import { FileSystemPermissionService } from './file-system-permission.service';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [FileSystemController],
  providers: [
    FileSystemService,
    FileValidationService,
    FileSystemPermissionService,
  ],
  exports: [
    FileSystemService,
    FileValidationService,
    FileSystemPermissionService,
  ],
})
export class FileSystemModule {}
