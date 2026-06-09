import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Length } from 'class-validator';

export class CreateDrawingDto {
  @ApiProperty({ description: '父文件夹节点ID' })
  @IsString()
  parentId: string;

  @ApiPropertyOptional({ description: '图纸名称（默认：新建图纸）', example: '新建图纸' })
  @IsString()
  @IsOptional()
  @Length(1, 100)
  name?: string;
}
