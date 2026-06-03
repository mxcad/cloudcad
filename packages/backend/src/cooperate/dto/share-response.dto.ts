import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShareResponseDto {
  @ApiProperty({ description: '分享 token' })
  token: string;

  @ApiProperty({ description: '分享链接路径' })
  url: string;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt: Date | null;
}

export class ResolveShareResponseDto {
  @ApiProperty({ description: '文件 ID' })
  fileId: string;
}

export class ResolveShareNodeResponseDto {
  @ApiProperty({ description: '文件名' })
  name: string;

  @ApiProperty({ description: '文件 hash' })
  fileHash: string;

  @ApiProperty({ description: '文件路径' })
  path: string;

  @ApiProperty({ description: '父节点 ID', nullable: true, type: String })
  parentId: string | null;

  @ApiProperty({ description: '文件 ID' })
  id: string;

  @ApiPropertyOptional({ description: '删除时间', nullable: true, type: String })
  deletedAt: string | null;

  @ApiPropertyOptional({ description: '更新时间' })
  updatedAt: string;
}