import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoginForm } from './useLoginForm';
import * as apiSdk from '@/api-sdk';
import { t } from '@/languages';

// 测试夹具占位值（非真实凭据，密码校验被 mock）
const MOCK_LOGIN_CREDENTIAL = 'mock-pass-123';
const mockLogin = vi.fn();
const mockLoginByPhone = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/api-sdk', () => ({
  authControllerSendSmsCode: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginByPhone: mockLoginByPhone,
    loginWithWechat: vi.fn(),
    error: null,
    setError: vi.fn(),
  }),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: { smsEnabled: true, mailEnabled: false, wechatEnabled: false },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('useLoginForm - handleSendCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass phone value to authControllerSendSmsCode', async () => {
    vi.mocked(apiSdk.authControllerSendSmsCode).mockResolvedValue({
      data: { success: true },
    } as any);

    const { result } = renderHook(() => useLoginForm());

    // Set phone value via react-hook-form
    act(() => {
      result.current.phoneFormHook.setValue('phone', '13800138000');
    });

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(apiSdk.authControllerSendSmsCode).toHaveBeenCalledWith({
      body: { phone: '13800138000' },
    });
  });

  it('should not call sendSmsCode if phone validation fails', async () => {
    const { result } = renderHook(() => useLoginForm());

    // Leave phone empty — validation should fail
    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(apiSdk.authControllerSendSmsCode).not.toHaveBeenCalled();
  });
});

describe('useLoginForm - 注销冷静期分流', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 账号密码登录：设置表单值后调用提交 */
  async function submitAccount() {
    const { result } = renderHook(() => useLoginForm());
    await act(async () => {
      result.current.accountForm.setValue('account', 'test@example.com');
      result.current.accountForm.setValue('password', MOCK_LOGIN_CREDENTIAL);
    });
    await act(async () => {
      await result.current.handleAccountSubmit({
        preventDefault: vi.fn(),
      } as React.FormEvent);
    });
    return result;
  }

  it('账号登录：ACCOUNT_DEACTIVATED 错误码 → 弹客服信息弹框（deactivated 场景 + cleanupDays）', async () => {
    mockLogin.mockRejectedValue({
      response: {
        data: {
          code: 'ACCOUNT_DEACTIVATED',
          message:
            '账号已注销且已过冷静期，请联系客服恢复。数据将在30天后彻底删除',
          graceDays: 7,
          cleanupDays: 30,
        },
      },
    });

    const result = await submitAccount();

    expect(result.current.showSupportModal).toBe(true);
    expect(result.current.supportModalVariant).toBe('deactivated');
    expect(result.current.supportModalCleanupDays).toBe(30);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('账号登录：restored=true → 显示「账户已自动恢复」并延迟跳转', async () => {
    mockLogin.mockResolvedValue(true);

    const result = await submitAccount();

    expect(result.current.success).toBe(
      t('您的账户已自动恢复，注销已取消')
    );
    // 延迟 1.5s 跳转（与注销成功处理一致，让提示可见）
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('账号登录：restored=false → 正常跳转不显示恢复提示', async () => {
    mockLogin.mockResolvedValue(false);

    const result = await submitAccount();

    expect(result.current.success).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('手机登录：ACCOUNT_DEACTIVATED 错误码 → 弹客服信息弹框', async () => {
    mockLoginByPhone.mockRejectedValue({
      response: {
        data: {
          code: 'ACCOUNT_DEACTIVATED',
          message:
            '账号已注销且已过冷静期，请联系客服恢复。数据将在30天后彻底删除',
          cleanupDays: 30,
        },
      },
    });

    const { result } = renderHook(() => useLoginForm());
    await act(async () => {
      result.current.phoneFormHook.setValue('phone', '13800138000');
      result.current.phoneFormHook.setValue('code', '123456');
    });
    await act(async () => {
      await result.current.handlePhoneSubmit({
        preventDefault: vi.fn(),
      } as React.FormEvent);
    });

    expect(result.current.showSupportModal).toBe(true);
    expect(result.current.supportModalVariant).toBe('deactivated');
    expect(result.current.supportModalCleanupDays).toBe(30);
  });

  it('账号登录：普通错误（无错误码）→ 显示错误消息不弹框', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { message: '账号或密码错误' } },
    });

    const result = await submitAccount();

    expect(result.current.showSupportModal).toBe(false);
    expect(result.current.error).toBe('账号或密码错误');
  });
});
