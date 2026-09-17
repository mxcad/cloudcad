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

const {
  toError,
  unwrap,
  errMsg,
  errorCode,
  errorDetail,
  showError,
  showAccountDeactivatedDialog,
} = await import('./authFeedback');

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.value = { supportEmail: '', supportPhone: '' };
});

describe('toError', () => {
  it('原样返回已有 Error 实例', () => {
    const e = new Error('bad');
    expect(toError(e)).toBe(e);
  });

  it('字符串型业务码：保留 code 与 tempToken/email/phone/cleanupDays', () => {
    const e = toError({
      code: 'EMAIL_NOT_VERIFIED',
      message: '请先验证邮箱后再登录',
      email: 'a@b.com',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(e.message).toBe('请先验证邮箱后再登录');
    expect(eCode(e)).toBe('EMAIL_NOT_VERIFIED');
    expect(errorDetail(e, 'email')).toBe('a@b.com');
  });

  it('apiConfig.responseTransformer 抛出的 Error（code 挂在自己身上、body 在 data 里）能取到业务码', () => {
    const e = toError(
      Object.assign(new Error('邮箱格式错误'), {
        code: 400,
        data: { code: 'BAD_REQUEST', message: '邮箱格式错误' },
      })
    );
    expect(eCode(e)).toBe('BAD_REQUEST');
  });

  it('Axios 形态 { response: { data } } 也能解包', () => {
    const e = toError({
      response: { data: { code: 'ACCOUNT_DEACTIVATED', message: '已注销', cleanupDays: 45 } },
    });
    expect(eCode(e)).toBe('ACCOUNT_DEACTIVATED');
    expect(errorDetail(e, 'cleanupDays')).toBe(45);
  });

  it('无法解析时回退为 String(err)', () => {
    expect(toError(null).message).toBe('null');
    expect(toError({}).message).toBe('[object Object]');
  });
});

/** 测试内避免与导出的 errorCode 重名 */
function eCode(e: unknown): string | null {
  return errorCode(e);
}

describe('unwrap', () => {
  it('res.error 非空即抛', () => {
    expect(() =>
      unwrap({ error: { code: 'X', message: 'boom' }, data: { accessToken: 'a' } })
    ).toThrow('boom');
  });

  it('成功响应直接返回 data', () => {
    const data = { accessToken: 'tok', refreshToken: 'r', user: { id: 1 } };
    expect(unwrap({ data })).toBe(data);
  });

  it('字符串型业务码落在 res.data 上时同样抛出', () => {
    // apiConfig.responseTransformer 只抛数值型 code，字符串型业务码原样留在 res.data
    expect(() =>
      unwrap({ data: { code: 'PHONE_REQUIRED', message: '请先绑定手机号', tempToken: 't' } })
    ).toThrow('请先绑定手机号');
  });

  it('code 为 SUCCESS 的成功包壳不误判为错误', () => {
    expect(unwrap({ data: { code: 'SUCCESS', data: { ok: 1 } } })).toEqual({ ok: 1 } as never);
  });

  it('无 data 返回空对象', () => {
    expect(unwrap({})).toEqual({});
  });
});

describe('errorCode', () => {
  it('只认字符串型 body.code，数值型 code 不算业务码', () => {
    expect(errorCode({ code: 'EMAIL_NOT_VERIFIED' })).toBe('EMAIL_NOT_VERIFIED');
    expect(errorCode({ code: 400 })).toBeNull();
    expect(errorCode({})).toBeNull();
    expect(errorCode(null)).toBeNull();
    expect(errorCode('text')).toBeNull();
  });
});

describe('errMsg', () => {
  it('Error.message 优先，其次 body.message，最后回退', () => {
    expect(errMsg(new Error('e1'), 'fb')).toBe('e1');
    expect(errMsg({ message: 'b1' }, 'fb')).toBe('b1');
    expect(errMsg({}, 'fb')).toBe('fb');
    expect(errMsg(null, 'fb')).toBe('fb');
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
