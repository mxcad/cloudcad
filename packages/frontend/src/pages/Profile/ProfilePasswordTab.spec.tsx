import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { ProfilePasswordTab } from './ProfilePasswordTab';

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: {
      mailEnabled: false,
      requireEmailVerification: false,
      smsEnabled: false,
      requirePhoneVerification: false,
      supportEmail: '',
      supportPhone: '',
      docsUrl: '',
      allowRegister: true,
      wechatEnabled: false,
      wechatAutoRegister: false,
      maxFileSize: 100,
      collaborationEnabled: true,
      collaborationDomains: '',
      batchDownloadEnabled: false,
      freeExportDownloadEnabled: false,
      userCancelGraceDays: 7,
      securityMode: 'normal',
      passwordPolicyMinLength: 10,
      passwordPolicyMinCategories: 3,
      brandProfile: {},
    },
    loading: false,
  }),
}));

const defaultProps = {
  user: { hasPassword: true } as never,
  passwordForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
  focusedField: null,
  passwordStrength: { strength: 0, label: '', color: '#000' },
  loading: false,
  onPasswordChange: vi.fn(),
  onPasswordSubmit: vi.fn(),
  onFocusField: vi.fn(),
  onNavigate: vi.fn(),
};

afterEach(cleanup);

describe('ProfilePasswordTab', () => {
  it('表单内位置最靠前的可提交按钮就是真正的提交按钮', () => {
    // 回归：HTML 隐式提交按「树序第一个可提交按钮」定位，未声明 type 的 button 默认即 submit。
    // 「忘记密码？」曾排在提交按钮之前且漏写 type="button"，密码输入框按回车因此命中它并跳转 /forgot-password。
    render(<ProfilePasswordTab {...defaultProps} />);

    const form = screen
      .getByRole('button', { name: /忘记密码/ })
      .closest('form');
    expect(form).not.toBeNull();

    const firstSubmittable = Array.from(form!.querySelectorAll('button')).find(
      (button) => button.type === 'submit'
    );

    expect(firstSubmittable?.textContent).toContain('修改密码');
  });

  it('「忘记密码？」只做导航，不提交表单', () => {
    const onNavigate = vi.fn();
    const onPasswordSubmit = vi.fn();
    render(
      <ProfilePasswordTab
        {...defaultProps}
        onNavigate={onNavigate}
        onPasswordSubmit={onPasswordSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /忘记密码/ }));

    expect(onNavigate).toHaveBeenCalledWith('/forgot-password');
    expect(onPasswordSubmit).not.toHaveBeenCalled();
  });
});
