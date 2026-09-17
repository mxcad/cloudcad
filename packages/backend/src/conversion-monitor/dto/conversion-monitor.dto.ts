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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    nullable: true,
  })
  processPool: {
    queueLength: number;
    criticalPriorityQueueLength: number;
    highPriorityQueueLength: number;
    lowPriorityQueueLength: number;
    runningCount: number;
    maxConcurrent: number;
    timeout: number;
    duration: {
      sampleCount: number;
      p50DurationMs: number | null;
      p95DurationMs: number | null;
      p50WaitMs: number | null;
      p95WaitMs: number | null;
    };
  } | null;

  @ApiPropertyOptional({
    description: 'conversion-service 模式当前统计（其他模式或拉取失败为 null）',
    nullable: true,
  })
  conversionService: {
    tasks: {
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    };
    duration: {
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
    };
    workers: Record<
      string,
      {
        label: string;
        maxConcurrent: number;
        currentMax: number;
        running: number;
        waiting: number;
        autoScale: boolean;
        backlogSince: number | null;
      }
    >;
  } | null;

  @ApiPropertyOptional({
    description: 'conversion-service 拉取失败原因（成功为 null）',
    nullable: true,
  })
  conversionServiceError: string | null;

  @ApiProperty({
    description: '24h 历史采样（30s 间隔，旧→新；重启后为空）',
  })
  history: {
    t: number;
    queueDepth: number | null;
    running: number | null;
    p95DurationMs: number | null;
  }[];

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
