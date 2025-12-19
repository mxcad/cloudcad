import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class FileExistDto {
  @ApiProperty({ description: '原始文件名（含扩展名）' })
  @IsString()
  filename: string;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  fileHash: string;
}