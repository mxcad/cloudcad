import { ApiProperty } from '@nestjs/swagger';
import { AuditAction, ResourceType } from '@prisma/client';

export class AuditLogUserDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;
}

export class AuditLogDto {
  @ApiProperty({ description: '审计日志 ID' })
  id: string;

  @ApiProperty({ description: '操作类型', enum: AuditAction })
  action: AuditAction;

  @ApiProperty({ description: '资源类型', enum: ResourceType })
  resourceType: ResourceType;

  @ApiProperty({ description: '资源 ID', required: false })
  resourceId?: string;

  @ApiProperty({ description: '操作用户 ID' })
  userId: string;

  @ApiProperty({ description: '详细信息（JSON 格式）', required: false })
  details?: string;

  @ApiProperty({ description: 'IP 地址', required: false })
  ipAddress?: string;

  @ApiProperty({ description: '用户代理', required: false })
  userAgent?: string;

  @ApiProperty({ description: '操作是否成功' })
  success: boolean;

  @ApiProperty({ description: '错误信息', required: false })
  errorMessage?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '用户信息', type: AuditLogUserDto })
  user: AuditLogUserDto;
}

export class AuditLogListResponseDto {
  @ApiProperty({ description: '审计日志列表', type: [AuditLogDto] })
  logs: AuditLogDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  limit: number;

  @ApiProperty({ description: '总页数' })
  totalPages: number;
}

export class AuditStatisticsResponseDto {
  @ApiProperty({ description: '总记录数' })
  total: number;

  @ApiProperty({ description: '成功记录数' })
  successCount: number;

  @ApiProperty({ description: '失败记录数' })
  failureCount: number;

  @ApiProperty({ description: '成功率' })
  successRate: number;

  @ApiProperty({ description: '操作类型统计', example: {} })
  actionStats: Record<string, number>;
}

export class CleanupResponseDto {
  @ApiProperty({ description: '提示信息' })
  message: string;

  @ApiProperty({ description: '删除的记录数' })
  deletedCount: number;
}
