///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved. The code, documentation, and related materials of this
// software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications
// that include this software must include the following copyright statement.
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

export class CreateIpWhitelistEntryDto {
  @ApiProperty({
    description: '精确 IP 或 CIDR（含 IPv6），如 203.0.113.7 或 203.0.113.0/24',
    example: '203.0.113.0/24',
  })
  @IsString()
  @IsNotEmpty()
  ip: string;

  @ApiProperty({ description: '加白原因', example: '公司出口 IP' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: '到期时间（ISO 8601）；不传 = 永久生效',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ListIpWhitelistQueryDto {
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
    description: '搜索关键词：模糊匹配 IP/CIDR、加白原因、操作人 ID',
    example: '203.0.113',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class IpWhitelistEntryResponseDto {
  @ApiProperty({
    description:
      '条目 ID；本地文件条目为 "file:<ip>"（不可通过接口移除，需直接编辑服务器文件）',
  })
  id: string;

  @ApiProperty({ description: '精确 IP 或 CIDR', example: '203.0.113.0/24' })
  ip: string;

  @ApiProperty({
    description: '来源：manual（界面添加）| file（服务器本地文件）',
    example: 'manual',
  })
  source: string;

  @ApiProperty({ description: '加白原因' })
  reason: string;

  @ApiProperty({ description: '操作人用户 ID（文件条目为 local-file）' })
  createdBy: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: '到期时间；null = 永久生效',
    nullable: true,
  })
  expiresAt: Date | null;
}

export class IpWhitelistListResponseDto {
  @ApiProperty({ type: [IpWhitelistEntryResponseDto] })
  items: IpWhitelistEntryResponseDto[];

  @ApiProperty({ description: '总条数（含本地文件条目）' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页条数' })
  pageSize: number;
}
