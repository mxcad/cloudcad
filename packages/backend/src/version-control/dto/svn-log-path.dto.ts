import { ApiProperty } from '@nestjs/swagger';

/**
 * SVN 提交记录中的变更路径 DTO
 */
export class SvnLogPathDto {
  @ApiProperty({
    description: '变更动作类型',
    enum: ['A', 'M', 'D', 'R'],
    example: 'A',
  })
  action: 'A' | 'M' | 'D' | 'R';

  @ApiProperty({
    description: '路径类型',
    enum: ['file', 'dir'],
    example: 'file',
  })
  kind: 'file' | 'dir';

  @ApiProperty({
    description: '变更路径',
    example: '/path/to/file.dwg',
  })
  path: string;
}
