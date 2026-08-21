import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreateDurationPricingDto {
  @ApiProperty({ description: '月数' })
  @IsInt()
  @Min(1)
  months: number;

  @ApiProperty({ description: '倍率（万分比，如10000=1.0, 9000=0.9）' })
  @IsInt()
  @Min(1)
  multiplierBps: number;

  @ApiProperty({ description: '显示名（如"1个月"、"3个月"）' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
