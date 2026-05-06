import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoginForm } from './useLoginForm';
import * as apiSdk from '@/api-sdk';

vi.mock('@/api-sdk', () => ({
  authControllerSendSmsCode: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginByPhone: vi.fn(),
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
  useNavigate: () => vi.fn(),
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
