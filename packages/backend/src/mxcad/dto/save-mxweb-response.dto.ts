import { ApiProperty } from '@nestjs/swagger';

/**
 * 保存 mxweb 文件响应 DTO
 */
export class SaveMxwebResponseDto {
  @ApiProperty({
    description: '节点 ID',
    type: String,
  })
  nodeId: string;

  @ApiProperty({
    description: '文件路径',
    type: String,
  })
  path: string;
}
