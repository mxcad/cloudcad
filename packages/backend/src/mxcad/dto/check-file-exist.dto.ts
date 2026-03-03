import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

/**
 * 检查文件是否存在请求 DTO
 */
export class CheckFileExistDto {
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
    description: '文件大小（字节）',
    example: 1024567,
  })
  @IsNumber()
  @IsNotEmpty()
  fileSize: number;
}
