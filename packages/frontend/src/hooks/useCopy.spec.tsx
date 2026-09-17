import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useCopy } from './useCopy';

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn() }));
vi.mock('@/utils/notificationEvents', () => ({ globalShowToast: vi.fn() }));

import { copyText } from '@/lib/clipboard';
import { globalShowToast } from '@/utils/notificationEvents';

const copyMock = copyText as unknown as ReturnType<typeof vi.fn>;
const toastMock = globalShowToast as unknown as ReturnType<typeof vi.fn>;

function setup(options: Parameters<typeof useCopy>[0] = {}) {
  let api!: ReturnType<typeof useCopy>;
  const Host = () => {
    api = useCopy(options);
    return null;
  };
  render(<Host />);
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCopy', () => {
  it('复制成功返回 true 并进入 copied 态、发出成功提示', async () => {
    copyMock.mockResolvedValue('clipboard');
    const api = setup({ successMessage: '已复制' });

    let result!: boolean;
    await act(async () => {
      result = await api.copy('https://x');
    });

    expect(result).toBe(true);
    expect(api.copied).toBe(true);
    expect(toastMock).toHaveBeenCalledWith('已复制', 'success');
  });

  it('marker 让同一页面内多个复制按钮互不串台', async () => {
    copyMock.mockResolvedValue('execCommand');
    const api = setup();

    await act(async () => {
      await api.copy('first-link', 'btn-first');
    });
    expect(api.copiedMarker).toBe('btn-first');

    await act(async () => {
      await api.copy('second-link', 'btn-second');
    });
    expect(api.copiedMarker).toBe('btn-second');
  });

  it('两级都失败时返回 false、提示失败并触发手动复制兜底', async () => {
    copyMock.mockResolvedValue('failed');
    const onUnrecoverable = vi.fn();
    const api = setup({
      failMessage: '复制失败',
      onUnrecoverable,
    });

    let result!: boolean;
    await act(async () => {
      result = await api.copy('https://link');
    });

    expect(result).toBe(false);
    expect(api.copied).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('复制失败', 'error');
    expect(onUnrecoverable).toHaveBeenCalledWith('https://link');
  });

  it('未配置 failMessage 时失败不发提示', async () => {
    copyMock.mockResolvedValue('failed');
    const api = setup();

    await act(async () => {
      await api.copy('https://link');
    });

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('默认 2 秒后自动复位', async () => {
    copyMock.mockResolvedValue('clipboard');
    const api = setup();

    await act(async () => {
      await api.copy('x');
    });
    expect(api.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(api.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(api.copied).toBe(false);
    expect(api.copiedMarker).toBeNull();
  });

  it('duration 覆盖默认时长', async () => {
    copyMock.mockResolvedValue('clipboard');
    const api = setup({ duration: 500 });

    await act(async () => {
      await api.copy('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(api.copied).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(api.copied).toBe(false);
  });

  it('reset 立即清空标记并取消未完成的倒计时', async () => {
    copyMock.mockResolvedValue('clipboard');
    const api = setup();

    await act(async () => {
      await api.copy('x', 'marker');
    });
    expect(api.copied).toBe(true);

    await act(async () => {
      api.reset();
    });
    expect(api.copied).toBe(false);
    expect(api.copiedMarker).toBeNull();

    // 倒计时已被取消：推进到默认时长之外不会再触发状态变更
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(api.copied).toBe(false);
  });
});
