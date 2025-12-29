import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 上传外部参照文件 DTO
 */
export class UploadExtReferenceDto {
  @ApiProperty({
    description: '源图纸文件的哈希值（32位十六进制）',
    example: '25e89b5adf19984330f4e68b0f99db64',
  })
  @IsString()
  @IsNotEmpty()
  src_dwgfile_hash: string;

  @ApiProperty({
    description: '外部参照文件名（含扩展名）',
    example: 'ref1.dwg',
  })
  @IsString()
  @IsNotEmpty()
  ext_ref_file: string;
}