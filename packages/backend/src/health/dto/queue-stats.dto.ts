///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';

/**
 * 转换队列统计（来源：ProcessPoolExecutor.getQueueStats → RateLimiter.getStats）
 */
export class QueueStatsDto {
  @ApiProperty({ description: '队列总长度（各优先级排队任务数之和）' })
  queueLength: number;

  @ApiProperty({ description: '紧急优先级队列长度' })
  criticalPriorityQueueLength: number;

  @ApiProperty({ description: '高优先级队列长度' })
  highPriorityQueueLength: number;

  @ApiProperty({ description: '低优先级队列长度' })
  lowPriorityQueueLength: number;

  @ApiProperty({ description: '运行中任务数' })
  runningCount: number;

  @ApiProperty({ description: '最大并发数' })
  maxConcurrent: number;

  @ApiProperty({ description: '任务执行超时阈值(ms)' })
  timeout: number;
}
