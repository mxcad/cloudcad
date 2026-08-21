import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, Min, IsObject } from 'class-validator';

export class UpdateVipTierDto {
  @ApiPropertyOptional({ description: '等级名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '月基础价格（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  baseMonthlyPrice?: number;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '配置项键值对' })
  @IsOptional()
  @IsObject()
  configs?: Record<string, unknown>;
}
