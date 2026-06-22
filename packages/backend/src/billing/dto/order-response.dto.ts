import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../enums/billing.enum';

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderNo: string;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  gateway: string;

  @ApiProperty({ required: false })
  gatewayOrderId?: string;

  @ApiProperty({ required: false })
  codeUrl?: string;

  @ApiProperty({ required: false })
  payParams?: Record<string, any>;

  @ApiProperty({ required: false })
  paidAt?: Date;

  @ApiProperty()
  createdAt: Date;
}
