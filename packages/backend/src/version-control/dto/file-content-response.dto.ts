import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 文件内容响应 DTO
 */
export class FileContentResponseDto {
  @ApiProperty({
    description: '操作是否成功',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: '响应消息',
    example: '获取成功',
  })
  message: string;

  @ApiPropertyOptional({
    description: '文件内容（Base64 编码）',
    example: 'base64encodedcontent...',
  })
  content?: string;
}
