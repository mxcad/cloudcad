import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

/**
 * 上传外部参照文件 DTO
 */
export class UploadExtReferenceFileDto {
  @ApiProperty({
    description: '上传的文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: Express.Multer.File;

  @ApiProperty({
    description: '文件哈希值（用于 Multer 文件名生成）',
    example: '25e89b5adf19984330f4e68b0f99db64',
    required: false,
  })
  @IsString()
  @IsOptional()
  hash?: string;

  @ApiProperty({
    description: '源图纸文件的节点 ID（FileSystemNode ID）',
    example: 'cml8t8wg60004ucufd7pb3sq6',
    required: false,
  })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiProperty({
    description: '外部参照文件名（含扩展名）',
    example: 'ref1.dwg',
  })
  @IsString()
  @IsNotEmpty()
  ext_ref_file: string;

  @ApiProperty({
    description: '是否更新 mxweb_preloading.json（默认 false）',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  updatePreloading?: boolean;
}
