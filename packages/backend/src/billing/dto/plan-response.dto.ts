import { ApiProperty } from '@nestjs/swagger';
import { MembershipTier } from '../enums/billing.enum';

export class PlanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  durationDays: number;

  @ApiProperty()
  priceYuan: number;

  @ApiProperty({ required: false, nullable: true })
  originalPriceYuan: number | null;

  @ApiProperty({ enum: MembershipTier })
  tier: MembershipTier;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ required: false, nullable: true })
  features: Record<string, any> | null;

  @ApiProperty()
  isActive: boolean;
}
