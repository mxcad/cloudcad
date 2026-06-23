import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsInt, IsIn, Min, Max } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ description: '套餐名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '时长（天）' })
  @IsInt()
  @Min(1)
  @Max(36500)
  durationDays: number;

  @ApiProperty({ description: '价格（分）' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: '原价（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  originalPrice?: number | null;

  @ApiProperty({ description: '会员等级', enum: ['FREE', 'PRO'] })
  @IsIn(['FREE', 'PRO'])
  tier: string;

  @ApiProperty({ description: '排序' })
  @IsInt()
  sortOrder: number;

  @ApiPropertyOptional({ description: '功能列表' })
  @IsOptional()
  features?: any;
}
