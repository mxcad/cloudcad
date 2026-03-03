import { ApiProperty } from '@nestjs/swagger';

/**
 * 上传缩略图响应数据 DTO
 */
export class UploadThumbnailDataDto {
  @ApiProperty({
    description: '文件名',
    type: String,
  })
  fileName: string;
}

/**
 * 上传缩略图响应 DTO
 */
export class UploadThumbnailResponseDto {
  @ApiProperty({
    description: '响应状态码',
    example: 0,
    type: Number,
  })
  code: number;

  @ApiProperty({
    description: '响应消息',
    example: '缩略图上传成功',
    type: String,
  })
  message: string;

  @ApiProperty({
    description: '响应数据',
    type: UploadThumbnailDataDto,
  })
  data: UploadThumbnailDataDto;
}
