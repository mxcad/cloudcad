import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

/**
 * 自动下单 DTO（EXE 一键购买 / `?auto=1` 入口）
 *
 * 与 {@link CreateOrderDto} 的区别：档位与时长由服务端按"最低付费档 + 1 个月"
 * 默认选择，前端不传 `vipTierId` / `durationPricingId`。
 * 服务端选择逻辑见 {@link BillingService.autoCreateOrder}。
 */
export class AutoCreateOrderDto {
  @ApiPropertyOptional({
    description: '交易类型',
    enum: ['JSAPI', 'NATIVE', 'MWEB', 'APP'],
    default: 'NATIVE',
  })
  @IsOptional()
  @IsIn(['JSAPI', 'NATIVE', 'MWEB', 'APP'])
  tradeType: string = 'NATIVE';

  @ApiPropertyOptional({ description: '支付成功后跳转回的前端 URL（MWEB 必传）' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
