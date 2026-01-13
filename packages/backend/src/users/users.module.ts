import { Module } from '@nestjs/common';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { RolesCacheService } from '../common/services/roles-cache.service';
import { DatabaseModule } from '../database/database.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, PermissionService, PermissionCacheService, RolesCacheService],
  exports: [UsersService],
})
export class UsersModule {}
