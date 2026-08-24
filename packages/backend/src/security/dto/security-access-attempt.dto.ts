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
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 加白 / 拉黑请求体：直接传 IP（聚合视图按 IP 操作，无需记录 id） */
export class SecurityIpActionDto {
  @ApiProperty({
    description: '精确 IP 或 CIDR（含 IPv6），如 203.0.113.7 或 203.0.113.0/24',
    example: '203.0.113.7',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ip: string;
}

/** 高危访问尝试：按 IP 聚合后的列表项 */
export class SecurityAccessAttemptAggregateDto {
  @ApiProperty({ description: 'IP 地址（归一化后）', example: '203.0.113.7' })
  ip: string;

  @ApiProperty({ description: '首次尝试时间' })
  firstSeen: Date;

  @ApiProperty({ description: '最近尝试时间' })
  lastSeen: Date;

  @ApiProperty({ description: '尝试总次数' })
  count: number;

  @ApiProperty({
    description: '各拒绝原因分布（reason -> 次数）',
    example: { ip_not_allowed: 3 },
  })
  reasons: Record<string, number>;

  @ApiPropertyOptional({
    description: '最近一次尝试使用的账号（可能为扫描器瞎填）',
    nullable: true,
  })
  account: string | null;

  @ApiPropertyOptional({ description: '最近一次尝试的 User-Agent', nullable: true })
  userAgent: string | null;

  @ApiProperty({ description: '当前是否已在管理员 IP 白名单中' })
  inWhitelist: boolean;

  @ApiProperty({ description: '当前是否已在 IP 黑名单中' })
  inBlacklist: boolean;
}

export class ListSecurityAccessAttemptQueryDto {
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
    description: '搜索关键词：模糊匹配 IP / 账号',
    example: '203.0.113',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class SecurityAccessAttemptListResponseDto {
  @ApiProperty({ type: [SecurityAccessAttemptAggregateDto] })
  items: SecurityAccessAttemptAggregateDto[];

  @ApiProperty({ description: '总 IP 数（去重后）' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页条数' })
  pageSize: number;
}
