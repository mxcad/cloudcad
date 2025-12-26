import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class FileExistDto {
  @ApiProperty({ description: '原始文件名（含扩展名）' })
  @IsString()
  filename: string;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  fileHash: string;

  @ApiProperty({ description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）', required: false })
  @IsString()
  @IsOptional()
  nodeId?: string;
}