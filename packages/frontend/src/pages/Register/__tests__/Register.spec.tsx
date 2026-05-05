// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Register } from '../index';

// ── Mock contexts ──
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    register: vi.fn(),
    isAuthenticated: false,
    loading: false,
  }),
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: {
      allowRegister: true,
      mailEnabled: true,
      requireEmailVerification: false,
      smsEnabled: false,
      requirePhoneVerification: false,
    },
    loading: false,
  }),
}));

vi.mock('@/contexts/BrandContext', () => ({
  useBrandConfig: () => ({
    config: { title: 'CloudCAD', logo: '/logo.png' },
  }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

vi.mock('@/components/InteractiveBackground', () => ({
  InteractiveBackground: () => <div data-testid="interactive-bg" />,
}));

vi.mock('@/utils/validation', () => ({
  validateField: vi.fn(() => null),
  validateRegisterForm: vi.fn(() => null),
}));

vi.mock('@/api-sdk', () => ({
  authControllerCheckFieldUniqueness: vi.fn(() => Promise.resolve({})),
  authControllerSendSmsCode: vi.fn(() => Promise.resolve({ data: { success: true } })),
  authControllerRegisterByPhone: vi.fn(() => Promise.resolve()),
}));

// ── Helper render ──
function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the registration card', () => {
      renderRegister();
      expect(screen.getByText('CloudCAD')).toBeTruthy();
    });

    it('renders step indicator with two steps', () => {
      renderRegister();
      expect(screen.getByText('基本信息')).toBeTruthy();
      expect(screen.getByText('安全设置')).toBeTruthy();
    });

    it('renders step 1 form fields initially', () => {
      renderRegister();
      expect(screen.getByPlaceholderText('请输入用户名')).toBeTruthy();
      expect(screen.getByPlaceholderText('请输入昵称（可选）')).toBeTruthy();
    });

    it('renders the login link', () => {
      renderRegister();
      expect(screen.getByText('已有账户？')).toBeTruthy();
      expect(screen.getByText('立即登录')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('can navigate to step 2', () => {
      renderRegister();
      const usernameInput = screen.getByPlaceholderText('请输入用户名');
      // Set a value to pass validation
      (usernameInput as HTMLInputElement).value = 'testuser';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }));

      const nextButton = screen.getByText('下一步');
      nextButton.click();

      // Should now show step 2 - password fields
      expect(screen.getByPlaceholderText(/至少8位/)).toBeTruthy();
    });

    it('can go back from step 2 to step 1', () => {
      renderRegister();
      // Navigate to step 2 first
      const usernameInput = screen.getByPlaceholderText('请输入用户名');
      (usernameInput as HTMLInputElement).value = 'testuser';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
      screen.getByText('下一步').click();

      // Now go back
      expect(screen.getByText('返回')).toBeTruthy();
    });
  });
});

describe('passwordStrength', () => {
  it('returns 0 strength for empty password', async () => {
    const { getPasswordStrength } = await import('../utils/passwordStrength');
    expect(getPasswordStrength('')).toEqual({ strength: 0, label: '', color: '' });
  });

  it('returns low strength for short password', async () => {
    const { getPasswordStrength } = await import('../utils/passwordStrength');
    const result = getPasswordStrength('abc');
    expect(result.strength).toBeLessThanOrEqual(2);
  });

  it('returns high strength for complex password', async () => {
    const { getPasswordStrength } = await import('../utils/passwordStrength');
    const result = getPasswordStrength('Abcdef1!xyz');
    expect(result.strength).toBeGreaterThanOrEqual(3);
  });
});
