import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class FileExistDto {
  @ApiProperty({ description: '原始文件名（含扩展名）' })
  @IsString()
  filename: string;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  fileHash: string;

  @ApiProperty({ description: '项目ID（用于文件系统关联）', required: false })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({ description: '父文件夹ID（用于文件系统关联）', required: false })
  @IsString()
  @IsOptional()
  parentId?: string;
}