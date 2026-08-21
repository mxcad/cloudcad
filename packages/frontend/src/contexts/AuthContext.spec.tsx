import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import {
  authControllerRegisterByPhone,
  authControllerGetProfile,
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerRegister,
  authControllerLogout,
  authControllerVerifyEmail,
  authControllerVerifyPhone,
  authControllerGetWechatAuthUrl,
} from '@/api-sdk';

vi.mock('@/api-sdk', () => ({
  authControllerLogin: vi.fn(),
  authControllerLoginByPhone: vi.fn(),
  authControllerRegister: vi.fn(),
  authControllerRegisterByPhone: vi.fn(),
  authControllerGetProfile: vi.fn(),
  authControllerLogout: vi.fn(),
  authControllerVerifyEmail: vi.fn(),
  authControllerVerifyPhone: vi.fn(),
  authControllerGetWechatAuthUrl: vi.fn(),
}));

vi.mock('@/config/clientSetup', () => ({
  setTokenRefreshCallback: vi.fn(),
  setAuthFailureCallback: vi.fn(),
  triggerProactiveRefresh: vi.fn(),
  cancelProactiveRefresh: vi.fn(),
}));

vi.mock('@/hooks/useWechatAuth', () => ({
  useWechatAuth: vi.fn(),
}));

vi.mock('@/utils/permissionUtils', () => ({
  clearProjectPermissionsCache: vi.fn(),
}));

vi.mock('react-device-detect', () => ({
  isMobile: false,
}));

function Consumer() {
  const { token, user, isAuthenticated, registerByPhone } = useAuth();
  return (
    <div>
      <span data-testid="token">{token || 'null'}</span>
      <span data-testid="user">{user ? user.username : 'null'}</span>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <button
        onClick={() => {
          void registerByPhone({
            phone: '13800138000',
            code: '123456',
            username: 'phoneuser',
            password: 'Password123!',
          }).catch(() => {
            // 错误由调用方（useRegisterForm）展示，此处仅吞掉避免未处理拒绝
          });
        }}
      >
        register
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

describe('AuthContext - registerByPhone (T4 bug regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { id: 'u-phone', username: 'phoneuser', email: 'p@x.com' },
    } as never);
    vi.mocked(authControllerRegisterByPhone).mockResolvedValue({
      data: {
        accessToken: 'at-phone',
        refreshToken: 'rt-phone',
        user: { id: 'u-phone', username: 'phoneuser' },
      },
    } as never);
  });

  it('sets React token/user state after phone registration → isAuthenticated becomes true', async () => {
    renderProvider();

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });
    expect(screen.getByTestId('token').textContent).toBe('at-phone');
    expect(screen.getByTestId('user').textContent).toBe('phoneuser');

    // 同步写入 localStorage（refresh 等机制依赖）
    expect(localStorage.getItem('accessToken')).toBe('at-phone');
    expect(localStorage.getItem('refreshToken')).toBe('rt-phone');
    expect(localStorage.getItem('user')).toContain('phoneuser');
    expect(authControllerRegisterByPhone).toHaveBeenCalledWith({
      body: {
        phone: '13800138000',
        code: '123456',
        username: 'phoneuser',
        password: 'Password123!',
        nickname: undefined,
      },
    });
  });

  it('does not set token state when API returns no accessToken', async () => {
    vi.mocked(authControllerRegisterByPhone).mockResolvedValue({
      data: { refreshToken: '', user: {} },
    } as never);
    renderProvider();

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => {
      expect(authControllerRegisterByPhone).toHaveBeenCalled();
    });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('propagates API errors to caller without setting token', async () => {
    vi.mocked(authControllerRegisterByPhone).mockRejectedValue(
      new Error('注册失败')
    );
    renderProvider();

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => {
      expect(authControllerRegisterByPhone).toHaveBeenCalled();
    });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
