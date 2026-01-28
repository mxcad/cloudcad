import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { SystemPermission } from '../common/enums/permissions.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
export class AdminController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly cacheService: PermissionCacheService
  ) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getAdminStats() {
    return {
      message: '管理员统计信息',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('permissions/cache')
  @HttpCode(HttpStatus.OK)
  async getCacheStats() {
    const stats = this.cacheService.getStats();
    return {
      message: '权限缓存统计',
      data: stats,
    };
  }

  @Post('permissions/cache/cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanupCache() {
    this.cacheService.cleanup();
    return {
      message: '缓存清理完成',
    };
  }

  @Delete('permissions/cache/user/:userId')
  @HttpCode(HttpStatus.OK)
  async clearUserCache(@Param('userId') userId: string) {
    this.cacheService.clearUserCache(userId);
    return {
      message: `用户 ${userId} 的权限缓存已清除`,
    };
  }

  @Get('permissions/user/:userId')
  @HttpCode(HttpStatus.OK)
  async getUserPermissions(@Param('userId') userId: string) {
    // 这里需要获取用户信息，实际应用中应该从用户服务获取
    const mockUser = {
      id: userId,
      email: 'test@example.com',
      username: 'test',
      role: {
        id: 'user-role-id',
        name: 'USER',
        description: '普通用户',
        isSystem: true,
        permissions: [],
      },
      status: 'ACTIVE',
    };

    return {
      message: '用户权限信息',
      data: {
        userRole: mockUser.role.name,
        permissions: await this.permissionService.getUserPermissions(mockUser),
      },
    };
  }
}
