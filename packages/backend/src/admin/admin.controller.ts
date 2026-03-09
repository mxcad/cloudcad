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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { SystemPermission } from '../common/enums/permissions.enum';
import {
  AdminStatsResponseDto,
  CacheStatsResponseDto,
  CacheCleanupResponseDto,
  UserPermissionsResponseDto,
  UserCacheClearResponseDto,
} from './dto/admin-response.dto';

@ApiTags('管理员')
@ApiBearerAuth()
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
  @ApiOperation({ summary: '获取管理员统计信息' })
  @ApiResponse({
    status: 200,
    description: '获取管理员统计信息成功',
    type: AdminStatsResponseDto,
  })
  async getAdminStats() {
    return {
      message: '管理员统计信息',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('permissions/cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取权限缓存统计' })
  @ApiResponse({
    status: 200,
    description: '获取权限缓存统计成功',
    type: CacheStatsResponseDto,
  })
  async getCacheStats() {
    const stats = this.cacheService.getStats();
    return {
      message: '权限缓存统计',
      data: stats,
    };
  }

  @Post('permissions/cache/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理权限缓存' })
  @ApiResponse({
    status: 200,
    description: '缓存清理完成',
    type: CacheCleanupResponseDto,
  })
  async cleanupCache() {
    this.cacheService.cleanup();
    return {
      message: '缓存清理完成',
    };
  }

  @Delete('permissions/cache/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除用户权限缓存' })
  @ApiResponse({
    status: 200,
    description: '用户权限缓存已清除',
    type: UserCacheClearResponseDto,
  })
  async clearUserCache(@Param('userId') userId: string) {
    this.cacheService.clearUserCache(userId);
    return {
      message: `用户 ${userId} 的权限缓存已清除`,
    };
  }

  @Get('permissions/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取用户权限信息' })
  @ApiResponse({
    status: 200,
    description: '获取用户权限信息成功',
    type: UserPermissionsResponseDto,
  })
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
