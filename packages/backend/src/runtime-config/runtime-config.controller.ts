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
} from '@nestjs/swagger';
import { RuntimeConfigService } from './runtime-config.service';
import { UpdateRuntimeConfigDto } from './dto/runtime-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import type { Request } from 'express';

@ApiTags('runtime-config')
@Controller('runtime-config')
export class RuntimeConfigController {
  constructor(private readonly runtimeConfigService: RuntimeConfigService) {}

  /**
   * 获取前端所需的公开配置（无需登录）
   */
  @Get('public')
  @ApiOperation({ summary: '获取公开配置（前端初始化使用）' })
  async getPublicConfigs() {
    return this.runtimeConfigService.getPublicConfigs();
  }

  /**
   * 获取所有配置项（需要权限）
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([SystemPermission.CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有运行时配置' })
  async getAllConfigs() {
    return this.runtimeConfigService.getAllConfigs();
  }

  /**
   * 获取配置定义列表
   */
  @Get('definitions')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([SystemPermission.CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取配置项定义' })
  async getDefinitions() {
    return this.runtimeConfigService.getDefinitions();
  }

  /**
   * 获取单个配置项
   */
  @Get(':key')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([SystemPermission.CONFIG_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取单个配置项' })
  @ApiParam({ name: 'key', description: '配置键名' })
  async getConfig(@Param('key') key: string) {
    return this.runtimeConfigService.get(key);
  }

  /**
   * 更新配置项
   */
  @Put(':key')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([SystemPermission.CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新配置项' })
  @ApiParam({ name: 'key', description: '配置键名' })
  async updateConfig(
    @Param('key') key: string,
    @Body() dto: UpdateRuntimeConfigDto,
    @Req() req: Request,
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
  @RequirePermissions([SystemPermission.CONFIG_WRITE])
  @ApiBearerAuth()
  @ApiOperation({ summary: '重置配置为默认值' })
  @ApiParam({ name: 'key', description: '配置键名' })
  async resetConfig(@Param('key') key: string, @Req() req: Request) {
    const user = req.user as { id: string };
    const ip = req.ip;

    await this.runtimeConfigService.resetToDefault(key, user.id, ip);

    return { success: true };
  }
}
