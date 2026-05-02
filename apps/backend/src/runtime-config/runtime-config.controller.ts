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
  Param,
  Body,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { RuntimeConfigService } from './runtime-config.service';
import {
  UpdateRuntimeConfigDto,
  RuntimeConfigResponseDto,
  RuntimeConfigDefinitionDto,
} from './dto/runtime-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import type { Request } from 'express';

@ApiTags('runtime-config')
@Controller('v1/runtime-config')
export class RuntimeConfigController {
  constructor(private readonly runtimeConfigService: RuntimeConfigService) {}

  /**
   * 获取前端所需的公开配置（无需登录）
   */
  @Public()
  @Get('public')
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
      systemNotice: '系统维护中',
    },
  })
  async getPublicConfigs(): Promise<Record<string, string | number | boolean>> {
    return this.runtimeConfigService.getPublicConfigs();
  }

  /**
   * 获取所有配置项（需要权限）
   */
  @Get()
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
   * 获取单个配置项
   */
  @Get(':key')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

    await this.runtimeConfigService.set(key, dto.value, user.id, ip);

    return { success: true };
  }

  /**
   * 重置配置为默认值
   */
  @Post(':key/reset')
  @UseGuards(JwtAuthGuard)
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
}
