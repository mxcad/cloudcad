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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  conversionStatusControllerGetConversionStatus,
  conversionStatusControllerTriggerConversion,
} from '@/api-sdk';

/**
 * 异步转换状态（后端 ConversionStatusResponseDto）
 *
 * 注意：响应可能为 undefined（4xx/5xx 时 data 为空），本地结构声明用于兜底兼容。
 */
export type ConversionStatus = {
  fileStatus?: string;
  taskId?: string;
  taskStatus?: string;
  error?: string;
};

export interface ConversionPollingOptions {
  /** 轮询间隔（毫秒），默认 2000 */
  intervalMs?: number;
  /** 总超时（毫秒），默认 120000 */
  timeoutMs?: number;
  /** 是否在转换尚未开始（非 PROCESSING）时先触发一次异步转换，默认 false */
  autoTrigger?: boolean;
  /** 轮询遇 FAILED 时自动调用转换接口重试的次数上限（防死循环），默认 0 不重试 */
  maxFailedRetries?: number;
}

export interface ConversionPollingResult {
  /** 最近一次查询到的 fileStatus */
  status: string | null;
  taskId?: string;
  taskStatus?: string;
  error?: string;
  /** fileStatus 是否为 COMPLETED */
  completed: boolean;
  /** 是否在达到总超时时仍未完成 */
  timedOut: boolean;
}

export interface UseConversionPollingOptions extends ConversionPollingOptions {
  /** 是否自动开始轮询，默认 true（nodeId 存在即开始） */
  enabled?: boolean;
}

export interface UseConversionPollingState {
  /** 是否正在轮询 */
  isConverting: boolean;
  /** 最近一次查询到的 fileStatus */
  status: string | null;
  /** 后端返回的错误信息 */
  error?: string;
  /** 是否已完成 */
  completed: boolean;
  /** 是否超时 */
  timedOut: boolean;
  /** 重新开始一轮轮询 */
  refresh: () => Promise<void>;
  /** 停止当前轮询 */
  stop: () => void;
}

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
/** hook 默认 FAILED 自动重试次数（waitForConversion 默认 0，hook 默认 1 次防死循环） */
const DEFAULT_FAILED_RETRIES = 1;

const COMPLETED_STATUS = 'COMPLETED';
const IN_PROGRESS_STATUS = 'PROCESSING';
const TERMINAL_FAILED_STATUSES: ReadonlySet<string> = new Set([
  'FAILED',
  'DELETED',
]);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isTerminalFailure = (status: string | null | undefined): boolean =>
  !!status && TERMINAL_FAILED_STATUSES.has(status);

/**
 * 轮询指定节点文件的异步转换状态，直到完成、失败或超时。
 *
 * 纯异步工具函数（不依赖 React 状态），可在 hook 或事件回调中直接调用。
 *
 * @param nodeId 文件节点 ID
 * @param options.intervalMs 轮询间隔（默认 2s）
 * @param options.timeoutMs 总超时（默认 120s）
 * @param options.autoTrigger 转换尚未开始（非 PROCESSING）时先触发一次转换
 * @param options.shouldContinue 每轮开始前的取消回调，返回 false 则提前终止
 */
export async function waitForConversion(
  nodeId: string,
  options: ConversionPollingOptions & {
    shouldContinue?: () => boolean;
  } = {}
): Promise<ConversionPollingResult> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    autoTrigger = false,
    maxFailedRetries = 0,
    shouldContinue,
  } = options;
  const deadline = Date.now() + timeoutMs;
  let triggered = false;
  let failedRetries = 0;

  /**
   * 尝试对 FAILED 状态自动重试：调用转换触发接口一次，
   * 触发成功则返回 true 并继续轮询；触发失败返回 false，保留当前 FAILED 结果。
   */
  const retryFailed = async (): Promise<boolean> => {
    if (failedRetries >= maxFailedRetries) return false;
    failedRetries += 1;
    try {
      await conversionStatusControllerTriggerConversion({ path: { nodeId } });
      return true;
    } catch {
      return false;
    }
  };

  const poll = async (): Promise<ConversionPollingResult> => {
    const response = await conversionStatusControllerGetConversionStatus({
      path: { nodeId },
    });
    const status = (response.data ?? {}) as ConversionStatus;
    const fileStatus = status.fileStatus ?? null;

    if (fileStatus === COMPLETED_STATUS) {
      return {
        ...status,
        status: fileStatus,
        completed: true,
        timedOut: false,
      };
    }
    if (isTerminalFailure(fileStatus)) {
      return {
        ...status,
        status: fileStatus,
        completed: false,
        timedOut: false,
      };
    }

    // 转换尚未开始（非 PROCESSING）且需要自动触发时，先触发一次再继续轮询。
    // 触发失败不阻断轮询，后续轮询会反映真实状态。
    if (!triggered && autoTrigger && fileStatus !== IN_PROGRESS_STATUS) {
      triggered = true;
      try {
        await conversionStatusControllerTriggerConversion({ path: { nodeId } });
      } catch {
        // ignore trigger failure, keep polling
      }
    }

    return { ...status, status: fileStatus, completed: false, timedOut: false };
  };

  let result = await poll();
  // FAILED 自动重试：调用转换触发接口后继续轮询，直到成功/超限/触发失败
  while (
    result.status === 'FAILED' &&
    !result.completed &&
    failedRetries < maxFailedRetries
  ) {
    if (shouldContinue && !shouldContinue()) {
      break;
    }
    const retried = await retryFailed();
    if (!retried) break;
    result = await poll();
  }
  if (result.completed || isTerminalFailure(result.status)) {
    return result;
  }

  while (Date.now() < deadline) {
    if (shouldContinue && !shouldContinue()) {
      break;
    }
    await delay(intervalMs);
    result = await poll();
    if (result.completed || isTerminalFailure(result.status)) {
      return result;
    }
  }

  return { ...result, timedOut: true };
}

/**
 * 异步转换状态轮询 Hook。
 *
 * 给定 nodeId，自动周期性查询转换状态，直到 COMPLETED/FAILED 或超时。
 */
export function useConversionPolling(
  nodeId?: string | null,
  options: UseConversionPollingOptions = {}
): UseConversionPollingState {
  const { enabled = true } = options;
  const [isConverting, setIsConverting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [completed, setCompleted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // 通过 ref 持有最新 options，避免每次渲染导致轮询重启
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 轮询周期计数：stop/卸载/重复 start 时递增以丢弃过期结果
  const cycleRef = useRef(0);

  const stop = useCallback(() => {
    cycleRef.current += 1;
    setIsConverting(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!nodeId) return;
    const cycle = ++cycleRef.current;
    setIsConverting(true);
    setError(undefined);
    setCompleted(false);
    setTimedOut(false);
    const result = await waitForConversion(nodeId, {
      ...optionsRef.current,
      // hook 默认开启一次 FAILED 自动重试（防死循环上限）
      maxFailedRetries:
        optionsRef.current.maxFailedRetries ?? DEFAULT_FAILED_RETRIES,
    });
    if (cycle !== cycleRef.current) return;
    setIsConverting(false);
    setStatus(result.status);
    setError(result.error);
    setCompleted(result.completed);
    setTimedOut(result.timedOut);
  }, [nodeId]);

  useEffect(() => {
    if (nodeId && enabled) {
      void refresh();
    }
    return () => {
      cycleRef.current += 1;
    };
  }, [nodeId, enabled, refresh]);

  return { isConverting, status, error, completed, timedOut, refresh, stop };
}
