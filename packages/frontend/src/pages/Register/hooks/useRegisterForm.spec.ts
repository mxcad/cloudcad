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

vi.mock('@/contexts/NotificationContext', () => ({
  useConfirmDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: {
      mailEnabled: false,
      requireEmailVerification: false,
      smsEnabled: true,
      requirePhoneVerification: true,
      supportEmail: '',
      supportPhone: '',
      docsUrl: '',
      allowRegister: true,
      wechatEnabled: false,
      wechatAutoRegister: false,
      maxFileSize: 100,
      collaborationEnabled: true,
      collaborationDomains: '',
      batchDownloadEnabled: false,
      freeExportDownloadEnabled: false,
      userCancelGraceDays: 7,
      securityMode: 'normal',
      passwordPolicyMinLength: 10,
      passwordPolicyMinCategories: 3,
      brandProfile: {},
    },
    loading: false,
  }),
}));

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// mock react-hook-form 的 useForm：getValues / watch 都读这份**可变**表单值，
// 便于用例模拟「用户改字段后再次提交」，同时聚焦提交分支而非表单 UI
const mockFormValues = {
  username: 'testuser',
  nickname: '',
  email: '',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  agreedToTerms: true,
};

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useForm: vi.fn(() => ({
      register: vi.fn(() => ({ name: '', onChange: vi.fn(), ref: vi.fn() })),
      handleSubmit: vi.fn(),
      formState: { errors: {} },
      watch: vi.fn(() => ({ ...mockFormValues })),
      setError: vi.fn(),
      getValues: vi.fn(() => ({ ...mockFormValues })),
      setValue: vi.fn(),
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

function mockAuth(
  registerByPhone = vi.fn().mockResolvedValue(undefined),
  register = vi.fn().mockResolvedValue({ message: 'ok' })
) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    token: null,
    login: vi.fn(),
    loginByPhone: vi.fn(),
    loginWithWechat: vi.fn(),
    register,
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
    mockFormValues.confirmPassword = 'Password123!';
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

describe('useRegisterForm - 短信通道关闭（出厂默认）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerCheckFieldUniqueness).mockResolvedValue({
      data: {},
    } as never);
  });

  it('空 phoneForm 不拦截提交（回归：短信关闭时 phone/code 字段不渲染，错误对用户不可见 → 点注册毫无反应）', async () => {
    const registerUser = vi.fn().mockResolvedValue({ message: 'ok' });
    mockAuth(vi.fn(), registerUser);
    const { result } = renderHook(() =>
      useRegisterForm({
        ...baseOptions,
        smsEnabled: false,
        requirePhoneVerification: false,
      })
    );

    await act(async () => {
      await result.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '', code: '' }
      );
    });

    expect(registerUser).toHaveBeenCalledWith({
      username: 'testuser',
      password: 'Password123!',
      nickname: undefined,
      email: undefined,
      wechatTempToken: undefined,
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });
});

describe('useRegisterForm - 改对字段后再次提交', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockFormValues.confirmPassword = 'Password123!';
    vi.mocked(authControllerCheckFieldUniqueness).mockResolvedValue({
      data: {},
    } as never);
  });

  const submit = (hook: { current: ReturnType<typeof useRegisterForm> }) =>
    act(async () => {
      await hook.current.handleFormSubmit(
        { preventDefault: vi.fn() } as unknown as React.FormEvent,
        { phone: '13800138000', code: '123456' }
      );
    });

  it('确认密码改对后再次提交必须真正走注册流程（此前提交静默失效、控制台无输出）', async () => {
    const registerByPhone = mockAuth();
    const { result, rerender } = renderHook((options) => useRegisterForm(options), {
      initialProps: baseOptions,
    });

    // 第一次提交：两次密码不一致 → 被拦下
    mockFormValues.confirmPassword = 'Wrong123!';
    await submit(result);

    expect(registerByPhone).not.toHaveBeenCalled();
    expect(result.current.fieldErrors.confirmPassword).toBeTruthy();

    // 用户改对确认密码，错误提示应立即消失
    mockFormValues.confirmPassword = 'Password123!';
    await act(async () => {
      rerender(baseOptions);
    });
    expect(result.current.fieldErrors.confirmPassword).toBeFalsy();

    // 再次提交：不得被上一次失败留下的错误快照挡住
    await submit(result);
    expect(registerByPhone).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '123456',
      username: 'testuser',
      password: 'Password123!',
      nickname: undefined,
    });
  });
});
