import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ description: '文件夹名称', example: '设计图纸' })
  @IsString()
  @Length(1, 100)
  name: string;
}
