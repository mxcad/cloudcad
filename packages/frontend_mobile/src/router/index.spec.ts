import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRefreshToken = vi.fn();

vi.mock('../api-sdk', () => ({
  authControllerRefreshToken: mockRefreshToken,
  authControllerLogout: vi.fn(),
}));

vi.mock('@cloudcad/api-sdk/client.gen', () => ({
  client: {
    setConfig: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      error: { use: vi.fn() },
    },
  },
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
  i18nScope: { activeLanguage: 'zh-CN' },
}));

vi.mock('vant', () => ({
  showToast: vi.fn(),
}));

// 必须走 '@/' 别名：index.ts 用 '@/utils/authSession' 导入，若这里用相对路径，
// Vite 会实例化两份 authSession 模块，onSessionChanged 注册与触发落到不同 Set。
const { hasValidAuth } = await import('./index');
const { clearSession } = await import('@/utils/authSession');

function makeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.signature`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const validToken = () => makeJwt(nowSeconds() + 3600);
const expiredToken = () => makeJwt(nowSeconds() - 60);

function setSession(accessToken: string | null, refreshToken: string | null) {
  if (accessToken) localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // authRefreshOutcome 按会话缓存，clearSession 会触发 onSessionChanged('cleared') 重置它
  clearSession();
});

describe('hasValidAuth（守卫的可续期登录态判定）', () => {
  it('accessToken 有效 → 已登录，不触发刷新', async () => {
    setSession(validToken(), 'refresh-token');
    await expect(hasValidAuth()).resolves.toBe(true);
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });

  it('accessToken 过期但 refreshToken 有效 → 刷新成功后判为已登录（回归：冷启动误弹登录页）', async () => {
    setSession(expiredToken(), 'refresh-token');
    mockRefreshToken.mockResolvedValue({
      data: { accessToken: validToken(), refreshToken: 'new-refresh' },
    });

    await expect(hasValidAuth()).resolves.toBe(true);
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('accessToken 过期且刷新失败 → 未登录', async () => {
    setSession(expiredToken(), 'refresh-token');
    mockRefreshToken.mockResolvedValue({ data: {} });

    await expect(hasValidAuth()).resolves.toBe(false);
  });

  it('accessToken 过期但无 refreshToken → 未登录且不发请求', async () => {
    setSession(expiredToken(), null);
    await expect(hasValidAuth()).resolves.toBe(false);
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });

  it('无 token → 未登录且不发请求', async () => {
    await expect(hasValidAuth()).resolves.toBe(false);
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });

  it('刷新失败后缓存判定，后续导航不再重复发起刷新（避免网络抖动时每次导航都挂等待）', async () => {
    setSession(expiredToken(), 'refresh-token');
    mockRefreshToken.mockResolvedValue({ data: {} });

    await hasValidAuth();
    await hasValidAuth();
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('刷新挂住 → 超时按未登录处理，不永久卡住导航', async () => {
    setSession(expiredToken(), 'refresh-token');
    // 永不返回的请求：没有上限的话这个守卫会永久 pending
    let resolveRefresh: ((value: unknown) => void) | undefined;
    mockRefreshToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    vi.useFakeTimers();
    try {
      const pending = hasValidAuth();
      let settled = false;
      pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1100);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
      // 结算这个挂住的请求：否则 apiConfig 的 in-flight refreshPromise 永不归零，
      // 会毒化后续用例（后续调用拿到同一个永不 resolve 的 promise）
      resolveRefresh?.({ data: {} });
      await Promise.resolve();
      await Promise.resolve();
    }
  });

  it('会话清理触发 onSessionChanged → 重置缓存，允许重新尝试刷新', async () => {
    setSession(expiredToken(), 'refresh-token');
    mockRefreshToken.mockResolvedValue({ data: {} });
    await hasValidAuth();
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);

    // clearSession 触发 onSessionChanged('cleared') 重置缓存，
    // 之后重新写入过期 accessToken + refreshToken，判定应重新尝试刷新
    clearSession();
    setSession(expiredToken(), 'refresh-token-2');
    mockRefreshToken.mockResolvedValue({
      data: { accessToken: validToken(), refreshToken: 'r' },
    });

    await expect(hasValidAuth()).resolves.toBe(true);
    expect(mockRefreshToken).toHaveBeenCalledTimes(2);
  });
});
