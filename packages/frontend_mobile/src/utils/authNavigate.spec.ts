import { describe, it, expect, vi, beforeEach } from 'vitest';

// router 是模块单例，mock 必须用 hoisted 保证 factory 执行时已就绪
const { replace, state } = vi.hoisted(() => ({
  replace: vi.fn(),
  state: { fullPath: '/shell' },
}));

vi.mock('@/router', () => ({
  default: {
    replace,
    get currentRoute() {
      return { value: { fullPath: state.fullPath } };
    },
  },
}));

vi.mock('@/utils/authSession', () => ({
  resolveRedirectTarget: (raw: unknown, fallback = '/shell') => {
    if (typeof raw !== 'string') return fallback;
    const target = raw.trim();
    return target.startsWith('/') && !target.startsWith('//') ? target : fallback;
  },
}));

const {
  navigateToLogin,
  navigateToRegister,
  navigateToLoginPage,
  navigateAfterAuth,
} = await import('./authNavigate');

beforeEach(() => {
  vi.clearAllMocks();
  state.fullPath = '/shell';
});

describe('navigateToLogin / navigateToRegister', () => {
  it('默认把当前 fullPath 作为 redirect 带过去', () => {
    state.fullPath = '/shell/file/project/1';
    navigateToLogin();
    expect(replace).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/shell/file/project/1' },
    });
  });

  it('无需回跳的路径不带 redirect', () => {
    state.fullPath = '/shell';
    navigateToLogin();
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: {} });

    state.fullPath = '/login';
    navigateToRegister();
    expect(replace).toHaveBeenCalledWith({ path: '/register', query: {} });
  });

  it('显式传入 redirect 优先于当前路径', () => {
    state.fullPath = '/shell';
    navigateToLogin('/register');
    expect(replace).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/register' },
    });
  });

  it('navigateToLoginPage 不带 redirect（忘记密码等「登录是终点」的入口）', () => {
    state.fullPath = '/shell/file/project/1';
    navigateToLoginPage();
    expect(replace).toHaveBeenCalledWith({ path: '/login' });
  });
});

describe('navigateAfterAuth', () => {
  it('redirect 合法则整串字符串跳转（保留 query）', () => {
    navigateAfterAuth({ redirect: '/shell/file/project/1?tab=roles' });
    expect(replace).toHaveBeenCalledWith('/shell/file/project/1?tab=roles');
  });

  it('redirect 非法或缺失时回壳根', () => {
    navigateAfterAuth({ redirect: 'https://evil.com' });
    expect(replace).toHaveBeenLastCalledWith('/shell');

    navigateAfterAuth({ redirect: '//evil.com' });
    expect(replace).toHaveBeenLastCalledWith('/shell');

    navigateAfterAuth({});
    expect(replace).toHaveBeenLastCalledWith('/shell');

    navigateAfterAuth({ redirect: 42 });
    expect(replace).toHaveBeenLastCalledWith('/shell');
  });
});
