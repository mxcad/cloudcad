import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { MembershipTier } from '../enums/billing.enum';

export class CreatePlanDto {
  @ApiProperty({ description: '套餐名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '时长（天）' })
  @IsNumber()
  @Min(1)
  @Max(36500)
  durationDays: number;

  @ApiProperty({ description: '价格（分）' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: '原价（分）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number | null;

  @ApiProperty({ description: '会员等级', enum: [MembershipTier.PRO, MembershipTier.ENTERPRISE] })
  @IsEnum(MembershipTier)
  tier: string;

  @ApiProperty({ description: '排序' })
  @IsNumber()
  sortOrder: number;

  @ApiPropertyOptional({ description: '功能列表' })
  @IsOptional()
  features?: any;
}
