///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  Res,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RuntimeConfigService } from './runtime-config.service';
import { ChannelTestService } from './channel-test.service';
import { BrandAssetService } from './brand-asset.service';
import {
  UpdateRuntimeConfigDto,
  RuntimeConfigResponseDto,
  RuntimeConfigDefinitionDto,
  RuntimeConfigHistoryDto,
  ResetCategoryDto,
  ApplyProfileDto,
  RuntimeProfilePreviewResponseDto,
  RuntimeProfileApplyResponseDto,
  RuntimeConfigDependencyViolationDto,
  ChannelStatusDto,
  TestChannelDto,
  ChannelTestResultDto,
} from './dto/runtime-config.dto';
import type { RuntimeConfigValue } from './runtime-config.types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Public } from '../auth/decorators/public.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import type { Request, Response } from 'express';

@ApiTags('runtime-config')
@Controller('runtime-config')
@UseGuards(PermissionsGuard)
export class RuntimeConfigController {
  constructor(
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly channelTestService: ChannelTestService,
    private readonly brandAssetService: BrandAssetService
  ) {}

  /**
   * 获取前端所需的公开配置（无需登录）
   */
  @Public()
  @Get('public')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  // 注意：不使用 CacheInterceptor —— 进程内缓存无法在配置更新（set/reset）时失效，
  // 曾导致保存后最长 300s 内 public 接口仍返回旧值（如 maxFileSize 恒为默认 100M），
  // 刷新页面后前端上传限制不生效。缓存统一由 RuntimeConfigService 的 Redis 层承担（set 时删除）。
  @ApiOperation({ summary: '获取公开配置（前端初始化使用）' })
  @ApiResponse({
    status: 200,
    description: '返回公开配置键值对',
    type: Object,
    example: {
      mailEnabled: false,
      requireEmailVerification: false,
      supportEmail: 'support@example.com',
      supportPhone: '400-123-4567',
      allowRegister: true,
    },
  })
  async getPublicConfigs(): Promise<Record<string, RuntimeConfigValue>> {
    return this.runtimeConfigService.getPublicConfigs();
  }

  /**
   * 获取所有配置项（需要权限）
   */
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有运行时配置' })
  @ApiResponse({
    status: 200,
    description: '返回所有配置项列表',
    type: [RuntimeConfigResponseDto],
  })
  async getAllConfigs(): Promise<RuntimeConfigResponseDto[]> {
    return this.runtimeConfigService.getAllConfigs();
  }

  /**
   * 获取配置定义列表
   */
  @Get('definitions')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取配置项定义' })
  @ApiResponse({
    status: 200,
    description: '返回配置定义列表',
    type: [RuntimeConfigDefinitionDto],
  })
  async getDefinitions(): Promise<RuntimeConfigDefinitionDto[]> {
    return this.runtimeConfigService.getDefinitions();
  }

  /**
   * 检测开关依赖不一致（ADR-0082 检查手段①）：揪出门禁上线前遗留的
   * 「功能开关开、依赖的通道开关关」状态（含告警邮件反向偏离），供管理端呈现。
   * 注意路径声明顺序：必须排在 `:key` 之前，否则会被当成配置键名。
   */
  @Get('dependency-check')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '检测开关依赖不一致（验证开+通道关的遗留状态）' })
  @ApiResponse({
    status: 200,
    description: '返回当前依赖不一致清单（无违规时为空数组）',
    type: [RuntimeConfigDependencyViolationDto],
  })
  async checkDependencies(): Promise<RuntimeConfigDependencyViolationDto[]> {
    return this.runtimeConfigService.detectDependencyViolations();
  }

  /**
   * 获取全部已注册通道的状态（配置完整度 + 验证记录，ADR-0082 D4）。
   * 注意路径声明顺序：必须排在 `:key` 之前，否则 `channels` 会被当成配置键名。
   */
  @Get('channels')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取通道状态（配置完整度 + 验证记录）' })
  @ApiResponse({
    status: 200,
    description: '返回已注册通道的状态列表（未注册任何通道测试动作时为空数组）',
    type: [ChannelStatusDto],
  })
  async getChannelsStatus(): Promise<ChannelStatusDto[]> {
    return this.channelTestService.getChannelsStatus();
  }

  /**
   * 执行通道测试（ADR-0082 D4）：真实验证动作（如邮件测试发信）。
   * 成功 → 写验证记录（通道开关自此可开启）；失败 → 不写记录。
   * 测试动作入审计（谁、何时、结果）。
   */
  @Post('channels/:channel/test')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '执行通道测试（成功写验证记录，失败不写）' })
  @ApiParam({ name: 'channel', description: '通道名', example: 'mail' })
  @ApiBody({ type: TestChannelDto, required: false })
  @ApiResponse({
    status: 200,
    description: '返回测试结果（成功说明或失败原因）',
    type: ChannelTestResultDto,
  })
  @ApiResponse({ status: 400, description: '通道未注册测试动作' })
  async testChannel(
    @Param('channel') channel: string,
    @Body() dto: TestChannelDto,
    @Req() req: Request
  ): Promise<ChannelTestResultDto> {
    const user = req.user as { id: string };
    const ip = req.ip;

    return this.channelTestService.testChannel(
      channel,
      dto?.to,
      user.id,
      ip
    );
  }

  /**
   * 获取品牌 Logo（公开：登录页与 favicon 也要读）。
   * 注意路径声明顺序：必须排在 `:key` 之前，否则 `brand-logo` 会被当成配置键名。
   */
  @Public()
  @Get('brand-logo')
  @ApiOperation({ summary: '获取品牌 Logo' })
  @ApiResponse({ status: 200, description: '返回品牌 Logo 图片' })
  @ApiResponse({ status: 304, description: '品牌 Logo 未变化' })
  @ApiResponse({ status: 404, description: '尚未上传品牌 Logo' })
  async serveBrandLogo(@Res() res: Response) {
    const logo = await this.brandAssetService.readLogo();
    if (!logo) {
      throw new NotFoundException('尚未上传品牌 Logo');
    }

    const stats = await fs.promises.stat(logo.filePath);
    // 基于 mtime + size 生成 ETag：Logo 被覆盖重写后两者变化 → ETag 变化 → 浏览器重新拉取
    const etag = `"${Math.floor(stats.mtimeMs)}-${stats.size}"`;
    const lastModified = stats.mtime.toUTCString();
    const cacheControl = 'no-cache';

    const ifNoneMatch = res.req?.headers['if-none-match'];
    const etagMatches =
      ifNoneMatch
        ?.split(',')
        .map((tag) => tag.trim().replace(/^W\//, ''))
        .includes(etag) ?? false;
    const ifModifiedSince = Date.parse(
      res.req?.headers['if-modified-since'] || ''
    );
    const lastModifiedMs = Math.floor(stats.mtimeMs / 1000) * 1000;
    const notModified =
      etagMatches ||
      (!ifNoneMatch &&
        !Number.isNaN(ifModifiedSince) &&
        ifModifiedSince >= lastModifiedMs);

    if (notModified) {
      res.status(304);
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('Cache-Control', cacheControl);
      res.end();
      return;
    }

    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Last-Modified', lastModified);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', cacheControl);
    const stream = fs.createReadStream(logo.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    stream.pipe(res);
  }

  /**
   * 上传品牌 Logo（覆盖式）。返回前端可直接放进 `brandProfile.logo` 的 URL，
   * 品牌档案本身仍由 `PUT :key` 保存——上传只负责落盘文件。
   */
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @Post('brand-logo')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: '上传品牌 Logo' })
  @ApiResponse({
    status: 200,
    description: '上传成功，返回前端可引用的 Logo URL',
    schema: {
      type: 'object',
      properties: {
        logoUrl: { type: 'string', example: '/api/v1/runtime-config/brand-logo' },
        size: { type: 'number', example: 20480 },
      },
    },
  })
  @ApiResponse({ status: 400, description: '文件类型或大小不符合要求' })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), defParamCharset: 'utf8' })
  )
  async uploadBrandLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请上传 Logo 图片');
    }
    return this.brandAssetService.uploadLogo(file.buffer, file.mimetype);
  }

  /**
   * 获取单个配置项
   */
  @Get(':key')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取单个配置项' })
  @ApiParam({ name: 'key', description: '配置键名' })
  @ApiResponse({
    status: 200,
    description: '返回配置项详情',
    type: RuntimeConfigResponseDto,
  })
  async getConfig(
    @Param('key') key: string
  ): Promise<RuntimeConfigResponseDto> {
    return this.runtimeConfigService.get(key);
  }

  /**
   * 更新配置项
   */
  @Put(':key')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新配置项' })
  @ApiParam({ name: 'key', description: '配置键名' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async updateConfig(
    @Param('key') key: string,
    @Body() dto: UpdateRuntimeConfigDto,
    @Req() req: Request
  ) {
    const user = req.user as { id: string };
    const ip = req.ip;

    await this.runtimeConfigService.set(key, dto.val, user.id, ip);

    return { success: true };
  }

  /**
   * 重置配置为默认值
   */
  @Post(':key/reset')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '重置配置为默认值' })
  @ApiParam({ name: 'key', description: '配置键名' })
  @ApiResponse({
    status: 201,
    description: '重置成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async resetConfig(@Param('key') key: string, @Req() req: Request) {
    const user = req.user as { id: string };
    const ip = req.ip;

    await this.runtimeConfigService.resetToDefault(key, user.id, ip);

    return { success: true };
  }

  /**
   * 获取单个配置项的修改历史
   */
  @Get(':key/history')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取配置项修改历史' })
  @ApiParam({ name: 'key', description: '配置键名' })
  @ApiResponse({
    status: 200,
    description: '返回修改历史（按时间倒序）',
    type: [RuntimeConfigHistoryDto],
  })
  async getConfigHistory(
    @Param('key') key: string,
    @Query('limit') limit?: string
  ): Promise<RuntimeConfigHistoryDto[]> {
    const parsed = limit ? Number(limit) : undefined;
    return this.runtimeConfigService.getHistory(
      key,
      parsed ?? undefined
    );
  }

  /**
   * 按分类批量重置为默认值
   */
  @Post('reset-category')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '按分类批量重置配置为默认值' })
  @ApiResponse({
    status: 201,
    description: '重置成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        keys: {
          type: 'array',
          items: { type: 'string' },
          example: ['mailEnabled', 'requireEmailVerification'],
        },
      },
    },
  })
  async resetCategory(
    @Body() dto: ResetCategoryDto,
    @Req() req: Request
  ) {
    const user = req.user as { id: string };
    const ip = req.ip;

    const keys = await this.runtimeConfigService.resetCategory(
      dto.category,
      user.id,
      ip
    );

    return { success: true, keys };
  }

  /**
   * 预览切换安全模式会改动哪些项（只读，不写库）
   */
  @Post('profile/preview')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '预览切换安全模式会影响哪些配置项' })
  @ApiBody({ type: ApplyProfileDto })
  @ApiResponse({
    status: 201,
    description: '返回受影响配置项清单（含当前值与目标值）',
    type: [RuntimeProfilePreviewResponseDto],
  })
  async previewProfile(@Body() dto: ApplyProfileDto) {
    return this.runtimeConfigService.previewProfileApply(dto.profile);
  }

  /**
   * 应用安全模式：把声明了 profile 取值的配置项批量写到目标值
   */
  @Post('profile/apply')
  @RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '应用安全模式（批量写入配置并记审计）' })
  @ApiBody({ type: ApplyProfileDto })
  @ApiResponse({
    status: 201,
    description: '返回实际写入与跳过的配置项',
    type: RuntimeProfileApplyResponseDto,
  })
  async applyProfile(@Body() dto: ApplyProfileDto, @Req() req: Request) {
    const user = req.user as { id: string };
    const ip = req.ip;

    return this.runtimeConfigService.applyProfile(
      dto.profile,
      user.id,
      ip
    );
  }
}
