///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useState } from 'react';
import { conversionTaskControllerGetQuota } from '@/api-sdk';
import { useAuth } from '@/contexts/AuthContext';

/** 后端 ConversionQuotaDto（GET /mxcad/conversion/quota 的 200 响应） */
export interface ConversionQuota {
  limit: number;
  used: number;
  remaining: number;
  windowHours: number;
  unlimited: boolean;
  resetsAt: string | null;
  scope: 'ip' | 'user';
}

export interface UseConversionQuotaResult {
  quota: ConversionQuota | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * 当前调用者的转换配额（ADR-0043 只读）：本窗口已用/上限。
 *
 * 登录用户按 userId、未登录按 IP 分桶（后端 @Public() 端点，前端显式传 userId）。
 * 配额是辅助信息：请求失败不抛错也不重试，面板其余部分不受影响。
 */
export function useConversionQuota(): UseConversionQuotaResult {
  const { user } = useAuth();
  const [quota, setQuota] = useState<ConversionQuota | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await conversionTaskControllerGetQuota({
        // SDK 按后端 @Query('userId') 生成 required；后端实为可选（游客按 IP 计），
        // 未登录时不带 userId。空对象经 as never 交给 query 序列化（进 URL 时无 userId 键）。
        query: (user?.id ? { userId: user.id } : {}) as never,
      });
      if (res.error || !res.data) return;
      const data = res.data as ConversionQuota;
      setQuota({
        limit: data.limit,
        used: data.used,
        remaining: data.remaining,
        windowHours: data.windowHours,
        unlimited: data.unlimited,
        resetsAt: data.resetsAt ?? null,
        scope: data.scope,
      });
    } catch {
      // 配额是辅助信息：网络失败不阻断面板
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { quota, isLoading, refresh };
}
