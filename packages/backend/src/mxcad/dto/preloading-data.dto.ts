import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsArray } from 'class-validator';

export class PreloadingDataDto {
  @ApiProperty({ description: '是否为图纸' })
  @IsBoolean()
  tz: boolean;

  @ApiProperty({ description: '源文件哈希值' })
  @IsString()
  src_file_md5: string;

  @ApiProperty({ description: '图片列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ description: '外部参照列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  externalReference: string[];
}