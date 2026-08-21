import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ description: 'VIP 等级 ID' })
  @IsString()
  vipTierId: string;

  @ApiProperty({ description: '时长定价 ID' })
  @IsString()
  durationPricingId: string;

  @ApiProperty({ description: '交易类型', enum: ['JSAPI', 'NATIVE', 'MWEB', 'APP'], default: 'JSAPI' })
  @IsIn(['JSAPI', 'NATIVE', 'MWEB', 'APP'])
  tradeType: string = 'JSAPI';

  @ApiPropertyOptional({ description: '用户 openid（JSAPI 必传）' })
  @IsOptional()
  @IsString()
  openid?: string;

  @ApiPropertyOptional({ description: '客户端 IP' })
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiPropertyOptional({ description: '支付成功后跳转回的前端 URL（MWEB 必传）' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
