import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 上传外部参照文件 DTO
 */
export class UploadExtReferenceDto {
  @ApiProperty({
    description: '上传的文件',
    type: 'string',
    format: 'binary',
  })
  file: any;

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
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @ApiProperty({
    description: '外部参照文件名（含扩展名）',
    example: 'ref1.dwg',
  })
  @IsString()
  @IsNotEmpty()
  ext_ref_file: string;
}
