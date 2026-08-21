import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateUserMembershipDto {
  @ApiProperty({
    description: 'VIP 等级（0=VIP0, 1=VIP1, 2=VIP2, ...，填 0 则移除会员）',
    minimum: 0,
    maximum: 10,
    example: 2,
  })
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(10)
  tierLevel: number;

  @ApiProperty({
    description: '会员到期时间（ISO 8601 格式，不填表示永久有效）',
    required: false,
    example: '2027-12-31T23:59:59.000Z',
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({
    description: '从当前到期时间增减天数（正数延长，负数缩短，范围 -3650~3650，仅在 adjust 模式下使用）',
    required: false,
    minimum: -3650,
    maximum: 3650,
    example: 30,
  })
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(-3650)
  @Max(3650)
  adjustDays?: number;
}
