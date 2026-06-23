import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ description: '套餐 ID' })
  @IsString()
  planId: string;

  @ApiProperty({ description: '交易类型', enum: ['JSAPI', 'NATIVE', 'MWEB', 'APP'], default: 'JSAPI' })
  @IsIn(['JSAPI', 'NATIVE', 'MWEB', 'APP'])
  tradeType: string = 'JSAPI';

  @ApiProperty({ description: '用户 openid（JSAPI 必传）', required: false })
  @IsOptional()
  @IsString()
  openid?: string;

  @ApiProperty({ description: '客户端 IP', required: false })
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiProperty({ description: '支付成功后跳转回的前端 URL（MWEB 必传）', required: false })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
