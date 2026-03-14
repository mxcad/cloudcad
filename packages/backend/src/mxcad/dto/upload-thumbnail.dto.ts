import { ApiProperty } from '@nestjs/swagger';

/**
 * 上传缩略图请求体 DTO
 */
export class UploadThumbnailDto {
  @ApiProperty({
    description: '缩略图文件',
    type: 'string',
    format: 'binary',
  })
  file: any;
}
