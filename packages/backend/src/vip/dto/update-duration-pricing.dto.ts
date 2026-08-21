import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

export class UpdateDurationPricingDto {
  @ApiPropertyOptional({ description: '月数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  months?: number;

  @ApiPropertyOptional({ description: '倍率（万分比，如10000=1.0）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  multiplierBps?: number;

  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
