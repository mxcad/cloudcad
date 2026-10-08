///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PermissionCacheService } from '../permission/services/permission-cache.service';
import { StorageCleanupService } from '../storage-management/services/storage-cleanup.service';
import { SystemPermission } from '../common/enums/permissions.enum';
import {
  CacheStatsDto,
  CacheCleanupResultDto,
  UserCacheClearResultDto,
  StorageCleanupResultDto,
  PendingCleanupStatsDto,
  OrphanStatsDto,
  DeletedFileStatsDto,
} from './dto/admin-response.dto';
import { AdminStatsService } from './admin-stats.service';
import { MxcadEngineConfigService } from './mxcad-engine-config.service';
import {
  MxcadEngineConfigDto,
  UpdateCoordinateLogDto,
} from './dto/mxcad-engine-config.dto';
import {
  DailyPurchasesStatsDto,
  DailyRegistrationsStatsDto,
  StatsOverviewDto,
} from './dto/admin-stats.dto';

@ApiTags('管理员')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
export class AdminController {
  constructor(
    private readonly cacheService: PermissionCacheService,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly adminStatsService: AdminStatsService,
    private readonly mxcadEngineConfigService: MxcadEngineConfigService
  ) {}

  // ────────────────────────────────────────────────────────────
  // 运营统计（总量概览 / 每日新增用户 / 每日会员购买）
  // ────────────────────────────────────────────────────────────

  @Get('stats/overview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '运营总量概览' })
  @ApiResponse({
    status: 200,
    description:
      '运营总量概览成功（当前用户总数 + 累计付费用户数，与统计区间无关）',
    type: StatsOverviewDto,
  })
  getOverview() {
    return this.adminStatsService.getOverview();
  }

  @Get('stats/registrations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '每日新增用户统计' })
  @ApiResponse({
    status: 200,
    description: '每日新增用户统计成功（UTC+8 自然日，排除软删账号）',
    type: DailyRegistrationsStatsDto,
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: '开始日期（含，YYYY-MM-DD），缺省为 endDate 前 29 天',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: '结束日期（含，YYYY-MM-DD），缺省为今天',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: '注册来源过滤（如 LOCAL）',
  })
  async getRegistrationStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('provider') provider?: string
  ) {
    return this.adminStatsService.getDailyRegistrations({
      startDate,
      endDate,
      provider,
    });
  }

  @Get('stats/purchases')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '每日会员购买统计' })
  @ApiResponse({
    status: 200,
    description:
      '每日会员购买统计成功（仅成功支付订单，按支付完成时间归日；金额单位为分；退款单单列）',
    type: DailyPurchasesStatsDto,
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: '开始日期（含，YYYY-MM-DD），缺省为 endDate 前 29 天',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: '结束日期（含，YYYY-MM-DD），缺省为今天',
  })
  @ApiQuery({
    name: 'tierId',
    required: false,
    description: '会员档位过滤（作用于序列与汇总）',
  })
  async getPurchaseStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tierId') tierId?: string
  ) {
    return this.adminStatsService.getDailyPurchases({
      startDate,
      endDate,
      tierId,
    });
  }

  @Get('permissions/cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取权限缓存统计' })
  @ApiResponse({
    status: 200,
    description: '获取权限缓存统计成功',
    type: CacheStatsDto,
  })
  async getCacheStats() {
    return this.cacheService.getStats();
  }

  @Post('permissions/cache/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理权限缓存' })
  @ApiResponse({
    status: 200,
    description: '缓存清理完成',
    type: CacheCleanupResultDto,
  })
  async cleanupCache() {
    const cleaned = await this.cacheService.cleanup();
    return { cleanedEntries: cleaned };
  }

  @Delete('permissions/cache/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除用户权限缓存' })
  @ApiResponse({
    status: 200,
    description: '用户权限缓存已清除',
    type: UserCacheClearResultDto,
  })
  async clearUserCache(@Param('userId') userId: string) {
    await this.cacheService.clearUserCache(userId);
    return { userId };
  }

  @Post('storage/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发存储清理' })
  @ApiResponse({
    status: 200,
    description: '存储清理完成',
    type: StorageCleanupResultDto,
  })
  @ApiQuery({
    name: 'delayDays',
    required: false,
    type: Number,
    description: '清理延迟天数（覆盖默认值）',
  })
  async cleanupStorage(@Query('delayDays') delayDays?: number) {
    return this.storageCleanupService.manualCleanup(delayDays);
  }

  @Get('storage/cleanup/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取待清理存储统计' })
  @ApiResponse({
    status: 200,
    description: '获取待清理存储统计成功',
    type: PendingCleanupStatsDto,
  })
  async getCleanupStats() {
    return this.storageCleanupService.getPendingCleanupStats();
  }

  // ────────────────────────────────────────────────────────────
  // 孤儿文件检测与清理
  // ────────────────────────────────────────────────────────────

  @Get('storage/orphans/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取孤儿文件统计（本地孤立+DB孤立）' })
  @ApiResponse({
    status: 200,
    description: '获取孤儿文件统计成功',
    type: OrphanStatsDto,
  })
  async getOrphanStats() {
    const stats = await this.storageCleanupService.getOrphanStats();
    return {
      localOrphanCount: stats.localOrphanCount,
      localOrphanTotalSize: stats.localOrphanTotalSize,
      dbOrphanCount: stats.dbOrphanCount,
      localOrphans: stats.localOrphans.map((o) => ({
        nodeId: o.nodeId,
        directory: o.directory,
        sizeBytes: o.sizeBytes,
      })),
      dbOrphans: stats.dbOrphans.map((o) => ({
        nodeId: o.nodeId,
        name: o.name,
        projectId: o.projectId,
      })),
    };
  }

  @Post('storage/orphans/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发孤儿文件清理' })
  @ApiResponse({
    status: 200,
    description: '孤儿文件清理完成',
    type: StorageCleanupResultDto,
  })
  async cleanupOrphans() {
    return this.storageCleanupService.cleanupOrphans();
  }

  // ────────────────────────────────────────────────────────────
  // 标记删除文件统计
  // ────────────────────────────────────────────────────────────

  @Get('storage/deleted-files/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取标记删除文件统计（回收站+待清理+已删项目+孤儿）',
  })
  @ApiResponse({
    status: 200,
    description: '获取标记删除文件统计成功',
    type: DeletedFileStatsDto,
  })
  async getDeletedFileStats() {
    return this.storageCleanupService.getDeletedFileStats();
  }

  // ────────────────────────────────────────────────────────────
  // MX 引擎 ini 配置（mxcad_ini.json，单一事实源是引擎目录下的文件本身）
  // ────────────────────────────────────────────────────────────

  @Get('mxcad-engine/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取协同详细日志配置（开关状态 + 引擎日志目录）',
  })
  @ApiResponse({
    status: 200,
    description:
      '获取协同详细日志配置成功；logPath 为引擎 about 探测的本机数据目录，探测失败时为 null',
    type: MxcadEngineConfigDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  async getMxcadEngineConfig(): Promise<MxcadEngineConfigDto> {
    return this.mxcadEngineConfigService.getEngineConfig();
  }

  @Put('mxcad-engine/coordinate-log')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '启用/关闭协同详细日志（写引擎 mxcad_ini.json；协同为长驻进程，需重启协同服务后对协同编辑生效）',
  })
  @ApiResponse({
    status: 200,
    description: '协同详细日志开关已写入引擎配置',
    type: MxcadEngineConfigDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  async updateCoordinateLog(
    @Body() dto: UpdateCoordinateLogDto
  ): Promise<MxcadEngineConfigDto> {
    return this.mxcadEngineConfigService.setCoordinateLogEnabled(dto.enabled);
  }
}
