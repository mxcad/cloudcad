import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRegisterForm } from './useRegisterForm';
import { useAuth } from '@/contexts/AuthContext';
import { authControllerCheckFieldUniqueness } from '@/api-sdk';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  authControllerCheckFieldUniqueness: vi.fn(),
}));

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// mock react-hook-form 的 useForm：注入预设表单值（getValues 返回固定值），
// 让测试聚焦提交分支（手机注册 → context.registerByPhone + SPA 导航）而非表单 UI
vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useForm: vi.fn(() => ({
      register: vi.fn(() => ({ name: '', onChange: vi.fn(), ref: vi.fn() })),
      handleSubmit: vi.fn(),
      formState: { errors: {} },
      watch: vi.fn(() => ''),
      setError: vi.fn(),
      getValues: vi.fn(() => ({
        username: 'testuser',
        nickname: '',
        email: '',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        agreedToTerms: true,
      })),
      trigger: vi.fn().mockResolvedValue(true),
    })),
  };
});

const baseOptions = {
  mailEnabled: false,
  requireEmailVerification: false,
  smsEnabled: true,
  requirePhoneVerification: true,
  isWechatRegister: false,
};

function mockAuth(registerByPhone = vi.fn().mockResolvedValue(undefined)) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    token: null,
    login: vi.fn(),
    loginByPhone: vi.fn(),
    loginWithWechat: vi.fn(),
    register: vi.fn().mockResolvedValue({ message: 'ok' }),
    registerByPhone,
    verifyEmailAndLogin: vi.fn(),
    verifyPhoneAndLogin: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    loading: false,
    isAuthenticated: false,
    error: null,
    setError: vi.fn(),
  });
  return registerByPhone;
}

describe('useRegisterForm - phone registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerCheckFieldUniqueness).mockResolvedValue({
      data: {},
    } as never);
  });

  it('calls AuthContext.registerByPhone and SPA-navigates to "/" (T4 regression: no localStorage bypass)', async () => {
    const registerByPhone = mockAuth();
    const { result } = renderHook(() => useRegisterForm(baseOptions));

    await act(async () => {
      await result.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '13800138000', code: '123456' }
      );
    });

    expect(registerByPhone).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '123456',
      username: 'testuser',
      password: 'Password123!',
      nickname: undefined,
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('does not write token/user to localStorage directly (bug: token state stayed null → redirected back to /login)', async () => {
    mockAuth();
    const { result } = renderHook(() => useRegisterForm(baseOptions));

    await act(async () => {
      await result.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '13800138000', code: '123456' }
      );
    });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('clears wechatTempToken after successful phone registration in wechat flow', async () => {
    sessionStorage.setItem('wechatTempToken', 'jwt.payload.sig');
    mockAuth();
    const { result } = renderHook(() =>
      useRegisterForm({ ...baseOptions, isWechatRegister: true })
    );

    await act(async () => {
      await result.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '13800138000', code: '123456' }
      );
    });

    expect(sessionStorage.getItem('wechatTempToken')).toBeNull();
  });

  it('does not call registerByPhone when phone/code are missing (falls back to email register path)', async () => {
    const registerByPhone = mockAuth();
    const { result } = renderHook(() => useRegisterForm(baseOptions));

    await act(async () => {
      await result.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '', code: '' }
      );
    });

    expect(registerByPhone).not.toHaveBeenCalled();
  });
});
