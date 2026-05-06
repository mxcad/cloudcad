// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    </MemoryRouter>,
  );
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { container } = renderRegister();
      expect(container.querySelector('.register-card')).toBeTruthy();
    });

    it('shows step indicator with 2 steps', () => {
      renderRegister();
      const indicator = screen.getByTestId('step-indicator');
      expect(indicator.querySelectorAll('.step')).toHaveLength(2);
    });

    it('renders step 1 fields by default', () => {
      renderRegister();
      expect(screen.getByTestId('step-1')).toBeTruthy();
      expect(screen.queryByTestId('step-2')).toBeNull();
    });
  });

  describe('Step navigation', () => {
    it('advances to step 2 when username is valid', async () => {
      renderRegister();
      const usernameInput = screen.getByPlaceholderText('请输入用户名');
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });

      fireEvent.click(screen.getByTestId('next-button'));

      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeTruthy();
      });
      expect(screen.queryByTestId('step-1')).toBeNull();
    });

    it('returns to step 1 from step 2', async () => {
      renderRegister();
      const usernameInput = screen.getByPlaceholderText('请输入用户名');
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });

      fireEvent.click(screen.getByTestId('next-button'));
      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId('back-button'));
      await waitFor(() => {
        expect(screen.getByTestId('step-1')).toBeTruthy();
      });
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
