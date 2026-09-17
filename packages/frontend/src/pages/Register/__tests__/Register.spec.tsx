///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Register } from '../index';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import {
  authControllerCheckFieldUniqueness,
  authControllerSendSmsCode,
} from '@/api-sdk';
import type { PublicRuntimeConfig } from '@/contexts/RuntimeConfigContext';

vi.mock('@/api-sdk', () => ({
  authControllerRegisterByPhone: vi.fn(),
  authControllerCheckFieldUniqueness: vi.fn(),
  authControllerSendSmsCode: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: vi.fn(),
}));

vi.mock('@/contexts/BrandContext', () => ({
  useBrandConfig: () => ({ config: { title: 'CloudCAD', logo: '/logo.png' } }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div />,
}));

vi.mock('@/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div />,
}));

vi.mock('@/components/InteractiveBackground', () => ({
  InteractiveBackground: () => <div />,
}));

const DEFAULT_CONFIG: PublicRuntimeConfig = {
  mailEnabled: false,
  requireEmailVerification: false,
  smsEnabled: false,
  requirePhoneVerification: false,
  supportEmail: '',
  supportPhone: '',
  allowRegister: true,
  wechatEnabled: false,
  wechatAutoRegister: false,
  maxFileSize: 100,
  collaborationEnabled: false,
};

function mockConfig(overrides: Partial<PublicRuntimeConfig> = {}) {
  vi.mocked(useRuntimeConfig).mockReturnValue({
    config: { ...DEFAULT_CONFIG, ...overrides },
    loading: false,
  });
}

function mockAuth() {
  const register = vi.fn().mockResolvedValue({
    email: 'test@example.com',
    message: 'ok',
  });
  const registerByPhone = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    token: null,
    login: vi.fn(),
    loginByPhone: vi.fn(),
    loginWithWechat: vi.fn(),
    register,
    registerByPhone,
    verifyEmailAndLogin: vi.fn(),
    verifyPhoneAndLogin: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    loading: false,
    isAuthenticated: false,
    error: null,
    setError: vi.fn(),
  });
  return { register, registerByPhone };
}

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

async function fillBasicInfoAndGoNext(
  overrides: {
    username?: string;
    email?: string;
    phone?: string;
    code?: string;
  } = {}
) {
  fireEvent.change(screen.getByLabelText(/用户名/), {
    target: { value: overrides.username ?? 'testuser' },
  });
  if (overrides.email !== undefined) {
    fireEvent.change(screen.getByLabelText(/邮箱地址/), {
      target: { value: overrides.email },
    });
  }
  if (overrides.phone !== undefined) {
    fireEvent.change(screen.getByLabelText(/手机号/), {
      target: { value: overrides.phone },
    });
  }
  if (overrides.code !== undefined) {
    fireEvent.change(screen.getByLabelText(/验证码/), {
      target: { value: overrides.code },
    });
  }
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  await waitFor(() => {
    expect(screen.getByText('设置密码')).toBeTruthy();
  });
}

async function fillPasswordAndSubmit() {
  fireEvent.change(screen.getByLabelText(/^密码/), {
    target: { value: 'Password123!' },
  });
  fireEvent.change(screen.getByLabelText(/确认密码/), {
    target: { value: 'Password123!' },
  });
  const form = document.querySelector('form');
  expect(form).toBeTruthy();
  fireEvent.submit(form!);
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(authControllerCheckFieldUniqueness).mockResolvedValue({
      data: {},
    } as never);
    vi.mocked(authControllerSendSmsCode).mockResolvedValue({
      data: { success: true },
    } as never);
  });

  it('renders the register form with basic info fields', () => {
    mockConfig();
    renderRegister();
    expect(screen.getByText('创建账户')).toBeTruthy();
    expect(screen.getByLabelText(/用户名/)).toBeTruthy();
    expect(screen.getByLabelText(/昵称/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '下一步' })).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getAllByText(/用户协议/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/隐私政策/).length).toBeGreaterThan(0);
  });

  it('blocks proceeding until the agreement checkbox is checked', async () => {
    mockConfig();
    renderRegister();

    fireEvent.change(screen.getByLabelText(/用户名/), {
      target: { value: 'testuser' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() => {
      expect(
        screen.getByText('请先阅读并同意《用户协议》和《隐私政策》')
      ).toBeTruthy();
    });
    expect(screen.getByText('创建账户')).toBeTruthy();
  });

  it('renders phone fields when sms registration is enabled', () => {
    mockConfig({ smsEnabled: true, requirePhoneVerification: true });
    renderRegister();
    expect(screen.getByLabelText(/手机号/)).toBeTruthy();
    expect(screen.getByLabelText(/验证码/)).toBeTruthy();
  });

  it('submits email registration through the default flow', async () => {
    mockConfig({ mailEnabled: true, requireEmailVerification: true });
    const { register, registerByPhone } = mockAuth();
    renderRegister();

    await fillBasicInfoAndGoNext({
      username: 'testuser',
      email: 'test@example.com',
    });
    await fillPasswordAndSubmit();

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'Password123!',
        nickname: undefined,
        email: 'test@example.com',
        wechatTempToken: undefined,
      });
    });
    expect(registerByPhone).not.toHaveBeenCalled();
  });

  it('reaches the phone registration branch with real phone form values', async () => {
    mockConfig({
      smsEnabled: true,
      requirePhoneVerification: true,
      mailEnabled: false,
      requireEmailVerification: false,
    });
    const { register, registerByPhone } = mockAuth();
    renderRegister();

    await fillBasicInfoAndGoNext({
      username: 'testuser',
      phone: '13800138000',
      code: '123456',
    });
    await fillPasswordAndSubmit();

    await waitFor(() => {
      expect(registerByPhone).toHaveBeenCalledWith({
        phone: '13800138000',
        code: '123456',
        username: 'testuser',
        password: 'Password123!',
        nickname: undefined,
      });
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('phone registration goes through AuthContext.registerByPhone (T4 bug: token state must be set)', async () => {
    mockConfig({
      smsEnabled: true,
      requirePhoneVerification: true,
      mailEnabled: false,
      requireEmailVerification: false,
    });
    const { registerByPhone } = mockAuth();
    renderRegister();

    await fillBasicInfoAndGoNext({
      username: 'testuser',
      phone: '13800138000',
      code: '123456',
    });
    await fillPasswordAndSubmit();

    await waitFor(() => {
      expect(registerByPhone).toHaveBeenCalled();
    });
    // 回归断言：不再直接写 localStorage（直写会绕过 AuthContext → token state 恒 null → 被 ProtectedRoute 弹回 /login）
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
