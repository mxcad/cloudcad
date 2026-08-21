///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该在 promise 先完成时正常返回结果', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('应该在 promise 先失败时原样抛出错误', async () => {
    const err = new Error('boom');
    await expect(withTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('应该在超时后 reject（挂起的请求不会无限等待）', async () => {
    vi.useFakeTimers();
    const promise = withTimeout(
      new Promise<string>(() => {}), // 永不 settle
      500
    );
    const assertion = expect(promise).rejects.toThrow(/超时|timeout/i);
    vi.advanceTimersByTime(500);
    await assertion;
  });

  it('超时后应清理计时器', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const promise = withTimeout(new Promise<string>(() => {}), 500);
    vi.advanceTimersByTime(500);
    await expect(promise).rejects.toThrow(/超时|timeout/i);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
