import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useWechatAuth,
  WECHAT_POLL_INTERVAL_MS,
  WECHAT_STORAGE_POLL_INTERVAL_MS,
} from './useWechatAuth';
import {
  authControllerGetProfile,
  authControllerPollWechatTransaction,
} from '@/api-sdk';
import * as clientSetup from '@/config/clientSetup';

vi.mock('@/api-sdk', () => ({
  authControllerGetProfile: vi.fn(),
  authControllerPollWechatTransaction: vi.fn(),
}));

vi.mock('@/config/clientSetup', () => ({
  triggerProactiveRefresh: vi.fn(),
}));

const LOGIN_RESULT = {
  accessToken: 'at-123',
  refreshToken: 'rt-456',
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

describe('useWechatAuth - hash parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { id: 'u1', username: 'wechat-user' },
    } as never);
  });

  afterEach(() => {
    setHash('');
    setSearch('');
  });

  it('handles non-popup hash login: writes tokens and notifies onLoginSuccess', async () => {
    const onError = vi.fn();
    const onLoginSuccess = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(rawOf(LOGIN_RESULT))}`
    );

    renderHook(() =>
      useWechatAuth({ onError, onLoginSuccess })
    );

    expect(localStorage.getItem('accessToken')).toBe('at-123');
    expect(localStorage.getItem('refreshToken')).toBe('rt-456');
    // 立即通知：token 已写入（user 为 null）
    expect(onLoginSuccess).toHaveBeenCalledWith(null, 'at-123');
    expect(clientSetup.triggerProactiveRefresh).toHaveBeenCalled();

    // profile 拉取后再次通知（user 信息）
    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith(
        { id: 'u1', username: 'wechat-user' },
        'at-123'
      );
    });
    expect(localStorage.getItem('user')).toContain('wechat-user');
  });

  it('popup hash: writes wechat_auth_result to localStorage and closes window', () => {
    const closeSpy = vi
      .spyOn(window, 'close')
      .mockImplementation(() => {});
    const onLoginSuccess = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(
        rawOf({ ...LOGIN_RESULT, isPopup: true })
      )}`
    );

    renderHook(() => useWechatAuth({ onError: vi.fn(), onLoginSuccess }));

    expect(localStorage.getItem('wechat_auth_result')).toBe(
      rawOf({ ...LOGIN_RESULT, isPopup: true })
    );
    expect(closeSpy).toHaveBeenCalled();
    // popup 分支自身不触发登录成功
    expect(onLoginSuccess).not.toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it('hash need_register: stores wechatTempToken and navigates with wechatAutoRegister state', () => {
    const navigateTo = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(
        rawOf({ needRegister: true, tempToken: 'tmp-1' })
      )}`
    );

    renderHook(() =>
      useWechatAuth({
        onError: vi.fn(),
        wechatAutoRegister: true,
        navigateTo,
      })
    );

    expect(sessionStorage.getItem('wechatTempToken')).toBe('tmp-1');
    expect(navigateTo).toHaveBeenCalledWith('/register?wechat=1', {
      state: { message: '微信自动注册失败，请手动完成注册' },
    });
  });

  it('hash bind_email: stores wechatTempToken and navigates to verify-email with tempToken state', () => {
    const navigateTo = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(
        rawOf({ requireEmailBinding: true, tempToken: 'tmp-2' })
      )}`
    );

    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), navigateTo })
    );

    expect(sessionStorage.getItem('wechatTempToken')).toBe('tmp-2');
    expect(navigateTo).toHaveBeenCalledWith('/verify-email', {
      state: { tempToken: 'tmp-2', mode: 'bind' },
    });
  });

  it('hash bind_phone: stores wechatTempToken and navigates to verify-phone', () => {
    const navigateTo = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(
        rawOf({ requirePhoneBinding: true, tempToken: 'tmp-3' })
      )}`
    );

    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), navigateTo })
    );

    expect(sessionStorage.getItem('wechatTempToken')).toBe('tmp-3');
    expect(navigateTo).toHaveBeenCalledWith('/verify-phone', {
      state: { tempToken: 'tmp-3', mode: 'bind' },
    });
  });

  it('hash error: notifies onError', () => {
    const onError = vi.fn();
    setHash(
      `wechat_result=${encodeURIComponent(rawOf({ error: '授权失败' }))}`
    );

    renderHook(() => useWechatAuth({ onError }));

    expect(onError).toHaveBeenCalledWith('微信登录失败：授权失败');
  });

  it('hash login profile 连续失败 2 次后：兜底用空 user 完成登录（不卡登录页）', async () => {
    vi.useFakeTimers();
    try {
      const onLoginSuccess = vi.fn();
      vi.mocked(authControllerGetProfile).mockRejectedValue(
        new Error('profile down')
      );
      setHash(
        `wechat_result=${encodeURIComponent(rawOf(LOGIN_RESULT))}`
      );

      renderHook(() =>
        useWechatAuth({ onError: vi.fn(), onLoginSuccess })
      );

      expect(localStorage.getItem('accessToken')).toBe('at-123');
      expect(onLoginSuccess).toHaveBeenCalledWith(null, 'at-123');

      // hash 路径 action.user 恒为 undefined：profile 第 1 次失败 → 1.5s 重试
      // → 第 2 次失败 → 兜底空 user 对象完成登录跳转（与 txn 路径同构）
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(authControllerGetProfile).toHaveBeenCalledTimes(2);
      expect(onLoginSuccess).toHaveBeenCalledWith({}, 'at-123');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useWechatAuth - storage event & fallback polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { id: 'u1', username: 'wechat-user' },
    } as never);
  });

  afterEach(() => {
    setHash('');
    setSearch('');
    vi.useRealTimers();
  });

  it('processes wechat_auth_result via storage event', async () => {
    const onLoginSuccess = vi.fn();
    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), onLoginSuccess })
    );

    localStorage.setItem(
      'wechat_auth_result',
      rawOf({ accessToken: 'at-storage', refreshToken: 'rt' })
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'wechat_auth_result',
        newValue: rawOf({ accessToken: 'at-storage', refreshToken: 'rt' }),
      })
    );

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith(null, 'at-storage');
    });
    expect(localStorage.getItem('wechat_auth_result')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBe('at-storage');
  });

  it('fallback polling picks up result missed by storage event (deduped)', async () => {
    vi.useFakeTimers();
    const onLoginSuccess = vi.fn();
    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), onLoginSuccess })
    );

    localStorage.setItem(
      'wechat_auth_result',
      rawOf({ accessToken: 'at-poll', refreshToken: 'rt' })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_STORAGE_POLL_INTERVAL_MS);
    });

    expect(onLoginSuccess).toHaveBeenCalledWith(null, 'at-poll');
    expect(localStorage.getItem('wechat_auth_result')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBe('at-poll');
  });

  it('popup storage result error: reports without 微信登录失败 prefix (legacy AuthContext behavior)', async () => {
    const onError = vi.fn();
    renderHook(() => useWechatAuth({ onError, onLoginSuccess: vi.fn() }));

    localStorage.setItem('wechat_auth_result', rawOf({ error: '授权失败' }));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'wechat_auth_result',
        newValue: rawOf({ error: '授权失败' }),
      })
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('授权失败');
    });
  });
});

describe('useWechatAuth - transaction polling (2s × 60)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.mocked(authControllerGetProfile).mockResolvedValue({
      data: { id: 'u1', username: 'wechat-user' },
    } as never);
  });

  afterEach(() => {
    setHash('');
    setSearch('');
    vi.useRealTimers();
  });

  it('polls every 2s and completes login when transaction is completed', async () => {
    const onLoginSuccess = vi.fn();
    setSearch('?wechat_txn=txn-1');
    vi.mocked(authControllerPollWechatTransaction)
      .mockResolvedValueOnce({
        data: { status: 'pending' },
      } as never)
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          action: 'login',
          accessToken: 'at-txn',
          refreshToken: 'rt-txn',
          user: { id: 'u9', username: 'txn-user' },
        },
      } as never);

    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), onLoginSuccess })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
    });

    expect(authControllerPollWechatTransaction).toHaveBeenCalledWith({
      query: { txn: 'txn-1' },
    });
    expect(localStorage.getItem('accessToken')).toBe('at-txn');
    expect(localStorage.getItem('refreshToken')).toBe('rt-txn');
    // user 以 profile 拉取为准（AuthContext 主逻辑：回调不携带 user 时从 profile 刷新）
    expect(localStorage.getItem('user')).toContain('wechat-user');
    expect(onLoginSuccess).toHaveBeenCalledWith(null, 'at-txn');
    expect(onLoginSuccess).toHaveBeenCalledWith(
      { id: 'u1', username: 'wechat-user' },
      'at-txn'
    );
  });

  it('times out after 60 attempts and reports timeout error', async () => {
    const onError = vi.fn();
    setSearch('?wechat_txn=txn-2');
    vi.mocked(authControllerPollWechatTransaction).mockResolvedValue({
      data: { status: 'pending' },
    } as never);

    renderHook(() => useWechatAuth({ onError }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WECHAT_POLL_INTERVAL_MS * 61
      );
    });

    expect(authControllerPollWechatTransaction).toHaveBeenCalledTimes(60);
    expect(onError).toHaveBeenCalledWith('微信登录超时，请重试');
  });

  it('reports wechat_error query param immediately', () => {
    const onError = vi.fn();
    setSearch('?wechat_txn=txn-3&wechat_error=%E5%A4%B1%E8%B4%A5');

    renderHook(() => useWechatAuth({ onError }));

    expect(onError).toHaveBeenCalledWith('微信登录失败：失败');
    expect(authControllerPollWechatTransaction).not.toHaveBeenCalled();
  });

  it('txn login without refreshToken: skips refreshToken write (legacy behavior)', async () => {
    const onLoginSuccess = vi.fn();
    setSearch('?wechat_txn=txn-4');
    vi.mocked(authControllerPollWechatTransaction).mockResolvedValue({
      data: {
        status: 'completed',
        action: 'login',
        accessToken: 'at-no-rt',
        user: { id: 'u1', username: 'u' },
      },
    } as never);

    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), onLoginSuccess })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
    });

    expect(localStorage.getItem('accessToken')).toBe('at-no-rt');
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('txn completed with non-login action: ignored silently (purpose isolation)', async () => {
    const onError = vi.fn();
    const onLoginSuccess = vi.fn();
    setSearch('?wechat_txn=txn-5');
    vi.mocked(authControllerPollWechatTransaction).mockResolvedValue({
      data: {
        status: 'completed',
        accessToken: 'at-bind',
        refreshToken: 'rt-bind',
      },
    } as never);

    renderHook(() => useWechatAuth({ onError, onLoginSuccess }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
    });

    // bind/deactivate 等非 login 事务完成：不被全局 login 实例误判为登录失败
    expect(onError).not.toHaveBeenCalled();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('txn login with user: profile 连续失败 2 次后兜底用回调 user 完成登录', async () => {
    const onLoginSuccess = vi.fn();
    setSearch('?wechat_txn=txn-fallback');
    vi.mocked(authControllerPollWechatTransaction).mockResolvedValue({
      data: {
        status: 'completed',
        action: 'login',
        accessToken: 'at-fb',
        refreshToken: 'rt-fb',
        user: { id: 'u9', username: 'txn-user' },
      },
    } as never);
    vi.mocked(authControllerGetProfile).mockRejectedValue(
      new Error('profile down')
    );

    renderHook(() =>
      useWechatAuth({ onError: vi.fn(), onLoginSuccess })
    );

    // 首次轮询完成 → profile 第 1 次失败 → 1.5s 重试 → 第 2 次失败 → 兜底
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WECHAT_POLL_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(authControllerGetProfile).toHaveBeenCalledTimes(2);
    // 兜底：以回调携带的 user 完成登录（对齐旧 txn 带 user 行为）
    expect(onLoginSuccess).toHaveBeenCalledWith(
      { id: 'u9', username: 'txn-user' },
      'at-fb'
    );
    expect(localStorage.getItem('user')).toContain('txn-user');
  });
});
