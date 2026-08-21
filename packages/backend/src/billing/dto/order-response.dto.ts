import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 创建订单 / 重新支付 的响应 DTO，与 BillingService.buildPayResponse 返回结构一致
export class OrderResponseDto {
  @ApiProperty({ description: '订单ID' })
  id: string;

  @ApiProperty({ description: '订单号' })
  orderNo: string;

  @ApiProperty({ description: 'VIP 等级 ID', type: String, nullable: true })
  vipTierId: string | null;

  @ApiProperty({ description: '购买月数', type: Number, nullable: true })
  months: number | null;

  @ApiProperty({ description: '订单金额（分）', type: Number })
  amount: number;

  @ApiProperty({ description: '订单状态', example: 'PENDING' })
  status: string;

  @ApiProperty({ description: '支付渠道（mock / wechat_pay）', example: 'mock' })
  gateway: string;

  @ApiProperty({ description: '支付渠道订单号', type: String, nullable: true })
  gatewayOrderId: string | null;

  @ApiPropertyOptional({ description: 'NATIVE 支付二维码链接', type: String, nullable: true })
  codeUrl?: string | null;

  @ApiPropertyOptional({ description: 'JSAPI 支付参数', type: Object, nullable: true })
  payParams?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'MWEB 跳转链接', type: String, nullable: true })
  redirectUrl?: string | null;

  @ApiProperty({ description: 'VIP 等级名称', example: 'VIP1' })
  vipTierName: string;

  @ApiProperty({ description: '时长描述', example: '3个月' })
  durationLabel: string;

  @ApiProperty({ description: '订单金额（元）', type: Number })
  priceYuan: number;

  @ApiProperty({ description: '创建时间', type: Date })
  createdAt: Date;
}
