import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TzDto {
  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  fileHash: string;
}
