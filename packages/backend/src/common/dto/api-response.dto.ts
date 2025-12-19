import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({
    description: '响应状态码',
    example: 'SUCCESS',
    enum: ['SUCCESS', 'ERROR'],
  })
  code: string;

  @ApiProperty({
    description: '响应消息',
    example: '操作成功',
  })
  message: string;

  @ApiProperty({
    description: '响应数据',
  })
  data: T;

  @ApiProperty({
    description: '响应时间戳',
    example: '2025-12-12T03:34:55.801Z',
  })
  timestamp: string;
}
