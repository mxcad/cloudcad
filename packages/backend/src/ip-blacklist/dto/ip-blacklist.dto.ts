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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIpBlacklistEntryDto {
  @ApiProperty({
    description: '精确 IP 或 CIDR（含 IPv6），如 203.0.113.7 或 203.0.113.0/24',
    example: '203.0.113.0/24',
  })
  @IsString()
  @IsNotEmpty()
  ip: string;

  @ApiProperty({ description: '封禁原因', example: '撞库扫描' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: '到期时间（ISO 8601）；不传 = 永久封禁',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ListIpBlacklistQueryDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    description: '搜索关键词：模糊匹配 IP/CIDR、封禁原因、操作人 ID',
    example: '203.0.113',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class IpBlacklistEntryResponseDto {
  @ApiProperty({ description: '条目 ID' })
  id: string;

  @ApiProperty({ description: '精确 IP 或 CIDR', example: '203.0.113.0/24' })
  ip: string;

  @ApiProperty({
    description: '来源：manual（管理员手动）| auto（自动检测，预留）',
    example: 'manual',
  })
  source: string;

  @ApiProperty({ description: '封禁原因' })
  reason: string;

  @ApiProperty({ description: '操作人用户 ID' })
  createdBy: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: '到期时间；null = 永久封禁',
    nullable: true,
  })
  expiresAt: Date | null;
}

export class IpBlacklistListResponseDto {
  @ApiProperty({ type: [IpBlacklistEntryResponseDto] })
  items: IpBlacklistEntryResponseDto[];

  @ApiProperty({ description: '总条数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页条数' })
  pageSize: number;
}
