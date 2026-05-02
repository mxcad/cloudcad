import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UploadExtReferenceDto {
  @ApiProperty({
    description: '源图纸文件的哈希值（主图纸文件的 hash）',
    example: '4b298dd48355af1202b532fc4d051658',
  })
  @IsString()
  @IsNotEmpty()
  srcFileHash!: string;

  @ApiProperty({
    description: '外部参照文件名（含扩展名）',
    example: 'A1.dwg',
  })
  @IsString()
  @IsNotEmpty()
  extRefFile!: string;

  @ApiProperty({
    description: '文件哈希值（可选，用于秒传检查）',
    required: false,
  })
  @IsString()
  @IsOptional()
  hash?: string;
}
