import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ManualCompleteDto {
  @ApiProperty({ description: '订单号' })
  @IsString()
  orderNo: string;
}
