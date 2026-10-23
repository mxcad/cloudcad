import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { ProfilePasswordTab } from './ProfilePasswordTab';

// 运行时配置 mock 为可变对象：个别用例需切换口令策略（如放宽到无要求项）
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
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
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({ config: mockConfig, loading: false }),
}));

const defaultProps = {
  user: { hasPassword: true } as never,
  passwordForm: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    totpCode: '',
  },
  focusedField: null,
  loading: false,
  onPasswordChange: vi.fn(),
  onPasswordSubmit: vi.fn(),
  onFocusField: vi.fn(),
  onNavigate: vi.fn(),
};

afterEach(() => {
  cleanup();
  // 恢复默认策略，避免用例间串扰
  mockConfig.passwordPolicyMinLength = 10;
  mockConfig.passwordPolicyMinCategories = 3;
});

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

  it('口令要求清单按生效策略渲染，未满足项不打勾', () => {
    // 'abcdefghij'：10 位达标、仅小写一类 → 长度项打勾、类别项不打勾
    render(
      <ProfilePasswordTab
        {...defaultProps}
        passwordForm={{
          oldPassword: '',
          newPassword: 'abcdefghij',
          confirmPassword: '',
          totpCode: '',
        }}
      />
    );

    expect(screen.getByText(/至少 10 位/)).toBeTruthy();
    expect(screen.getByText(/中至少 3 类/)).toBeTruthy();
  });

  it('策略放宽（无要求项）时不渲染写死的长度/类别要求', () => {
    mockConfig.passwordPolicyMinLength = 0;
    mockConfig.passwordPolicyMinCategories = 0;
    render(
      <ProfilePasswordTab
        {...defaultProps}
        passwordForm={{
          oldPassword: '',
          newPassword: 'aaaaaa',
          confirmPassword: '',
          totpCode: '',
        }}
      />
    );

    // 安全建议里只留通用提示，不再复述长度/类别要求
    expect(screen.queryByText(/中至少/)).toBeNull();
    expect(screen.queryByText(/避免使用常见的密码组合/)).toBeTruthy();
  });

  it('passwordChangeRequiresMfa 为 true 时渲染 TOTP 动态码字段，否则不渲染', () => {
    // #415 管理员开启双因素且已绑定：改密需额外动态码（服务端算好下发）
    render(
      <ProfilePasswordTab
        {...defaultProps}
        passwordChangeRequiresMfa
        passwordForm={{
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
          totpCode: '',
        }}
      />
    );
    expect(
      screen.getByPlaceholderText('请输入验证器 App 中的 6 位动态码')
    ).toBeTruthy();
    cleanup();

    // 不需要动态码（普通用户 / 未开启 / 未绑定）：字段不渲染
    render(<ProfilePasswordTab {...defaultProps} />);
    expect(
      screen.queryByPlaceholderText('请输入验证器 App 中的 6 位动态码')
    ).toBeNull();
  });
});
