import { Module } from '@nestjs/common';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseModule } from '../database/database.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FilesController],
  providers: [FilesService, PermissionService, PermissionCacheService],
  exports: [FilesService],
})
export class FilesModule {}
