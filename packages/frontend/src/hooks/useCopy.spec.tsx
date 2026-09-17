import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopy } from './useCopy';

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn() }));
vi.mock('@/utils/notificationEvents', () => ({ globalShowToast: vi.fn() }));

import { copyText } from '@/lib/clipboard';
import { globalShowToast } from '@/utils/notificationEvents';

const copyMock = copyText as unknown as ReturnType<typeof vi.fn>;
const toastMock = globalShowToast as unknown as ReturnType<typeof vi.fn>;

/**
 * 断言必须读 `hook.result.current`，不能把返回值存到局部变量。
 *
 * hook 每次渲染返回一个**新对象**；把 `result.current` 赋给局部变量（无论在
 * `render` 的 host 组件里还是在 setup 里）都会冻在首次渲染的旧对象上，setState
 * 之后断言恒读旧值——表现为「返回 true 但 copied 恒 false」，极易被误判成实现
 * bug 或跨文件污染。本文件踩过一次：两种写法（host 组件捕获 / setup 里捕获
 * `result.current`）都实测失败，只有持续读 `hook.result.current` 才观察到更新。
 */
function setup(options: Parameters<typeof useCopy>[0] = {}) {
  return renderHook((opts) => useCopy(opts), {
    initialProps: options,
  });
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
    const hook = setup({ successMessage: '已复制' });

    let result!: boolean;
    await act(async () => {
      result = await hook.result.current.copy('https://x');
    });

    expect(result).toBe(true);
    expect(hook.result.current.copied).toBe(true);
    expect(toastMock).toHaveBeenCalledWith('已复制', 'success');
  });

  it('marker 让同一页面内多个复制按钮互不串台', async () => {
    copyMock.mockResolvedValue('execCommand');
    const hook = setup();

    await act(async () => {
      await hook.result.current.copy('first-link', 'btn-first');
    });
    expect(hook.result.current.copiedMarker).toBe('btn-first');

    await act(async () => {
      await hook.result.current.copy('second-link', 'btn-second');
    });
    expect(hook.result.current.copiedMarker).toBe('btn-second');
  });

  it('两级都失败时返回 false、提示失败并触发手动复制兜底', async () => {
    copyMock.mockResolvedValue('failed');
    const onUnrecoverable = vi.fn();
    const hook = setup({
      failMessage: '复制失败',
      onUnrecoverable,
    });

    let result!: boolean;
    await act(async () => {
      result = await hook.result.current.copy('https://link');
    });

    expect(result).toBe(false);
    expect(hook.result.current.copied).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('复制失败', 'error');
    expect(onUnrecoverable).toHaveBeenCalledWith('https://link');
  });

  it('未配置 failMessage 时失败不发提示', async () => {
    copyMock.mockResolvedValue('failed');
    const hook = setup();

    await act(async () => {
      await hook.result.current.copy('https://link');
    });

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('默认 2 秒后自动复位', async () => {
    copyMock.mockResolvedValue('clipboard');
    const hook = setup();

    await act(async () => {
      await hook.result.current.copy('x');
    });
    expect(hook.result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(hook.result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(hook.result.current.copied).toBe(false);
    expect(hook.result.current.copiedMarker).toBeNull();
  });

  it('duration 覆盖默认时长', async () => {
    copyMock.mockResolvedValue('clipboard');
    const hook = setup({ duration: 500 });

    await act(async () => {
      await hook.result.current.copy('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(hook.result.current.copied).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(hook.result.current.copied).toBe(false);
  });

  it('reset 立即清空标记并取消未完成的倒计时', async () => {
    copyMock.mockResolvedValue('clipboard');
    const hook = setup();

    await act(async () => {
      await hook.result.current.copy('x', 'marker');
    });
    expect(hook.result.current.copied).toBe(true);

    await act(async () => {
      hook.result.current.reset();
    });
    expect(hook.result.current.copied).toBe(false);
    expect(hook.result.current.copiedMarker).toBeNull();

    // 倒计时已被取消：推进到默认时长之外不会再触发状态变更
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(hook.result.current.copied).toBe(false);
  });
});
