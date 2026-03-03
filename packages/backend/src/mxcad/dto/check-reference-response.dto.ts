import { ApiProperty } from '@nestjs/swagger';

/**
 * 外部参照存在检查响应 DTO
 */
export class CheckReferenceResponseDto {
  @ApiProperty({
    description: '文件是否存在',
    type: Boolean,
  })
  exists: boolean;
}
