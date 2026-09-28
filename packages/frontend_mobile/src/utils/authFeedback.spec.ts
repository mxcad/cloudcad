import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const mockShowToast = vi.fn();
const mockShowDialog = vi.fn();

vi.mock('vant', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  showDialog: (...args: unknown[]) => mockShowDialog(...args),
}));

// 样式副作用导入在 vitest 下解析不到 .css，单独打空桩
vi.mock('vant/es/dialog/style', () => ({}));
vi.mock('vant/es/toast/style', () => ({}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

const mockConfig = ref<{ supportEmail: string; supportPhone: string }>({
  supportEmail: '',
  supportPhone: '',
});

vi.mock('@/composables/useRuntimeConfig', () => ({
  useRuntimeConfig: () => ({ config: mockConfig }),
}));

// 解包/归一能力已迁到 ./apiError，契约测试见 apiError.spec.ts；
// 这里只测依赖 vant 的 UI 反馈，外加一条再导出恒等断言守住兼容 shim。
const {
  showError,
  showAccountDeactivatedDialog,
  toError,
  unwrap,
  errMsg,
} = await import('./authFeedback');

const { toError: apiToError, unwrap: apiUnwrap, errMsg: apiErrMsg } = await import('./apiError');

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.value = { supportEmail: '', supportPhone: '' };
});

describe('再导出兼容 shim', () => {
  it('与 apiError 的唯一实现是同一个函数引用，不会悄悄分叉', () => {
    expect(toError).toBe(apiToError);
    expect(unwrap).toBe(apiUnwrap);
    expect(errMsg).toBe(apiErrMsg);
  });
});

describe('showError', () => {
  it('字符串错误直接 toast', () => {
    showError('直接文案', 'fallback');
    expect(mockShowToast).toHaveBeenCalledWith('直接文案');
  });

  it('对象错误取 message，缺 message 时回退', () => {
    showError({ message: '后端文案' }, 'fallback');
    expect(mockShowToast).toHaveBeenCalledWith('后端文案');
    showError({}, 'fallback');
    expect(mockShowToast).toHaveBeenLastCalledWith('fallback');
  });
});

describe('showAccountDeactivatedDialog', () => {
  it('cleanupDays 缺省 30，客服联系方式回退硬编码兜底值', () => {
    showAccountDeactivatedDialog();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);
    const arg = mockShowDialog.mock.calls[0][0] as { title: string; message: string };
    expect(arg.title).toBe('账号已注销');
    expect(arg.message).toContain('30');
    expect(arg.message).toContain('support@cloudcad.com');
    expect(arg.message).toContain('400-123-4567');
  });

  it('使用运行时配置的客服联系方式并透传 cleanupDays', () => {
    mockConfig.value = { supportEmail: 'cs@mx.com', supportPhone: '400-000-0000' };
    showAccountDeactivatedDialog(45);
    const arg = mockShowDialog.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('45');
    expect(arg.message).toContain('cs@mx.com');
    expect(arg.message).toContain('400-000-0000');
  });
});
