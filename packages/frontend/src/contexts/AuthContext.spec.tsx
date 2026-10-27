import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
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
  // userEventStream 协调器（统一用户事件流）降级路径会签 ticket
  noticeCenterControllerIssueTicket: vi.fn().mockResolvedValue({
    error: undefined,
    data: { ticket: 'tk_test' },
  }),
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

/**
 * 构造合法未过期 JWT：AuthContext 的 validateToken effect 会解析 exp 判定过期，
 * 非 JWT 假数据会被按「失效 token」清除登录态（生产 token 均为 JWT）
 */
const makeJwt = (expSecondsFromNow = 3600): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
      sub: 'u-phone',
    })
  );
  return `${header}.${payload}.test-signature`;
};

const PHONE_JWT = makeJwt();

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
        accessToken: PHONE_JWT,
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
    expect(screen.getByTestId('token').textContent).toBe(PHONE_JWT);
    expect(screen.getByTestId('user').textContent).toBe('phoneuser');

    // 同步写入 localStorage（refresh 等机制依赖）
    expect(localStorage.getItem('accessToken')).toBe(PHONE_JWT);
    expect(localStorage.getItem('refreshToken')).toBe('rt-phone');
    expect(localStorage.getItem('user')).toContain('phoneuser');
    expect(authControllerRegisterByPhone).toHaveBeenCalledWith({
      throwOnError: true,
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

describe('AuthContext - 跨标签页认证同步', () => {
  const OTHER_USER = { id: 'u-other', username: 'otheruser' };

  /**
   * 模拟「其他标签页」写入同一 localStorage 并派发 storage 事件
   * （本标签页自身的 setItem 不触发 storage 事件，不会自我递归）。
   * 包在 act 里以 flush 事件监听器引发的 state 更新。
   */
  async function dispatchCrossTabWrite(
    key: string,
    value: string | null
  ): Promise<void> {
    const oldValue = localStorage.getItem(key);
    await act(async () => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      window.dispatchEvent(
        new StorageEvent('storage', { key, oldValue, newValue: value })
      );
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { ...OTHER_USER, email: 'o@x.com' },
    } as never);
  });

  it('其他标签页登录 → 本标签页同步为已登录（三键按 accessToken → refreshToken → user 顺序写入）', async () => {
    renderProvider();
    expect(screen.getByTestId('auth').textContent).toBe('false');

    await dispatchCrossTabWrite('accessToken', PHONE_JWT);
    await dispatchCrossTabWrite('refreshToken', 'rt-other');
    await dispatchCrossTabWrite('user', JSON.stringify(OTHER_USER));

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });
    expect(screen.getByTestId('token').textContent).toBe(PHONE_JWT);
    // 同步后走既有 /auth/profile 校验链路，user 以接口返回为准
    expect(authControllerGetProfile).toHaveBeenCalled();
    expect(screen.getByTestId('user').textContent).toBe('otheruser');
  });

  it('其他标签页登出 → 本标签页同步清除登录态（既有行为回归）', async () => {
    localStorage.setItem('accessToken', PHONE_JWT);
    localStorage.setItem('refreshToken', 'rt-other');
    localStorage.setItem('user', JSON.stringify(OTHER_USER));
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });

    await dispatchCrossTabWrite('accessToken', null);

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('false');
    });
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('三元组尚未写全时不更新，等 user 键补齐后再同步', async () => {
    renderProvider();

    await dispatchCrossTabWrite('accessToken', PHONE_JWT);
    // accessToken 已写但 user 缺失：isAuthenticated 需 token 与 user 同时非空，
    // 因此保持游客态，避免半状态被当成已登录
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');

    await dispatchCrossTabWrite('refreshToken', 'rt-other');
    expect(screen.getByTestId('auth').textContent).toBe('false');

    await dispatchCrossTabWrite('user', JSON.stringify(OTHER_USER));

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });
    expect(screen.getByTestId('user').textContent).toBe('otheruser');
  });

  it('其他标签页刷新 user（token 未变）→ 本标签页同步最新用户信息', async () => {
    localStorage.setItem('accessToken', PHONE_JWT);
    localStorage.setItem('refreshToken', 'rt-other');
    localStorage.setItem('user', JSON.stringify(OTHER_USER));
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });
    expect(screen.getByTestId('user').textContent).toBe('otheruser');

    await dispatchCrossTabWrite(
      'user',
      JSON.stringify({ id: 'u-other', username: 'renamed' })
    );
    expect(screen.getByTestId('user').textContent).toBe('renamed');
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });
});
