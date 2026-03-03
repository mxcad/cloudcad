import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

/**
 * 文件上传 DTO
 */
export class UploadFileDto {
  @ApiProperty({ description: '文件名称' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件内容（base64编码）', required: false })
  @IsString()
  @IsOptional()
  fileContent?: string;

  @ApiProperty({ description: '父节点ID' })
  @IsString()
  parentId: string;
}
