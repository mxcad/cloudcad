import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class ChunkExistDto {
  @ApiProperty({ description: '分片索引（从 0 开始）' })
  @IsNumber()
  chunk: number;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  fileHash: string;

  @ApiProperty({ description: '当前分片大小（字节）' })
  @IsNumber()
  size: number;

  @ApiProperty({ description: '总分片数量' })
  @IsNumber()
  chunks: number;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  filename: string;

  @ApiProperty({ description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）', required: false })
  @IsString()
  @IsOptional()
  nodeId?: string;
}