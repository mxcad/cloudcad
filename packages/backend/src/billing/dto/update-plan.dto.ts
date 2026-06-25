import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsIn, IsBoolean, Min, Max } from 'class-validator';

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: '套餐名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '时长（天）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  durationDays?: number;

  @ApiPropertyOptional({ description: '价格（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: '原价（分）', type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  originalPrice?: number | null;

  @ApiPropertyOptional({ description: '会员等级', enum: ['FREE', 'PRO'] })
  @IsOptional()
  @IsIn(['FREE', 'PRO'])
  tier?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否上架' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '功能列表', type: Object })
  @IsOptional()
  features?: any;
}
