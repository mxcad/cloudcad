import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShareDto {
  @ApiProperty({ description: '文件ID' })
  @IsString()
  fileId: string;

  @ApiPropertyOptional({ description: '过期时间（秒），null 表示永不过期' })
  @IsOptional()
  @IsNumber()
  @Min(60)
  expiresIn?: number;
}
