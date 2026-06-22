import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class QueryOrderDto {
  @ApiProperty({ description: '订单号' })
  @IsString()
  orderNo: string;
}
