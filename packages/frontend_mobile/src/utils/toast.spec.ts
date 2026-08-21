import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShowToast = vi.fn();
const mockShowLoadingToast = vi.fn();
const mockCloseToast = vi.fn();

vi.mock('vant', () => ({
  showToast: mockShowToast,
  showLoadingToast: mockShowLoadingToast,
  closeToast: mockCloseToast,
}));

// must import after mock
const { showToastOnce, closeToast } = await import('./toast');

describe('showToastOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应在冷却期内抑制重复消息', () => {
    showToastOnce('test message');
    showToastOnce('test message');
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });

  it('不同消息应正常显示', () => {
    showToastOnce('message 1');
    showToastOnce('message 2');
    expect(mockShowToast).toHaveBeenCalledTimes(2);
  });
});

describe('closeToast', () => {
  it('应调用 vant closeToast', () => {
    closeToast();
    expect(mockCloseToast).toHaveBeenCalled();
  });
});
