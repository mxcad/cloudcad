import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
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

  @ApiPropertyOptional({ description: '是否允许接收者加入实时协同', default: false })
  @IsOptional()
  @IsBoolean()
  collaborationEnabled?: boolean;
}
