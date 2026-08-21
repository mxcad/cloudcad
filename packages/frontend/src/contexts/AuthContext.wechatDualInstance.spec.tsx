import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import {
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerRegister,
  authControllerRegisterByPhone,
  authControllerGetProfile,
  authControllerLogout,
  authControllerVerifyEmail,
  authControllerVerifyPhone,
  authControllerGetWechatAuthUrl,
  authControllerPollWechatTransaction,
} from '@/api-sdk';
import { WECHAT_POLL_INTERVAL_MS } from '@/hooks/useWechatAuth';

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
  authControllerPollWechatTransaction: vi.fn(),
}));

vi.mock('@/config/clientSetup', () => ({
  setTokenRefreshCallback: vi.fn(),
  setAuthFailureCallback: vi.fn(),
  triggerProactiveRefresh: vi.fn(),
  cancelProactiveRefresh: vi.fn(),
}));

vi.mock('@/utils/permissionUtils', () => ({
  clearProjectPermissionsCache: vi.fn(),
}));

vi.mock('react-device-detect', () => ({
  isMobile: false,
}));

// 注意：不 mock useWechatAuth —— 双实例集成测试需要真实 hook。

const LOGIN_RESULT = {
  accessToken: 'at-dual',
  refreshToken: 'rt-dual',
};

function setHash(value: string) {
  window.history.replaceState({}, '', `#${value}`);
}

function setSearch(value: string) {
  window.history.replaceState({}, '', `/login${value}`);
}

function rawOf(result: unknown): string {
  return JSON.stringify(result);
}

/**
 * 模拟 Login 页与 AuthContext 的双实例挂载模式：
 * - 注册页面级微信回调（setWechatLoginCallbacks，卸载时注销）
 * - 登录态生效后跳转（真实 Login 页 isAuthenticated effect 的简化版）
 */
function MockLoginPage({
  navigate,
}: {
  navigate: (path: string, opts?: { state?: unknown }) => void;
}) {
  const { setWechatLoginCallbacks, token, isAuthenticated, error } = useAuth();
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    setWechatLoginCallbacks({
      onError: (msg) => setPageError(msg),
      wechatAutoRegister: false,
      navigateTo: (path, opts) => navigate(path, opts),
    });
    return () => setWechatLoginCallbacks(null);
  }, [setWechatLoginCallbacks, navigate]);

  // 模拟真实 Login 页：登录成功后跳转（不卡在登录页）
  useEffect(() => {
    if (isAuthenticated) navigate('/home', { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <div>
      <span data-testid="token">{token || 'null'}</span>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="page-error">{pageError || 'null'}</span>
      <span data-testid="context-error">{error || 'null'}</span>
    </div>
  );
}

function renderDualInstance(navigate = vi.fn()) {
  return {
    navigate,
    ...render(
      <AuthProvider>
        <MockLoginPage navigate={navigate} />
      </AuthProvider>
    ),
  };
}

describe('wechat dual-instance (AuthContext provider + Login page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { id: 'u1', username: 'dual-user' },
    } as never);
  });

  afterEach(() => {
    setHash('');
    setSearch('');
    vi.useRealTimers();
  });

  it('desktop EXE hash callback: single instance updates auth state and navigates (no stuck)', () => {
    // hash 在页面加载时已存在（EXE 回调 URL），先设置再挂载
    setHash(
      `wechat_result=${encodeURIComponent(rawOf(LOGIN_RESULT))}`
    );
    const { navigate } = renderDualInstance();

    // AuthContext 唯一实例处理 hash → token state 更新（React state，非仅 localStorage）
    expect(localStorage.getItem('accessToken')).toBe('at-dual');
    expect(localStorage.getItem('refreshToken')).toBe('rt-dual');

    // profile 拉取完成后登录态生效 → 页面跳转（不卡在登录页）
    return waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
    });
  });

  it('txn polling: single instance updates auth state and navigates (no stuck)', async () => {
    vi.useFakeTimers();
    // txn 在页面加载时已存在于 URL（微信回调跳转），先设置再挂载
    setSearch('?wechat_txn=txn-dual-1');
    vi.mocked(authControllerPollWechatTransaction)
      .mockResolvedValueOnce({
        data: { status: 'pending' },
      } as never)
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          action: 'login',
          accessToken: 'at-dual-txn',
          refreshToken: 'rt-dual-txn',
          user: { id: 'u9', username: 'txn-user' },
        },
      } as never);
    const { navigate } = renderDualInstance();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
    });

    expect(localStorage.getItem('accessToken')).toBe('at-dual-txn');
    expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('bind/deactivate transaction completion is not misjudged as login failure', async () => {
    vi.useFakeTimers();
    setSearch('?wechat_txn=txn-dual-bind');
    // bind 类事务完成：无 login 流程 action、无 error
    vi.mocked(authControllerPollWechatTransaction).mockResolvedValue({
      data: { status: 'completed', accessToken: 'at-bind' },
    } as never);
    const { navigate } = renderDualInstance();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
    });

    // 全局 login 实例静默忽略：不报"微信登录失败"、不写登录态、不跳转
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
    const pageError = document.querySelector(
      '[data-testid="page-error"]'
    )?.textContent;
    const contextError = document.querySelector(
      '[data-testid="context-error"]'
    )?.textContent;
    expect(pageError).toBe('null');
    expect(contextError).toBe('null');
  });

  it('bind callback hash is preserved for profile bind instance (not consumed by login)', () => {
    setHash(
      `wechat_result=${encodeURIComponent(
        rawOf({ code: 'bind-code', state: 'bind-state', purpose: 'bind' })
      )}`
    );
    const { navigate } = renderDualInstance();

    // bind 结果（code/state）不含 login 字段 → classify 为 null → 无登录副作用
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    // 回归：hash 必须保留——Profile 懒加载晚于 AuthContext 挂载，
    // 若被 login 实例 replaceState 清掉，bind/deactivate 实例将永远拿不到 code/state
    expect(window.location.hash).toContain('wechat_result');
    expect(window.location.hash).toContain('bind-code');
  });

  it('storage popup error: page receives error via registered callbacks', async () => {
    const { navigate } = renderDualInstance();
    await act(async () => {
      localStorage.setItem('wechat_auth_result', rawOf({ error: '授权失败' }));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'wechat_auth_result',
          newValue: rawOf({ error: '授权失败' }),
        })
      );
    });

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="page-error"]')?.textContent
      ).toBe('授权失败');
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
