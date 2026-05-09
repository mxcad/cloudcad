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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { PolicyConfigService, PermissionPolicyConfig } from '../services/policy-config.service';
import { CreatePolicyDto } from '../dto/create-policy.dto';
import { UpdatePolicyDto } from '../dto/update-policy.dto';
import { PolicyResponseDto } from '../dto/policy.dto';
import { PolicyType } from '../enums/policy-type.enum';

/**
 * ńŁ¢ńĢźķģŹńĮ«µÄ¦ÕłČÕÖ©
 *
 * µÅÉõŠøńŁ¢ńĢźķģŹńĮ«ńÜä CRUD API
 */
@ApiTags('µØāķÖÉńŁ¢ńĢźķģŹńĮ«')
@Controller('policy-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PolicyConfigController {
  constructor(private readonly policyConfigService: PolicyConfigService) {}

  /**
   * ÕłøÕ╗║ńŁ¢ńĢźķģŹńĮ«
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: 'ÕłøÕ╗║µØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'ńŁ¢ńĢźķģŹńĮ«ÕłøÕ╗║µłÉÕŖ¤',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'µØāķÖÉõĖŹĶČ│' })
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
   * µø┤µ¢░ńŁ¢ńĢźķģŹńĮ«
   */
  @Put(':id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: 'µø┤µ¢░µØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'ńŁ¢ńĢźķģŹńĮ«µø┤µ¢░µłÉÕŖ¤',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'ńŁ¢ńĢźķģŹńĮ«õĖŹÕŁśÕ£©' })
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
   * ÕłĀķÖżńŁ¢ńĢźķģŹńĮ«
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: 'ÕłĀķÖżµØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'ńŁ¢ńĢźķģŹńĮ«ÕłĀķÖżµłÉÕŖ¤',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'ńŁ¢ńĢźķģŹńĮ«õĖŹÕŁśÕ£©' })
  async deletePolicy(@Param('id') id: string, @Request() req): Promise<void> {
    await this.policyConfigService.deletePolicyConfig(id, req.user.id);
  }

  /**
   * ĶÄĘÕÅ¢ńŁ¢ńĢźķģŹńĮ«
   */
  @Get(':id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: 'ĶÄĘÕÅ¢µØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'ńŁ¢ńĢźķģŹńĮ«ĶÄĘÕÅ¢µłÉÕŖ¤',
    type: PolicyResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'ńŁ¢ńĢźķģŹńĮ«õĖŹÕŁśÕ£©' })
  async getPolicy(@Param('id') id: string): Promise<PolicyResponseDto> {
    const policy = await this.policyConfigService.getPolicyConfig(id);
    if (!policy) {
      throw new Error('ńŁ¢ńĢźķģŹńĮ«õĖŹÕŁśÕ£©');
    }
    return this.formatPolicyResponse(policy);
  }

  /**
   * ĶÄĘÕÅ¢µēĆµ£ēńŁ¢ńĢźķģŹńĮ«
   */
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: 'ĶÄĘÕÅ¢µēĆµ£ēµØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'ńŁ¢ńĢźķģŹńĮ«ÕłŚĶĪ©ĶÄĘÕÅ¢µłÉÕŖ¤',
    type: [PolicyResponseDto],
  })
  async getAllPolicies(): Promise<PolicyResponseDto[]> {
    const policies = await this.policyConfigService.getAllPolicyConfigs();
    return policies.map((policy) => this.formatPolicyResponse(policy));
  }

  /**
   * ÕÉ»ńö©ńŁ¢ńĢźķģŹńĮ«
   */
  @Put(':id/enable')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: 'ÕÉ»ńö©µØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'ńŁ¢ńĢźķģŹńĮ«ÕÉ»ńö©µłÉÕŖ¤',
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
   * ń”üńö©ńŁ¢ńĢźķģŹńĮ«
   */
  @Put(':id/disable')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: 'ń”üńö©µØāķÖÉńŁ¢ńĢźķģŹńĮ«' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'ńŁ¢ńĢźķģŹńĮ«ń”üńö©µłÉÕŖ¤',
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
   * µĀ╝Õ╝ÅÕī¢ńŁ¢ńĢźÕōŹÕ║ö
   */
  private formatPolicyResponse(policy: PermissionPolicyConfig & { id: string; createdAt: Date; updatedAt: Date }): PolicyResponseDto {
    return {
      id: policy.id,
      type: policy.type as PolicyType,
      name: policy.name,
      description: policy.description ?? undefined,
      config: policy.config as Record<string, unknown>,
      permissions: ((policy.permissions || []) as any),
      enabled: policy.enabled,
      priority: policy.priority,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}
