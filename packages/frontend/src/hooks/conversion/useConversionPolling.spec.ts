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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  waitForConversion,
  useConversionPolling,
} from './useConversionPolling';

vi.mock('@/api-sdk', () => ({
  conversionStatusControllerGetConversionStatus: vi.fn(),
  conversionStatusControllerTriggerConversion: vi.fn(),
}));

import {
  conversionStatusControllerGetConversionStatus,
  conversionStatusControllerTriggerConversion,
} from '@/api-sdk';

const mockStatus = (fileStatus: string, extra: Record<string, unknown> = {}) =>
  vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
    data: { fileStatus, ...extra },
  } as never);

describe('waitForConversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return immediately when status is COMPLETED', async () => {
    mockStatus('COMPLETED');

    const result = await waitForConversion('node1', { intervalMs: 10 });

    expect(result.completed).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.status).toBe('COMPLETED');
    expect(conversionStatusControllerGetConversionStatus).toHaveBeenCalledWith({
      path: { nodeId: 'node1' },
    });
    expect(conversionStatusControllerTriggerConversion).not.toHaveBeenCalled();
  });

  it('should keep polling until status becomes COMPLETED', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
    });

    expect(result.completed).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(conversionStatusControllerGetConversionStatus).toHaveBeenCalledTimes(
      3
    );
  });

  it('should stop polling and surface error when status is FAILED', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({
        data: { fileStatus: 'FAILED', error: 'convert boom' },
      } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
    });

    expect(result.completed).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('convert boom');
  });

  it('should retry FAILED once by triggering conversion and keep polling to COMPLETED', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({
        data: { fileStatus: 'FAILED', error: 'boom' },
      } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockResolvedValue({
      data: { taskId: 'task-retry' },
    } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      maxFailedRetries: 1,
    });

    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledWith({
      path: { nodeId: 'node1' },
    });
    expect(result.completed).toBe(true);
    expect(result.status).toBe('COMPLETED');
  });

  it('should not retry beyond maxFailedRetries and return FAILED', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'FAILED', error: 'still boom' },
    } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockResolvedValue({
      data: { taskId: 'task-retry' },
    } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      maxFailedRetries: 1,
    });

    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
    expect(result.completed).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('still boom');
  });

  it('should return FAILED when retry trigger fails', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'FAILED', error: 'boom' },
    } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockRejectedValue(
      new Error('network down')
    );

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      maxFailedRetries: 1,
    });

    expect(result.completed).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('boom');
  });

  it('should NOT retry DELETED even with maxFailedRetries', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'DELETED' },
    } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      maxFailedRetries: 1,
    });

    expect(conversionStatusControllerTriggerConversion).not.toHaveBeenCalled();
    expect(result.status).toBe('DELETED');
    expect(result.completed).toBe(false);
  });

  it('should trigger conversion once when autoTrigger and status is UPLOADING', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'UPLOADING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockResolvedValue({
      data: { taskId: 'task-1' },
    } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      autoTrigger: true,
    });

    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledWith({
      path: { nodeId: 'node1' },
    });
    expect(result.completed).toBe(true);
  });

  it('should NOT trigger conversion when status is already PROCESSING', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      autoTrigger: true,
    });

    expect(conversionStatusControllerTriggerConversion).not.toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });

  it('should keep polling when trigger fails but conversion completes later', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'UPLOADING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockRejectedValue(
      new Error('network')
    );

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 500,
      autoTrigger: true,
    });

    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
    expect(result.completed).toBe(true);
  });

  it('should time out when status stays in progress until deadline', async () => {
    mockStatus('PROCESSING');

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 30,
    });

    expect(result.completed).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.status).toBe('PROCESSING');
  });

  it('should stop early when shouldContinue returns false', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'PROCESSING' },
    } as never);

    const result = await waitForConversion('node1', {
      intervalMs: 5,
      timeoutMs: 1000,
      shouldContinue: () => false,
    });

    expect(result.timedOut).toBe(true);
    expect(conversionStatusControllerGetConversionStatus).toHaveBeenCalledTimes(
      1
    );
  });
});

describe('useConversionPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stay idle when nodeId is not provided', () => {
    const { result } = renderHook(() => useConversionPolling(null));

    expect(result.current.isConverting).toBe(false);
    expect(result.current.status).toBeNull();
    expect(result.current.completed).toBe(false);
  });

  it('should auto-poll and report completion', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', { intervalMs: 5, timeoutMs: 1000 })
    );

    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(result.current.isConverting).toBe(false);
    expect(result.current.status).toBe('COMPLETED');
  });

  it('should not auto-poll when enabled is false, but refresh works', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'PROCESSING' },
    } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', {
        intervalMs: 5,
        timeoutMs: 50,
        enabled: false,
      })
    );

    expect(result.current.isConverting).toBe(false);

    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'COMPLETED' },
    } as never);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.completed).toBe(true);
    expect(result.current.status).toBe('COMPLETED');
  });

  it('should report failure status', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'FAILED', error: 'convert boom' },
    } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', { intervalMs: 5, timeoutMs: 1000 })
    );

    await waitFor(() => expect(result.current.status).toBe('FAILED'));
    expect(result.current.completed).toBe(false);
    expect(result.current.error).toBe('convert boom');
    expect(result.current.isConverting).toBe(false);
  });

  it('should auto-retry FAILED once and report completion on retry success', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus)
      .mockResolvedValueOnce({
        data: { fileStatus: 'FAILED', error: 'boom' },
      } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } } as never)
      .mockResolvedValueOnce({ data: { fileStatus: 'COMPLETED' } } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockResolvedValue({
      data: { taskId: 'task-retry' },
    } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', { intervalMs: 5, timeoutMs: 1000 })
    );

    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(result.current.status).toBe('COMPLETED');
    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
    expect(result.current.error).toBeUndefined();
  });

  it('should stop retrying after maxFailedRetries and report FAILED', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'FAILED', error: 'still boom' },
    } as never);
    vi.mocked(conversionStatusControllerTriggerConversion).mockResolvedValue({
      data: { taskId: 'task-retry' },
    } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', {
        intervalMs: 5,
        timeoutMs: 1000,
        maxFailedRetries: 1,
      })
    );

    await waitFor(() => expect(result.current.status).toBe('FAILED'));
    expect(result.current.completed).toBe(false);
    expect(result.current.error).toBe('still boom');
    expect(conversionStatusControllerTriggerConversion).toHaveBeenCalledTimes(
      1
    );
  });

  it('should stop polling via stop()', async () => {
    vi.mocked(conversionStatusControllerGetConversionStatus).mockResolvedValue({
      data: { fileStatus: 'PROCESSING' },
    } as never);

    const { result } = renderHook(() =>
      useConversionPolling('node1', { intervalMs: 5, timeoutMs: 50 })
    );

    expect(result.current.isConverting).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isConverting).toBe(false);

    // stop 后丢弃在途轮询结果，即使底层循环结束也不更新状态
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(result.current.timedOut).toBe(false);
    expect(result.current.completed).toBe(false);
  });
});
