import { ApiProperty } from '@nestjs/swagger';

/**
 * 文件存在检查响应 DTO
 */
export class FileExistResponseDto {
  @ApiProperty({
    description: '文件是否已存在（秒传）',
    type: Boolean,
  })
  exists: boolean;

  @ApiProperty({
    description: '已存在文件的节点 ID（秒传时返回）',
    type: String,
    required: false,
  })
  nodeId?: string;
}
