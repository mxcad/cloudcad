import { Module } from '@nestjs/common';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, PermissionService, PermissionCacheService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
