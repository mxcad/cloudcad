import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RefundDto {
  @ApiProperty({ description: '订单号' })
  @IsString()
  orderNo: string;

  @ApiProperty({ description: '退款原因', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
