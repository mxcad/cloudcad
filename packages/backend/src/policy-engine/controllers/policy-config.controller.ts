import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { PolicyConfigService } from '../services/policy-config.service';
import { CreatePolicyDto } from '../dto/create-policy.dto';
import { UpdatePolicyDto } from '../dto/update-policy.dto';
import { PolicyResponseDto } from '../dto/policy.dto';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';

/**
 * 策略配置控制器
 *
 * 提供策略配置的 CRUD API
 */
@ApiTags('权限策略配置')
@Controller('policy-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PolicyConfigController {
  constructor(private readonly policyConfigService: PolicyConfigService) {}

  /**
   * 创建策略配置
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '创建权限策略配置' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '策略配置创建成功',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: '权限不足' })
  async createPolicy(
    @Body() createPolicyDto: CreatePolicyDto,
    @Request() req
  ): Promise<PolicyResponseDto> {
    const config = {
      type: createPolicyDto.type,
      name: createPolicyDto.name,
      description: createPolicyDto.description,
      config: createPolicyDto.config,
      permissions: createPolicyDto.permissions,
      enabled: createPolicyDto.enabled ?? true,
      priority: createPolicyDto.priority ?? 0,
    };

    const policy = await this.policyConfigService.createPolicyConfig(
      config,
      req.user.id
    );
    return this.formatPolicyResponse(policy);
  }

  /**
   * 更新策略配置
   */
  @Put(':id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '更新权限策略配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '策略配置更新成功',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: '策略配置不存在' })
  async updatePolicy(
    @Param('id') id: string,
    @Body() updatePolicyDto: UpdatePolicyDto,
    @Request() req
  ): Promise<PolicyResponseDto> {
    const policy = await this.policyConfigService.updatePolicyConfig(
      id,
      updatePolicyDto,
      req.user.id
    );
    return this.formatPolicyResponse(policy);
  }

  /**
   * 删除策略配置
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '删除权限策略配置' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '策略配置删除成功',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: '策略配置不存在' })
  async deletePolicy(@Param('id') id: string, @Request() req): Promise<void> {
    await this.policyConfigService.deletePolicyConfig(id, req.user.id);
  }

  /**
   * 获取策略配置
   */
  @Get(':id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取权限策略配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '策略配置获取成功',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: '策略配置不存在' })
  async getPolicy(@Param('id') id: string): Promise<PolicyResponseDto> {
    const policy = await this.policyConfigService.getPolicyConfig(id);
    if (!policy) {
      throw new Error('策略配置不存在');
    }
    return this.formatPolicyResponse(policy);
  }

  /**
   * 获取所有策略配置
   */
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取所有权限策略配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '策略配置列表获取成功',
    type: [PolicyResponseDto],
  })
  async getAllPolicies(): Promise<PolicyResponseDto[]> {
    const policies = await this.policyConfigService.getAllPolicyConfigs();
    return policies.map((policy) => this.formatPolicyResponse(policy));
  }

  /**
   * 启用策略配置
   */
  @Put(':id/enable')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '启用权限策略配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '策略配置启用成功',
    type: PolicyResponseDto,
  })
  async enablePolicy(
    @Param('id') id: string,
    @Request() req
  ): Promise<PolicyResponseDto> {
    const policy = await this.policyConfigService.togglePolicyConfig(
      id,
      true,
      req.user.id
    );
    return this.formatPolicyResponse(policy);
  }

  /**
   * 禁用策略配置
   */
  @Put(':id/disable')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '禁用权限策略配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '策略配置禁用成功',
    type: PolicyResponseDto,
  })
  async disablePolicy(
    @Param('id') id: string,
    @Request() req
  ): Promise<PolicyResponseDto> {
    const policy = await this.policyConfigService.togglePolicyConfig(
      id,
      false,
      req.user.id
    );
    return this.formatPolicyResponse(policy);
  }

  /**
   * 格式化策略响应
   */
  private formatPolicyResponse(policy: any): PolicyResponseDto {
    return {
      id: policy.id,
      type: policy.type as PolicyType,
      name: policy.name,
      description: policy.description,
      config: policy.config,
      permissions: (policy.permissions || []) as PrismaPermission[],
      enabled: policy.enabled,
      priority: policy.priority,
      createdAt: new Date(), // 这些字段应该在数据库中返回
      updatedAt: new Date(),
    };
  }
}