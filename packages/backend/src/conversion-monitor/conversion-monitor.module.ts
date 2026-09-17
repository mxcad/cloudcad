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

import { Module } from '@nestjs/common';
import { ConversionMonitorController } from './conversion-monitor.controller';
import { ConversionMonitorService } from './conversion-monitor.service';
import { FunctionExecutorModule } from '../function-executor/function-executor.module';
import { PermissionModule } from '../permission/permission.module';

/**
 * 转换队列监控（#406 / ADR-0058）：
 * 取数只依赖 IFunctionExecutor seam（容器已选定 adapter：嵌入式读进程内统计 /
 * 独立服务代理远端 /v1/conversions/stats / 云函数无队列），30s 采样维护 24h
 * 内存环形缓冲，供管理员在系统监控页观察排队/并发/耗时趋势以决策扩容。
 */
@Module({
  imports: [FunctionExecutorModule, PermissionModule],
  controllers: [ConversionMonitorController],
  providers: [ConversionMonitorService],
  exports: [ConversionMonitorService],
})
export class ConversionMonitorModule {}
