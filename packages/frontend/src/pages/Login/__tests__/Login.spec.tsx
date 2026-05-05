///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// @ts-nocheck

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Login } from './index';
import * as useLoginFormModule from '../hooks/useLoginForm';

vi.mock('../hooks/useLoginForm');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
    error: null,
    setError: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/contexts/BrandContext', () => ({
  useBrandConfig: () => ({ config: { title: 'CloudCAD', logo: '/logo.png' } }),
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
}));

const mockUseLoginFormReturn = {
  formData: { account: '', password: '' },
  phoneForm: { phone: '', code: '' },
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
  authError: null,
  setAuthError: vi.fn(),
  getAccountLoginLabel: () => '手机号或用户名',
  getAccountLoginPlaceholder: () => '请输入手机号或用户名',
  handleChange: vi.fn(),
  handlePhoneChange: vi.fn(),
  handleSendCode: vi.fn(),
  handleAccountSubmit: vi.fn(),
  handlePhoneSubmit: vi.fn(),
  handleWechatLogin: vi.fn(),
  navigate: vi.fn(),
};

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLoginFormModule.useLoginForm).mockReturnValue(mockUseLoginFormReturn);
  });

  it('renders login page with app title', () => {
    render(<Login />);
    expect(screen.getByText('CloudCAD')).toBeTruthy();
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
    expect(screen.getByText('support@cloudcad.com')).toBeTruthy();
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
    const featureDots = document.querySelectorAll('.feature-dot');
    expect(featureDots.length).toBe(3);
  });

  it('renders copyright text', () => {
    render(<Login />);
    expect(screen.getByText(/© 2026/)).toBeTruthy();
  });
});
