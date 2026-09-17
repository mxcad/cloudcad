import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetAuthenticated = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/composables/useAuthState', () => ({
  useAuthState: () => ({ setAuthenticated: mockSetAuthenticated }),
}));

vi.mock('@/composables/useUser', () => ({
  useUser: () => ({ refresh: mockRefresh }),
}));

const {
  resolveRedirectTarget,
  applyAuthResponse,
  setRegisterPhonePending,
  getRegisterPhonePending,
  clearRegisterPhonePending,
  REGISTER_PHONE_PENDING_KEY,
} = await import('./authSession');

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

describe('applyAuthResponse', () => {
  it('写入 token/user 并切 authenticated 态', () => {
    applyAuthResponse({
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: 1, name: 'u' },
    });
    expect(localStorage.getItem('accessToken')).toBe('at');
    expect(localStorage.getItem('refreshToken')).toBe('rt');
    expect(JSON.parse(localStorage.getItem('user') || '{}')).toEqual({ id: 1, name: 'u' });
    expect(mockSetAuthenticated).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
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
