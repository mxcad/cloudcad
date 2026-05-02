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

import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsObject,
  IsEnum,
  IsArray,
} from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
import { CreatePolicyDto } from './create-policy.dto';

/**
 * 更新策略 DTO
 */
export class UpdatePolicyDto extends PartialType(
  OmitType(CreatePolicyDto, ['type'] as const)
) {
  @ApiPropertyOptional({
    description: '策略类型',
    enum: PolicyType,
  })
  @IsOptional()
  @IsEnum(PolicyType)
  type?: PolicyType;

  @ApiPropertyOptional({
    description: '策略名称',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: '策略描述',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '策略配置',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '关联的权限',
    enum: PrismaPermission,
    isArray: true,
  })
  @IsOptional()
  @IsEnum(PrismaPermission, { each: true })
  @IsArray()
  permissions?: PrismaPermission[];

  @ApiPropertyOptional({
    description: '是否启用',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: '优先级',
  })
  @IsOptional()
  @IsNumber()
  priority?: number;
}
