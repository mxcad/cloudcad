///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

/** process-pool 模式：耗时采样统计 */
export class ProcessPoolDurationDto {
  @ApiProperty({ description: '样本数' })
  sampleCount: number;

  @ApiProperty({ description: 'P50 耗时（ms）', nullable: true })
  p50DurationMs: number | null;

  @ApiProperty({ description: 'P95 耗时（ms）', nullable: true })
  p95DurationMs: number | null;

  @ApiProperty({ description: 'P50 等待时长（ms）', nullable: true })
  p50WaitMs: number | null;

  @ApiProperty({ description: 'P95 等待时长（ms）', nullable: true })
  p95WaitMs: number | null;
}

/** process-pool 模式当前统计 */
export class ProcessPoolStatsDto {
  @ApiProperty({ description: '队列长度' })
  queueLength: number;

  @ApiProperty({ description: '关键优先级队列长度' })
  criticalPriorityQueueLength: number;

  @ApiProperty({ description: '高优先级队列长度' })
  highPriorityQueueLength: number;

  @ApiProperty({ description: '低优先级队列长度' })
  lowPriorityQueueLength: number;

  @ApiProperty({ description: '运行中任务数' })
  runningCount: number;

  @ApiProperty({ description: '最大并发数' })
  maxConcurrent: number;

  @ApiProperty({ description: '超时时间（ms）' })
  timeout: number;

  @ApiProperty({
    description: '耗时采样统计',
    type: () => ProcessPoolDurationDto,
  })
  duration: ProcessPoolDurationDto;
}

/** conversion-service 模式：任务计数统计 */
export class ConversionServiceTasksDto {
  @ApiProperty({ description: '任务总数' })
  total: number;

  @ApiProperty({ description: '等待中任务数' })
  pending: number;

  @ApiProperty({ description: '处理中任务数' })
  processing: number;

  @ApiProperty({ description: '已完成任务数' })
  completed: number;

  @ApiProperty({ description: '失败任务数' })
  failed: number;
}

/** conversion-service 模式：耗时采样统计 */
export class ConversionServiceDurationDto {
  @ApiProperty({ description: '样本数' })
  sampleCount: number;

  @ApiProperty({ description: 'P50 耗时（ms）', nullable: true })
  p50Ms: number | null;

  @ApiProperty({ description: 'P95 耗时（ms）', nullable: true })
  p95Ms: number | null;
}

/** conversion-service 模式：单个 worker 统计 */
export class ConversionServiceWorkerDto {
  @ApiProperty({ description: 'worker 标识' })
  label: string;

  @ApiProperty({ description: '配置的最大并发数' })
  maxConcurrent: number;

  @ApiProperty({ description: '当前最大并发数' })
  currentMax: number;

  @ApiProperty({ description: '运行中任务数' })
  running: number;

  @ApiProperty({ description: '等待任务数' })
  waiting: number;

  @ApiProperty({ description: '是否自动扩缩容' })
  autoScale: boolean;

  @ApiProperty({
    description: '积压开始时间（epoch ms），无积压为 null',
    nullable: true,
  })
  backlogSince: number | null;
}

/**
 * conversion-service 模式当前统计
 *
 * workers 用 additionalProperties.$ref 引用 ConversionServiceWorkerDto，
 * 需 @ApiExtraModels 显式注册该 schema，否则生成悬空 $ref。
 */
@ApiExtraModels(ConversionServiceWorkerDto)
export class ConversionServiceStatsDto {
  @ApiProperty({
    description: '任务计数统计',
    type: () => ConversionServiceTasksDto,
  })
  tasks: ConversionServiceTasksDto;

  @ApiProperty({
    description: '耗时采样统计',
    type: () => ConversionServiceDurationDto,
  })
  duration: ConversionServiceDurationDto;

  @ApiProperty({
    description: 'worker 统计（按 worker key 索引）',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(ConversionServiceWorkerDto) },
  })
  workers: Record<string, ConversionServiceWorkerDto>;
}

/** 24h 历史采样点 */
export class ConversionQueueHistoryPointDto {
  @ApiProperty({ description: '采样时间（epoch ms）' })
  t: number;

  @ApiProperty({ description: '队列深度', nullable: true })
  queueDepth: number | null;

  @ApiProperty({ description: '运行中任务数', nullable: true })
  running: number | null;

  @ApiProperty({ description: 'P95 耗时（ms）', nullable: true })
  p95DurationMs: number | null;
}

/**
 * 转换队列监控统计（#406 / ADR-0058）
 *
 * 按 FUNCTION_EXECUTOR 模式返回对应数据块，其余为 null：
 * - process-pool：processPool（进程内 RateLimiter 统计 + 耗时）
 * - conversion-service：conversionService（远端服务统计，拉取失败时为 null + error）
 * - cloud-faas：两者均 null（无队列概念）
 */
export class ConversionMonitorStatsDto {
  @ApiProperty({
    description: '转换执行器模式',
    enum: ['process-pool', 'conversion-service', 'cloud-faas'],
  })
  mode: 'process-pool' | 'conversion-service' | 'cloud-faas';

  @ApiPropertyOptional({
    description: 'process-pool 模式当前统计（其他模式为 null）',
    type: () => ProcessPoolStatsDto,
    nullable: true,
  })
  processPool: ProcessPoolStatsDto | null;

  @ApiPropertyOptional({
    description: 'conversion-service 模式当前统计（其他模式或拉取失败为 null）',
    type: () => ConversionServiceStatsDto,
    nullable: true,
  })
  conversionService: ConversionServiceStatsDto | null;

  @ApiPropertyOptional({
    description: 'conversion-service 拉取失败原因（成功为 null）',
    type: String,
    nullable: true,
  })
  conversionServiceError: string | null;

  @ApiProperty({
    description: '24h 历史采样（30s 间隔，旧→新；重启后为空）',
    type: [ConversionQueueHistoryPointDto],
  })
  history: ConversionQueueHistoryPointDto[];

  @ApiProperty({ description: '本次统计生成时间（epoch ms）' })
  sampledAt: number;
}

/**
 * 监控任务明细（#478 监控 Tab 逐任务明细）：conversion-service 模式 proxy 远端
 * GET /v1/conversions/tasks（TaskRecord 子集）。
 * 命名 MonitorTask* 避免与 mxcad/conversion 的 ConversionTaskItemDto 冲突
 *（两者字段不同：本类是 conversion-service TaskRecord 子集，后者是 node 派生）。
 */
export class MonitorTaskItemDto {
  @ApiProperty({ description: '任务 ID' })
  id: string;

  @ApiPropertyOptional({ description: '任务类型（open/export/background 等）' })
  type?: string;

  @ApiProperty({
    description: '任务状态（pending/processing/completed/failed/cancelled）',
  })
  status: string;

  @ApiProperty({ description: '进度 0-100' })
  progress: number;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;

  @ApiProperty({ description: '更新时间（ISO 8601）' })
  updatedAt: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601，未开始为 null）' })
  startedAt: string | null;

  @ApiPropertyOptional({ description: '完成时间（ISO 8601，未完成为 null）' })
  completedAt: string | null;

  @ApiPropertyOptional({ description: '错误信息（失败时）' })
  error?: string;

  @ApiPropertyOptional({
    description: '内容 key（内容 hash + 源格式 + 目标格式派生）',
  })
  contentKey?: string;
}

/** 监控任务明细列表（#478 监控 Tab 数据源） */
export class MonitorTaskListDto {
  @ApiProperty({ type: [MonitorTaskItemDto], description: '任务明细' })
  items: MonitorTaskItemDto[];

  @ApiProperty({ description: '任务总数' })
  total: number;
}
