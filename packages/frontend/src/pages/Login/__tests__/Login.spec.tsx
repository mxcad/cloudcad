///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from '../index';
import * as useLoginFormModule from '../hooks/useLoginForm';
import { DEFAULT_APP_NAME } from '@/constants/appConfig';
import { QUOTA_GUIDE_EVENT } from '@/utils/quotaUpgradeGuide';

// 可变的登录态/会员态持有者：新用例需模拟「登录回来时是否已是会员」，固定对象无法满足
const authMock = vi.hoisted(() => ({
  isAuthenticated: false,
  loading: false,
  user: null as { membershipTierLevel?: number; membershipExpiresAt?: string | null } | null,
}));
const membershipMock = vi.hoisted(() => ({ isVip: false }));

vi.mock('../hooks/useLoginForm');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authMock.isAuthenticated,
    loading: authMock.loading,
    error: null,
    token: authMock.isAuthenticated ? 'token' : null,
    user: authMock.user,
    setError: vi.fn(),
    setWechatLoginCallbacks: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({
    tierLevel: membershipMock.isVip ? 1 : 0,
    isVip: membershipMock.isVip,
    expiresAt: null,
    daysRemaining: membershipMock.isVip ? 99 : 0,
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/contexts/BrandContext', () => ({
  useBrandConfig: () => ({ config: { title: DEFAULT_APP_NAME, logo: '/logo.png' } }),
}));
vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({ config: { smsEnabled: true, mailEnabled: false, wechatEnabled: false } }),
}));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Toggle</button>,
}));
vi.mock('@/components/InteractiveBackground', () => ({
  InteractiveBackground: () => <div data-testid="interactive-bg" />,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null, pathname: '/login' }),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

const mockUseLoginFormReturn = {
  accountForm: {
    watch: vi.fn().mockReturnValue({ account: '', password: '' }),
    setValue: vi.fn(),
    register: vi.fn(),
    trigger: vi.fn(),
    getValues: vi.fn().mockReturnValue({ account: '', password: '' }),
  },
  phoneFormHook: {
    watch: vi.fn().mockReturnValue({ phone: '', code: '' }),
    setValue: vi.fn(),
    register: vi.fn(),
    trigger: vi.fn(),
    getValues: vi.fn().mockReturnValue({ phone: '', code: '' }),
  },
  smsEnabled: true,
  activeTab: 'account' as const,
  setActiveTab: vi.fn(),
  loading: false,
  error: null,
  setError: vi.fn(),
  success: null,
  setSuccess: vi.fn(),
  focusedField: null,
  setFocusedField: vi.fn(),
  showPassword: false,
  setShowPassword: vi.fn(),
  countdown: 0,
  sendingCode: false,
  showSupportModal: false,
  setShowSupportModal: vi.fn(),
  supportModalVariant: 'disabled',
  supportModalCleanupDays: 30,
  authError: null,
  setAuthError: vi.fn(),
  getAccountLoginLabel: () => '手机号或用户名',
  getAccountLoginPlaceholder: () => '请输入手机号或用户名',
  handleSendCode: vi.fn(),
  handleAccountSubmit: vi.fn(),
  handlePhoneSubmit: vi.fn(),
  handleWechatLogin: vi.fn(),
  navigate: vi.fn(),
};

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.isAuthenticated = false;
    authMock.loading = false;
    authMock.user = null;
    membershipMock.isVip = false;
    sessionStorage.clear();
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue(mockUseLoginFormReturn);
  });

  it('renders login page with app title', () => {
    render(<Login />);
    expect(screen.getByText(DEFAULT_APP_NAME)).toBeTruthy();
  });

  it('renders account login form by default', () => {
    render(<Login />);
    expect(screen.getByText('欢迎回来')).toBeTruthy();
    expect(screen.getByText('立即登录')).toBeTruthy();
  });

  it('renders login tabs when SMS is enabled', () => {
    render(<Login />);
    expect(screen.getByText('账号登录')).toBeTruthy();
    expect(screen.getByText('手机登录')).toBeTruthy();
  });

  it('renders register link', () => {
    render(<Login />);
    expect(screen.getByText('立即注册')).toBeTruthy();
  });

  it('renders forgot password link in account form', () => {
    render(<Login />);
    expect(screen.getByText('忘记密码？')).toBeTruthy();
  });

  it('renders theme toggle', () => {
    render(<Login />);
    expect(screen.getByTestId('theme-toggle')).toBeTruthy();
  });

  it('renders interactive background', () => {
    render(<Login />);
    expect(screen.getByTestId('interactive-bg')).toBeTruthy();
  });

  it('renders success alert when success is set', () => {
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue({
      ...mockUseLoginFormReturn,
      success: '验证码已发送',
    });
    render(<Login />);
    expect(screen.getByText('验证码已发送')).toBeTruthy();
  });

  it('renders error alert when error is set', () => {
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue({
      ...mockUseLoginFormReturn,
      error: '登录失败',
    });
    render(<Login />);
    expect(screen.getByText('登录失败')).toBeTruthy();
  });

  it('renders support modal when showSupportModal is true', () => {
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue({
      ...mockUseLoginFormReturn,
      showSupportModal: true,
    });
    render(<Login />);
    expect(screen.getByText('账号已被禁用')).toBeTruthy();
    expect(screen.getByText('710714273@qq.com')).toBeTruthy();
  });

  it('renders deactivated support modal with cleanup days when account is past grace period', () => {
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue({
      ...mockUseLoginFormReturn,
      showSupportModal: true,
      supportModalVariant: 'deactivated',
      supportModalCleanupDays: 30,
    });
    render(<Login />);
    expect(screen.getByText('账号已注销')).toBeTruthy();
    // 正文为多文本节点拼接，用正则断言插值后的完整文案
    expect(screen.getByText(/数据将在 30 天后彻底删除，逾期无法恢复/)).toBeTruthy();
    expect(screen.getByText('710714273@qq.com')).toBeTruthy();
  });

  it('switches tab when phone login tab is clicked', () => {
    const setActiveTab = vi.fn();
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue({
      ...mockUseLoginFormReturn,
      setActiveTab,
    });
    render(<Login />);
    fireEvent.click(screen.getByText('手机登录'));
    expect(setActiveTab).toHaveBeenCalledWith('phone');
  });

  it('renders features bar icons', () => {
    render(<Login />);
    // Features bar exists with tooltip data
    const featureDots = document.querySelectorAll('[data-testid="feature-dot"]');
    expect(featureDots.length).toBe(3);
  });

  it('renders copyright text', () => {
    render(<Login />);
    expect(screen.getByText(/© 2026/)).toBeTruthy();
  });

  it('登录回来已是会员：待办购买意图作废，不再弹出购买弹窗', async () => {
    authMock.isAuthenticated = true;
    authMock.loading = false;
    authMock.user = { membershipTierLevel: 2, membershipExpiresAt: null };
    membershipMock.isVip = true;
    sessionStorage.setItem(
      'pendingVipPurchase',
      JSON.stringify({ restrictionKey: 'export_download' })
    );
    const listener = vi.fn();
    window.addEventListener(QUOTA_GUIDE_EVENT, listener);

    render(<Login />);
    // 等待超过弹窗派发延时（100ms）后仍不应触发
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(QUOTA_GUIDE_EVENT, listener);
  });

  it('登录回来仍非会员：照常弹出待办购买弹窗', async () => {
    authMock.isAuthenticated = true;
    authMock.loading = false;
    membershipMock.isVip = false;
    sessionStorage.setItem(
      'pendingVipPurchase',
      JSON.stringify({ restrictionKey: 'export_download' })
    );
    const listener = vi.fn();
    window.addEventListener(QUOTA_GUIDE_EVENT, listener);

    render(<Login />);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    window.removeEventListener(QUOTA_GUIDE_EVENT, listener);
  });
});
