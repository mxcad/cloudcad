import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, Min, Max, IsObject } from 'class-validator';

export class CreateVipTierDto {
  @ApiProperty({ description: '等级（0=VIP0, 1=VIP1, ...）' })
  @IsInt()
  @Min(0)
  @Max(99)
  level: number;

  @ApiProperty({ description: '等级名称（VIP0/VIP1/...）' })
  @IsString()
  name: string;

  @ApiProperty({ description: '月基础价格（分）' })
  @IsInt()
  @Min(0)
  baseMonthlyPrice: number;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '配置项键值对' })
  @IsOptional()
  @IsObject()
  configs?: Record<string, unknown>;
}
