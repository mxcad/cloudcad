import { ApiProperty } from '@nestjs/swagger';

export class UploadTokenResponseDto {
  @ApiProperty({ description: '预签名 JWT，上传时放入 Authorization: Bearer <token>' })
  token: string;

  @ApiProperty({ description: '目标相对路径' })
  path: string;

  @ApiProperty({ description: '操作类型', enum: ['upload'] })
  operation: 'upload';

  @ApiProperty({ description: '令牌过期时间' })
  expiresAt: Date;
}
