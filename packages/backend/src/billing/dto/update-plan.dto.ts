import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: '套餐名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '时长（天）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(36500)
  durationDays?: number;

  @ApiPropertyOptional({ description: '价格（分）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: '原价（分）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number | null;

  @ApiPropertyOptional({ description: '会员等级' })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否上架' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '功能列表' })
  @IsOptional()
  features?: any;
}
