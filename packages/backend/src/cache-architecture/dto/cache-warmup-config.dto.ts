import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsArray,
  IsString,
  IsOptional,
} from 'class-validator';

/**
 * 缓存预热配置 DTO
 */
export class CacheWarmupConfigDto {
  @ApiProperty({ description: '是否启用预热' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: '预热时间（cron 表达式）' })
  @IsString()
  schedule: string;

  @ApiProperty({ description: '热点数据阈值（次/分钟）' })
  @IsNumber()
  hotDataThreshold: number;

  @ApiProperty({ description: '最大预热数据量' })
  @IsNumber()
  maxWarmupSize: number;

  @ApiProperty({ description: '预热数据类型' })
  @IsArray()
  @IsString({ each: true })
  dataTypes: string[];
}

/**
 * 更新预热配置 DTO
 */
export class UpdateWarmupConfigDto {
  @ApiProperty({ description: '是否启用预热', required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ description: '预热时间（cron 表达式）', required: false })
  @IsOptional()
  @IsString()
  schedule?: string;

  @ApiProperty({ description: '热点数据阈值（次/分钟）', required: false })
  @IsOptional()
  @IsNumber()
  hotDataThreshold?: number;

  @ApiProperty({ description: '最大预热数据量', required: false })
  @IsOptional()
  @IsNumber()
  maxWarmupSize?: number;

  @ApiProperty({ description: '预热数据类型', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataTypes?: string[];
}

/**
 * 触发预热请求 DTO
 */
export class TriggerWarmupDto {
  @ApiProperty({ description: '数据类型', required: false })
  @IsOptional()
  @IsString()
  dataType?: string;

  @ApiProperty({ description: '数据 ID 列表', required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  ids?: number[];
}

/**
 * 预热历史记录 DTO
 */
export class WarmupHistoryDto {
  @ApiProperty({ description: '缓存键' })
  key: string;

  @ApiProperty({ description: '最后预热时间' })
  lastWarmup: Date;
}

/**
 * 预热统计 DTO
 */
export class WarmupStatsDto {
  @ApiProperty({ description: '预热配置' })
  config: CacheWarmupConfigDto;

  @ApiProperty({ description: '历史记录数量' })
  historySize: number;

  @ApiProperty({ description: '最后预热时间', required: false })
  lastWarmup?: Date;
}

/**
 * 预热响应 DTO
 */
export class WarmupResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '预热数量' })
  count: number;

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;
}
