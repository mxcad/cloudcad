import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONVERSION_FAILURE_CATEGORIES,
  type ConversionFailureCategory,
} from '@cloudcad/contracts';

/**
 * 转换任务类型（#467）
 * - open：打开/预览（建 node.taskId，云端记录，面板「打开」）
 * - download：历史版本 / 导出下载（v1 仍走既有同步端点，见 UnifiedConversionService.submitTask）
 */
export type ConversionTaskType = 'open' | 'download';

export class SubmitConversionTaskDto {
  @ApiProperty({
    description: '任务类型',
    enum: ['open', 'download'],
    example: 'open',
  })
  type: ConversionTaskType;

  @ApiProperty({ description: '转换目标' })
  target: {
    /** 打开类型：文件节点 ID（登录用户打开项目文件 → 建 node，云端记录） */
    nodeId?: string;
    /** 下载类型：历史版本号 */
    version?: string;
    /** 下载类型：目标格式 */
    format?: string;
  };

  @ApiPropertyOptional({
    description: '优先级 1=打开（命脉）2=导出 3=后台',
    example: 1,
  })
  priority?: 1 | 2 | 3;
}

export class SubmitConversionTaskResponseDto {
  @ApiProperty({ description: '转换任务 ID' })
  taskId: string;

  @ApiPropertyOptional({ description: '关联节点 ID（打开类型）' })
  nodeId?: string;

  @ApiProperty({ description: '是否异步执行', example: true })
  async: boolean;
}

export class ConversionTaskItemDto {
  @ApiProperty({ description: '节点 ID' })
  nodeId: string;

  @ApiProperty({ description: '文件名' })
  name: string;

  @ApiProperty({ description: '节点文件状态', example: 'PROCESSING' })
  fileStatus: string;

  @ApiPropertyOptional({ description: '转换任务 ID' })
  taskId?: string;

  @ApiPropertyOptional({
    description:
      '任务执行状态 (PENDING|PROCESSING|COMPLETED|FAILED|CANCELLED|UNKNOWN)',
  })
  taskStatus?: string;

  @ApiPropertyOptional({
    description:
      '转换进度 0-100（仅进行中任务，S4-2；黑盒未上报时为 undefined）',
    example: 42,
  })
  progress?: number;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;

  @ApiPropertyOptional({
    description:
      '失败性质分类（仅 FAILED 有意义）：content-error=内容性永久失败（重试无意义，面板据此门控重试）；其余为环境性可重试（timeout/killed/not-started/output-unparseable/unknown）',
    enum: CONVERSION_FAILURE_CATEGORIES,
  })
  errorCategory?: ConversionFailureCategory;

  @ApiPropertyOptional({
    description:
      '排队位置（S6-5）：任务在优先级池 acquire 队列中的 1-based 序号；仅排队中（PENDING）任务有意义，面板展示「第 N 位」',
    example: 2,
  })
  queuePosition?: number;

  @ApiProperty({ description: '更新时间（ISO 字符串）' })
  updatedAt: string;
}

export class ConversionTaskListResponseDto {
  @ApiProperty({ type: [ConversionTaskItemDto] })
  tasks: ConversionTaskItemDto[];

  @ApiProperty({ description: '任务总数' })
  total: number;
}

/**
 * 转换历史分页查询（#476）：已完成（COMPLETED）任务，供面板「转换·历史」区块滚动加载。
 * 与 listTasks（进行中/失败，实时轮询）互补：历史为只读终态数据，offset 分页稳定。
 */
export class ConversionHistoryQueryDto {
  @ApiPropertyOptional({
    description: '每页数量（默认 20，最大 50）',
    example: 20,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: '偏移量（分页游标，默认 0）',
    example: 0,
  })
  offset?: number;

  @ApiPropertyOptional({
    description: '按文件名模糊搜索（DB 侧 contains，空=不过滤）',
    example: 'dwg',
  })
  search?: string;
}

export class ConversionHistoryResponseDto {
  @ApiProperty({ type: [ConversionTaskItemDto] })
  tasks: ConversionTaskItemDto[];

  @ApiProperty({ description: '已完成任务总数' })
  total: number;

  @ApiProperty({ description: '是否还有更多（offset + tasks.length < total）' })
  hasMore: boolean;
}

/**
 * 失败任务重试响应：重试 = 原图纸原地重新排队（不重新上传、节点保留、不占配额），
 * 生成新的 taskId；前端按 nodeId 合并同一节点的历史任务。
 */
export class RetryConversionTaskResponseDto {
  @ApiProperty({ description: '重试后生成的新转换任务 ID' })
  taskId: string;

  @ApiProperty({ description: '重试的原节点 ID（前端据此合并同一节点的任务）' })
  nodeId: string;
}

/**
 * 当前调用者的转换配额（ADR-0043）：本窗口已用次数 / 上限。
 * 登录用户按 userId 窗口，游客按 IP 窗口（scope 区分）。
 */
export class ConversionQuotaDto {
  @ApiProperty({ description: '本窗口转换次数上限（unlimited 时为 0）' })
  limit: number;

  @ApiProperty({ description: '本窗口已用次数' })
  used: number;

  @ApiProperty({ description: '本窗口剩余次数（unlimited 时为 0）' })
  remaining: number;

  @ApiProperty({ description: '窗口小时数' })
  windowHours: number;

  @ApiProperty({ description: '是否不限额（limit <= 0）', example: false })
  unlimited: boolean;

  @ApiProperty({ nullable: true, description: '窗口重置时刻（ISO 字符串）' })
  resetsAt: string | null;

  @ApiProperty({ description: '窗口归属：ip（游客）或 user（登录）' })
  scope: 'ip' | 'user';
}
