import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateShareDto {
  @ApiPropertyOptional({ description: '过期时间（ISO 日期），传 null 改为永不过期', nullable: true })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}
