import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Router } from 'react-router-dom';
import { EmailVerification } from './index';

// 注册流程二次发码回归：后端 register() 已发码并设置 email_verification:rate_limit，
// 页面若再自动 resendVerification 会命中同一频率限制 → 一进来就红框「发送过于频繁」。
// 本测试锁定：state 带 message（注册流程，码已发）不自动重发；仅 email（登录流程）才代发。
const { mockResendVerification } = vi.hoisted(() => ({
  mockResendVerification: vi.fn(async () => ({})),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('@/constants/appConfig', () => ({
  getAppBrandConfig: () => ({ title: 'T', logo: '' }),
}));
vi.mock('@/hooks/useEmailVerification', () => ({
  useEmailVerification: () => ({
    resendVerification: mockResendVerification,
    bindEmailAndLogin: vi.fn(),
    verifyEmailAndRegisterPhone: vi.fn(),
  }),
}));
vi.mock('@/pages/EmailVerification/hooks/useEmailVerificationForm', () => ({
  useEmailVerificationForm: () => ({
    loading: false,
    error: null,
    success: false,
    email: '',
    emailSent: false,
    verificationCode: '',
    setEmail: vi.fn(),
    setVerificationCode: vi.fn(),
    setError: vi.fn(),
    setEmailSent: vi.fn(),
    setSuccess: vi.fn(),
    handleVerifyCode: vi.fn(),
  }),
}));
vi.mock('@/pages/EmailVerification/hooks/useResendEmail', () => ({
  useResendEmail: () => ({
    resendSuccess: false,
    resendCooldown: 0,
    resendLoading: false,
    setResendCooldown: vi.fn(),
    handleResendEmail: vi.fn(),
  }),
}));
vi.mock('@/pages/EmailVerification/components/VerificationForm', () => ({
  VerificationForm: () => <div data-testid="vf" />,
}));
vi.mock('@/pages/EmailVerification/components/SuccessView', () => ({
  SuccessView: () => <div data-testid="sv" />,
}));

const navigatorStub = {
  push: vi.fn(),
  replace: vi.fn(),
  go: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
} as never;

function renderAt(state: unknown) {
  return render(
    <Router
      location={{ pathname: '/verify-email', state } as never}
      navigator={navigatorStub}
    >
      <EmailVerification />
    </Router>
  );
}

describe('EmailVerification 自动重发（注册流程不再二次发码）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('注册流程（state 带 message = 码已发）：不自动重发，避免命中频率限制', () => {
    renderAt({ email: 'a@b.com', message: '验证码已发送到您的邮箱' });
    expect(mockResendVerification).not.toHaveBeenCalled();
  });

  it('登录流程（state 仅 email 无 message）：自动代发验证码', () => {
    renderAt({ email: 'a@b.com' });
    expect(mockResendVerification).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('bind 模式（无 email）：不自动重发', () => {
    renderAt({ tempToken: 'tk', mode: 'bind' });
    expect(mockResendVerification).not.toHaveBeenCalled();
  });
});
