import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogoutApi = vi.fn();
const mockShowToast = vi.fn();
const mockNavigateToLogin = vi.fn();

vi.mock('../api-sdk', () => ({
  authControllerLogout: mockLogoutApi,
}));

vi.mock('vant', () => ({
  showToast: mockShowToast,
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

vi.mock('@/utils/authNavigate', () => ({
  navigateToLogin: mockNavigateToLogin,
}));

const {
  resolveRedirectTarget,
  applyAuthResponse,
  clearSession,
  logout,
  isTokenExpired,
  readToken,
  readUser,
  patchUser,
  onSessionChanged,
  AUTH_PAGE_PATHS,
  setRegisterPhonePending,
  getRegisterPhonePending,
  clearRegisterPhonePending,
  REGISTER_PHONE_PENDING_KEY,
} = await import('./authSession');

/** 构造形如 header.payload.signature 的假 JWT */
function makeJwt(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('resolveRedirectTarget', () => {
  it('接受同源内部路径', () => {
    expect(resolveRedirectTarget('/shell/file')).toBe('/shell/file');
    expect(resolveRedirectTarget('/shell/file?redirect=/x')).toBe('/shell/file?redirect=/x');
    expect(resolveRedirectTarget('  /shell  ')).toBe('/shell');
  });

  it('拒绝协议相对与外部 URL', () => {
    expect(resolveRedirectTarget('//evil.com')).toBe('/shell');
    expect(resolveRedirectTarget('https://evil.com')).toBe('/shell');
    expect(resolveRedirectTarget('javascript:alert(1)')).toBe('/shell');
  });

  it('非字符串与空值回退默认 /shell，也支持自定义回退', () => {
    expect(resolveRedirectTarget(undefined)).toBe('/shell');
    expect(resolveRedirectTarget(null)).toBe('/shell');
    expect(resolveRedirectTarget(42)).toBe('/shell');
    expect(resolveRedirectTarget('', '/home')).toBe('/home');
  });
});

describe('AUTH_PAGE_PATHS（认证页路径单源）', () => {
  it('覆盖全部 6 个认证覆盖层路径', () => {
    expect(AUTH_PAGE_PATHS).toEqual([
      '/login',
      '/register',
      '/verify-email',
      '/verify-phone',
      '/forgot-password',
      '/reset-password',
    ]);
  });
});

describe('isTokenExpired（唯一 exp 判定）', () => {
  it('无 token 视为已过期（引导登录）', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
    expect(isTokenExpired('')).toBe(true);
  });

  it('无法解析 / 无 exp 视为有效（交由 401 刷新兜底）', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(false);
    expect(isTokenExpired(makeJwt({ sub: 'u1' }))).toBe(false);
  });

  it('按 exp 秒级时间戳判定过期', () => {
    const pastSec = Math.floor(Date.now() / 1000) - 10;
    const futureSec = Math.floor(Date.now() / 1000) + 600;
    expect(isTokenExpired(makeJwt({ exp: pastSec }))).toBe(true);
    expect(isTokenExpired(makeJwt({ exp: futureSec }))).toBe(false);
  });
});

describe('readToken / readUser / patchUser', () => {
  it('readToken 过滤 undefined/null 脏值', () => {
    expect(readToken()).toBeNull();
    localStorage.setItem('accessToken', 'tok');
    expect(readToken()).toBe('tok');
    localStorage.setItem('accessToken', 'null');
    expect(readToken()).toBeNull();
    localStorage.setItem('accessToken', 'undefined');
    expect(readToken()).toBeNull();
  });

  it('readUser：JSON 损坏返回 null', () => {
    expect(readUser()).toBeNull();
    localStorage.setItem('user', '{"id":"u1"}');
    expect(readUser<{ id: string }>()).toEqual({ id: 'u1' });
    localStorage.setItem('user', '{broken');
    expect(readUser()).toBeNull();
  });

  it('patchUser 增量合并既有 user 并通知 written', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'alice' }));
    const events: string[] = [];
    onSessionChanged((e) => events.push(e));

    patchUser({ isVip: true });

    expect(readUser()).toEqual({ id: 'u1', username: 'alice', isVip: true });
    expect(events).toContain('written');
  });
});

describe('applyAuthResponse', () => {
  it('写入 token/user 并通知 written（状态机监听方据此切换）', () => {
    const events: string[] = [];
    onSessionChanged((e) => events.push(e));

    applyAuthResponse({
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: 1, name: 'u' },
    });
    expect(localStorage.getItem('accessToken')).toBe('at');
    expect(localStorage.getItem('refreshToken')).toBe('rt');
    expect(JSON.parse(localStorage.getItem('user') || '{}')).toEqual({ id: 1, name: 'u' });
    expect(events).toEqual(['written']);
  });

  it('缺 refreshToken / user 时不写对应键', () => {
    localStorage.setItem('user', JSON.stringify({ id: 0 }));
    applyAuthResponse({ accessToken: 'at' });
    expect(localStorage.getItem('accessToken')).toBe('at');
    expect(localStorage.getItem('refreshToken')).toBeNull();
    // 旧 user 不被空值覆盖
    expect(JSON.parse(localStorage.getItem('user') || '')).toEqual({ id: 0 });
  });
});

describe('clearSession（唯一三键清理出口）', () => {
  it('清空 accessToken/refreshToken/user 并通知 cleared', () => {
    localStorage.setItem('accessToken', 'at');
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('user', '{"id":1}');
    const events: string[] = [];
    onSessionChanged((e) => events.push(e));

    clearSession();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(events).toEqual(['cleared']);
  });
});

describe('logout（统一失败协议：API 失败仍清本地会话并跳登录）', () => {
  it('API 成功：清三键 + 跳登录，不 toast', async () => {
    localStorage.setItem('accessToken', 'at');
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('user', '{"id":1}');
    mockLogoutApi.mockResolvedValue({ data: {} });

    await logout();

    expect(mockLogoutApi).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(mockNavigateToLogin).toHaveBeenCalledTimes(1);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('API 失败：toast 后端错误文案，仍清三键并跳登录（废止「失败不清」协议）', async () => {
    localStorage.setItem('accessToken', 'at');
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('user', '{"id":1}');
    mockLogoutApi.mockRejectedValue({ code: 'INTERNAL', message: '服务开小差了' });

    await logout();

    expect(mockShowToast).toHaveBeenCalledWith('服务开小差了');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(mockNavigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('API 失败且无后端 message：toast 兜底文案', async () => {
    mockLogoutApi.mockRejectedValue({});
    await logout();
    expect(mockShowToast).toHaveBeenCalledWith('退出失败，请重试');
    expect(mockNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});

describe('registerPhonePending 中转凭证', () => {
  it('写入后可读出，字段完整', () => {
    setRegisterPhonePending({
      phone: '13800138000',
      code: '123456',
      username: 'alice',
      password: 'Passw0rd!',
      nickname: '小爱',
    });
    expect(sessionStorage.getItem(REGISTER_PHONE_PENDING_KEY)).not.toBeNull();
    expect(getRegisterPhonePending()).toEqual({
      phone: '13800138000',
      code: '123456',
      username: 'alice',
      password: 'Passw0rd!',
      nickname: '小爱',
    });
  });

  it('读取不删除：邮箱验证码输入中刷新后可续上', () => {
    setRegisterPhonePending({
      phone: '13800138000',
      code: '123456',
      username: 'alice',
      password: 'Passw0rd!',
    });
    expect(getRegisterPhonePending()).not.toBeNull();
    expect(getRegisterPhonePending()).not.toBeNull();
  });

  it('缺必要字段或 JSON 损坏时返回 null', () => {
    expect(getRegisterPhonePending()).toBeNull();

    sessionStorage.setItem(REGISTER_PHONE_PENDING_KEY, '{not json');
    expect(getRegisterPhonePending()).toBeNull();

    sessionStorage.setItem(
      REGISTER_PHONE_PENDING_KEY,
      JSON.stringify({ phone: '13800138000', username: 'alice' })
    );
    expect(getRegisterPhonePending()).toBeNull();

    sessionStorage.setItem(
      REGISTER_PHONE_PENDING_KEY,
      JSON.stringify({ phone: '13800138000', code: '1', username: 'alice', password: 'p' })
    );
    expect(getRegisterPhonePending()).not.toBeNull();
  });

  it('clear 后读不到', () => {
    setRegisterPhonePending({
      phone: '13800138000',
      code: '123456',
      username: 'alice',
      password: 'Passw0rd!',
    });
    clearRegisterPhonePending();
    expect(getRegisterPhonePending()).toBeNull();
  });
});
