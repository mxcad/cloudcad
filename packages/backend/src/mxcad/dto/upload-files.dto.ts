import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

/**
 * 上传文件请求体 DTO
 */
export class UploadFilesDto {
  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  hash: string;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsNumber()
  size: number;

  @ApiProperty({
    description: '分片索引（分片上传时必填）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  chunk?: number;

  @ApiProperty({
    description: '总分片数量（分片上传时必填）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  chunks?: number;

  @ApiProperty({
    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiProperty({
    description: '源图纸哈希（外部参照上传时使用）',
    required: false,
  })
  @IsOptional()
  @IsString()
  src_dwgfile_hash?: string;
}