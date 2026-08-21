import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUploadTokenDto {
  @ApiProperty({
    description:
      'storage-service 内相对路径，例如 202607/node1/a.dwg（对应 filesDataPath 下的相对路径）',
    example: '202607/node1/a.dwg',
  })
  @IsString()
  @IsNotEmpty()
  path: string;
}
