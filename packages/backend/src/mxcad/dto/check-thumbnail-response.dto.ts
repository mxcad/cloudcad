import { ApiProperty } from '@nestjs/swagger';

/**
 * 检查缩略图响应 DTO
 */
export class CheckThumbnailResponseDto {
  @ApiProperty({
    description: '响应状态码',
    example: 0,
    type: Number,
  })
  code: number;

  @ApiProperty({
    description: '响应消息',
    example: 'ok',
    type: String,
  })
  message: string;

  @ApiProperty({
    description: '缩略图是否存在',
    type: Boolean,
  })
  exists: boolean;
}
