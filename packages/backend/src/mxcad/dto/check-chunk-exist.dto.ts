import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

/**
 * 检查分片是否存在请求 DTO
 */
export class CheckChunkExistDto {
  @ApiProperty({
    description: '文件 MD5 哈希值',
    example: '25e89b5adf19984330f4e68b0f99db64',
  })
  @IsString()
  @IsNotEmpty()
  fileHash: string;

  @ApiProperty({
    description: '原始文件名',
    example: 'drawing.dwg',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
    example: 'clx1234567890',
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @ApiProperty({
    description: '分片索引',
    example: 0,
  })
  @IsNumber()
  @IsNotEmpty()
  chunk: number;

  @ApiProperty({
    description: '总分片数量',
    example: 10,
  })
  @IsNumber()
  @IsNotEmpty()
  chunks: number;

  @ApiProperty({
    description: '分片大小（字节）',
    example: 1048576,
  })
  @IsNumber()
  @IsNotEmpty()
  size: number;
}
