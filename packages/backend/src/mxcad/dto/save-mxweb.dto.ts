import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

/**
 * 保存 mxweb 文件请求体 DTO
 */
export class SaveMxwebDto {
  @ApiProperty({
    description: 'mxweb 文件',
    type: 'string',
    format: 'binary',
  })
  file: any;

  @ApiProperty({
    description: '提交信息',
    required: false,
    example: '保存图纸修改',
  })
  @IsString()
  @IsOptional()
  commitMessage?: string;
}
