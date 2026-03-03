import { ApiProperty } from '@nestjs/swagger';

/**
 * 分片存在检查响应 DTO
 */
export class ChunkExistResponseDto {
  @ApiProperty({
    description: '分片是否已存在',
    type: Boolean,
  })
  exists: boolean;
}
