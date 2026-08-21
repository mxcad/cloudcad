import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class ReviewRefundDto {
  @ApiPropertyOptional({ description: '审核意见', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: '是否回退会员等级和有效期（默认true）', default: true })
  @IsOptional()
  @IsBoolean()
  revertMembership?: boolean = true;
}
