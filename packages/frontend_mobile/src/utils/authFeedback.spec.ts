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
  it('cleanupDays 缺省 30', () => {
    showAccountDeactivatedDialog();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);
    const arg = mockShowDialog.mock.calls[0][0] as { title: string; message: string };
    expect(arg.title).toBe('账号已注销');
    expect(arg.message).toContain('30');
  });

  it('未配置客服联系方式时不编造假邮箱/假电话，改为提示联系管理员', () => {
    showAccountDeactivatedDialog();
    const arg = mockShowDialog.mock.calls[0][0] as { message: string };
    expect(arg.message).not.toContain('support@cloudcad.com');
    expect(arg.message).not.toContain('400-123-4567');
    expect(arg.message).toContain('如有疑问，请联系管理员。');
    // 没有任何联系方式时不单独挂一行工作时间
    expect(arg.message).not.toContain('工作时间');
  });

  it('使用运行时配置的客服联系方式并透传 cleanupDays', () => {
    mockConfig.value = { supportEmail: 'cs@mx.com', supportPhone: '400-000-0000' };
    showAccountDeactivatedDialog(45);
    const arg = mockShowDialog.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('45');
    expect(arg.message).toContain('cs@mx.com');
    expect(arg.message).toContain('400-000-0000');
    expect(arg.message).toContain('工作时间');
  });

  it('只配了一项时只显示该项，空项不渲染空链接', () => {
    mockConfig.value = { supportEmail: 'cs@mx.com', supportPhone: '   ' };
    showAccountDeactivatedDialog();
    const arg = mockShowDialog.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('cs@mx.com');
    expect(arg.message).not.toContain('tel:');
  });
});
