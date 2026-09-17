import { describe, it, expect, afterEach, vi } from 'vitest';
import { importWithTimeout } from './lazyImport';

describe('importWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loader 成功时以 loader 的值 resolve', async () => {
    const value = { ok: true };
    await expect(
      importWithTimeout(() => Promise.resolve(value), 1000),
    ).resolves.toBe(value);
  });

  it('loader 永不 settle 时超时后 reject', async () => {
    vi.useFakeTimers();
    const pending = importWithTimeout(() => new Promise(() => {}), 100);
    const assertion = pending.then(
      () => {
        throw new Error('should have rejected');
      },
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(100);
    await expect(assertion).resolves.toMatchObject({
      message: expect.stringContaining('timed out'),
    });
  });

  it('首次失败后重试，后续尝试成功则 resolve', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const loader = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve('ok');
    };
    const p = importWithTimeout(loader, 1000, 2);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('重试耗尽后以最后一次错误 reject', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const loader = () => {
      calls += 1;
      return Promise.reject(new Error(`fail-${calls}`));
    };
    const p = importWithTimeout(loader, 1000, 3);
    const assertion = p.then(
      () => {
        throw new Error('should have rejected');
      },
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(assertion).resolves.toMatchObject({ message: 'fail-3' });
    expect(calls).toBe(3);
  });

  it('首次尝试超时后，同一悬挂 promise 的迟到成功仍会 resolve（模拟浏览器去重）', async () => {
    vi.useFakeTimers();
    // 模拟浏览器对悬挂请求去重：两次 import 拿到的是同一个悬挂 promise
    let resolveShared: (v: string) => void = () => {};
    const shared = new Promise<string>((r) => {
      resolveShared = r;
    });
    let calls = 0;
    const p = importWithTimeout(
      () => {
        calls += 1;
        return shared;
      },
      100,
      2,
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
    resolveShared('late-value');
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('late-value');
  });
});
