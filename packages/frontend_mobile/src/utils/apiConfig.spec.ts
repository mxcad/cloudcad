import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRefreshToken = vi.fn();

vi.mock('../api-sdk', () => ({
  authControllerRefreshToken: mockRefreshToken,
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
  i18nScope: { activeLanguage: 'zh-CN' },
}));

vi.mock('vant', () => ({
  showToast: vi.fn(),
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

const { refreshTokensOnce } = await import('./apiConfig');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('refreshTokensOnce（唯一刷新出口）', () => {
  it('并发调用共享同一 in-flight promise，只发一次 refresh 请求（回归 401 竞态）', async () => {
    localStorage.setItem('refreshToken', 'old-token');
    let resolveRefresh: (value: unknown) => void;
    mockRefreshToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const p1 = refreshTokensOnce();
    const p2 = refreshTokensOnce(); // 应并入 p1 的 in-flight promise，不再各自发请求

    resolveRefresh!({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockRefreshToken).toHaveBeenCalledWith({ body: { refreshToken: 'old-token' } });
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it('刷新成功后写回新 token', async () => {
    localStorage.setItem('refreshToken', 'old-token');
    mockRefreshToken.mockResolvedValue({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });

    const result = await refreshTokensOnce();

    expect(result).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it('确定性认证失败（401/UNAUTHORIZED）清除本地 token，打断反复重试', async () => {
    localStorage.setItem('refreshToken', 'expired-token');
    localStorage.setItem('accessToken', 'old-access');
    localStorage.setItem('user', '{}');
    mockRefreshToken.mockRejectedValue({
      code: 'UNAUTHORIZED',
      message: '刷新Token无效或已过期',
    });

    const result = await refreshTokensOnce();

    expect(result).toBe(false);
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('网络错误保留 token 供重试', async () => {
    localStorage.setItem('refreshToken', 'valid-token');
    mockRefreshToken.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await refreshTokensOnce();

    expect(result).toBe(false);
    expect(localStorage.getItem('refreshToken')).toBe('valid-token');
  });

  it('无 refresh token 时直接返回 false 且不发请求', async () => {
    const result = await refreshTokensOnce();

    expect(result).toBe(false);
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });
});
