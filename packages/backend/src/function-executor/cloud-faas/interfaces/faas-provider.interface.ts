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

import type { ConversionTask } from '../../function-executor.interface';

export const FaaS_PROVIDER = 'FaaS_PROVIDER';

/**
 * 云函数 FaaS provider 契约（华为 FunctionGraph / 阿里云 FC / AWS Lambda）。
 *
 * CloudFaaSExecutor 只依赖这个接口、不知道具体厂商；厂商选择由
 * function-executor.module.ts 的 FaaS_PROVIDER 工厂按 CLOUD_FAAS_PROVIDER 完成。
 */
export interface FaasProvider {
  invoke(task: ConversionTask): Promise<{
    status: string;
    outputPath?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }>;
  getTaskStatus(taskId: string): Promise<{
    status: string;
    progress?: number;
    error?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}
