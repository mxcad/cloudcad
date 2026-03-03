import { ApiProperty } from '@nestjs/swagger';

/**
 * 上传文件响应 DTO
 */
export class UploadFileResponseDto {
  @ApiProperty({
    description: '上传文件的节点 ID',
    type: String,
    required: false,
  })
  nodeId?: string;

  @ApiProperty({
    description: '是否为图纸文件',
    type: Boolean,
    required: false,
  })
  tz?: boolean;
}
