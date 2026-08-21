import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VipTierService } from './vip-tier.service';
import { DurationPricingService } from './duration-pricing.service';
import { ConfigKeyRegistryService } from './config-key-registry.service';
import { CreateVipTierDto } from './dto/create-vip-tier.dto';
import { UpdateVipTierDto } from './dto/update-vip-tier.dto';
import { UpdateTierConfigsDto } from './dto/update-tier-configs.dto';
import { CreateDurationPricingDto } from './dto/create-duration-pricing.dto';
import { UpdateDurationPricingDto } from './dto/update-duration-pricing.dto';
import { CreateConfigKeyDto } from './dto/create-config-key.dto';
import { UpdateConfigKeyDto } from './dto/update-config-key.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('VIP')
@Controller('vip')
export class VipController {
  constructor(
    private vipTierService: VipTierService,
    private durationPricingService: DurationPricingService,
    private configKeyRegistryService: ConfigKeyRegistryService,
  ) {}

  @Public()
  @Get('tiers')
  @ApiOperation({ summary: 'VIP 等级列表（仅启用）' })
  async getActiveTiers() {
    return this.vipTierService.findActive();
  }

  @Public()
  @Get('tiers/registry')
  @ApiOperation({ summary: '配置项元数据注册表，供前端动态渲染配置表单' })
  async getRegistry() {
    return this.configKeyRegistryService.findAll();
  }

  @Public()
  @Get('durations')
  @ApiOperation({ summary: '时长定价列表（仅启用）' })
  async getActiveDurations() {
    return this.durationPricingService.findActive();
  }
}

@ApiTags('VIP Admin')
@Controller('admin/vip')
@UseGuards(PermissionsGuard)
@ApiBearerAuth()
export class VipAdminController {
  constructor(
    private vipTierService: VipTierService,
    private durationPricingService: DurationPricingService,
    private configKeyRegistryService: ConfigKeyRegistryService,
  ) {}

  @Get('tiers')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有 VIP 等级（含已下架）' })
  async getAllTiers() {
    return this.vipTierService.findAll();
  }

  @Get('tiers/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: 'VIP 等级详情' })
  async getTier(@Param('id') id: string) {
    return this.vipTierService.findById(id);
  }

  @Post('tiers')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '新增 VIP 等级' })
  async createTier(@Body() dto: CreateVipTierDto) {
    return this.vipTierService.create(dto);
  }

  @Put('tiers/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '修改 VIP 等级' })
  async updateTier(@Param('id') id: string, @Body() dto: UpdateVipTierDto) {
    return this.vipTierService.update(id, dto);
  }

  @Put('tiers/:id/configs')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '更新 VIP 等级配置项' })
  async updateTierConfigs(@Param('id') id: string, @Body() dto: UpdateTierConfigsDto) {
    return this.vipTierService.updateConfigs(id, dto);
  }

  @Delete('tiers/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '下架 VIP 等级' })
  async deactivateTier(@Param('id') id: string) {
    return this.vipTierService.deactivate(id);
  }

  @Delete('tiers/:id/permanent')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '物理删除 VIP 等级（无订单引用时）' })
  async deleteTierPermanent(@Param('id') id: string) {
    return this.vipTierService.remove(id);
  }

  @Get('durations')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有时长定价（含已下架）' })
  async getAllDurations() {
    return this.durationPricingService.findAll();
  }

  @Get('durations/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '时长定价详情' })
  async getDuration(@Param('id') id: string) {
    return this.durationPricingService.findById(id);
  }

  @Post('durations')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '新增时长定价' })
  async createDuration(@Body() dto: CreateDurationPricingDto) {
    return this.durationPricingService.create(dto);
  }

  @Put('durations/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '修改时长定价' })
  async updateDuration(@Param('id') id: string, @Body() dto: UpdateDurationPricingDto) {
    return this.durationPricingService.update(id, dto);
  }

  @Delete('durations/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '下架时长定价' })
  async deactivateDuration(@Param('id') id: string) {
    return this.durationPricingService.deactivate(id);
  }

  @Get('config-keys')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有配置键' })
  async getAllConfigKeys() {
    return this.configKeyRegistryService.findAll();
  }

  @Post('config-keys')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '新增配置键' })
  async createConfigKey(@Body() dto: CreateConfigKeyDto) {
    return this.configKeyRegistryService.create(dto);
  }

  @Put('config-keys/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '修改配置键' })
  async updateConfigKey(@Param('id') id: string, @Body() dto: UpdateConfigKeyDto) {
    return this.configKeyRegistryService.update(id, dto);
  }

  @Delete('config-keys/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '删除配置键' })
  async deleteConfigKey(@Param('id') id: string) {
    await this.configKeyRegistryService.remove(id);
    return { success: true };
  }
}
