import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class RepayOrderDto {
  @ApiPropertyOptional({ description: '交易类型', enum: ['JSAPI', 'NATIVE', 'MWEB', 'APP'] })
  @IsOptional()
  @IsIn(['JSAPI', 'NATIVE', 'MWEB', 'APP'])
  tradeType?: string;

  @ApiPropertyOptional({ description: '支付成功后跳转回的前端 URL（MWEB 必传）' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @ApiPropertyOptional({ description: '客户端 IP' })
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiPropertyOptional({ description: '用户 openid（JSAPI 必传）' })
  @IsOptional()
  @IsString()
  openid?: string;
}
