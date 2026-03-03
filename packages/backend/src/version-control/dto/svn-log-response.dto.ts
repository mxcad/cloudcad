import { ApiProperty } from '@nestjs/swagger';
import { SvnLogEntryDto } from './svn-log-entry.dto';

/**
 * SVN 提交历史响应 DTO
 */
export class SvnLogResponseDto {
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

  @ApiProperty({
    description: '提交记录条目列表',
    type: [SvnLogEntryDto],
  })
  entries: SvnLogEntryDto[];
}
