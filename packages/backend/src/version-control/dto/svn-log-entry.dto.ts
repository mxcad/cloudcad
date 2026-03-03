import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SvnLogPathDto } from './svn-log-path.dto';

/**
 * SVN 提交记录条目 DTO
 */
export class SvnLogEntryDto {
  @ApiProperty({
    description: '修订版本号',
    example: 123,
  })
  revision: number;

  @ApiProperty({
    description: '提交作者',
    example: 'user@example.com',
  })
  author: string;

  @ApiProperty({
    description: '提交日期',
    type: 'string',
    format: 'date-time',
    example: '2026-03-03T10:30:00.000Z',
  })
  date: Date;

  @ApiProperty({
    description: '提交消息',
    example: 'Update drawing file',
  })
  message: string;

  @ApiPropertyOptional({
    description: '提交用户名称（从提交信息中解析）',
    example: '张三',
  })
  userName?: string;

  @ApiPropertyOptional({
    description: '变更路径列表',
    type: [SvnLogPathDto],
  })
  paths?: SvnLogPathDto[];
}
