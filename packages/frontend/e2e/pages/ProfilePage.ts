import type { Page, Locator } from '@playwright/test';

interface ProfileInfo {
  username: string;
  email: string;
  phone: string;
  wechatBound: boolean;
}

/**
 * 个人中心页 Page Object — /profile
 *
 * 6 个 Tab：个人信息 | 修改密码 | 邮箱绑定 | 手机绑定 | 微信绑定 | 注销账户
 * 邮箱/手机/微信 Tab 由运行时配置控制是否可见。
 */
export class ProfilePage {
  readonly page: Page;

  // --- 全局 ---
  readonly backButton: Locator;
  readonly errorAlert: Locator;
  readonly successAlert: Locator;

  // --- 个人信息 Tab ---
  readonly infoTab: Locator;
  readonly avatarImage: Locator;
  readonly avatarPlaceholder: Locator;
  readonly usernameDisplay: Locator;
  readonly emailDisplay: Locator;
  readonly phoneDisplay: Locator;
  readonly wechatStatus: Locator;
  readonly editProfileButton: Locator;
  // 编辑表单
  readonly usernameInput: Locator;
  readonly nicknameInput: Locator;
  readonly saveProfileButton: Locator;
  readonly cancelEditButton: Locator;

  // --- 修改密码 Tab ---
  readonly passwordTab: Locator;
  readonly oldPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly passwordSubmitButton: Locator;
  readonly toggleOldPasswordBtn: Locator;
  readonly toggleNewPasswordBtn: Locator;
  readonly toggleConfirmPasswordBtn: Locator;
  readonly forgotPasswordLink: Locator;
  readonly noPasswordHint: Locator;
  readonly passwordStrengthBar: Locator;

  // --- 邮箱绑定 Tab ---
  readonly emailTab: Locator;
  readonly emailInput: Locator;
  readonly emailCodeInput: Locator;
  readonly sendEmailCodeButton: Locator;
  readonly bindEmailButton: Locator;
  readonly rebindEmailButton: Locator;
  readonly emailBoundDisplay: Locator;

  // --- 手机绑定 Tab ---
  readonly phoneTab: Locator;
  readonly phoneInput: Locator;
  readonly phoneCodeInput: Locator;
  readonly sendSmsCodeButton: Locator;
  readonly bindPhoneButton: Locator;
  readonly rebindPhoneButton: Locator;
  readonly phoneBoundDisplay: Locator;
  readonly verifyOldPhoneButton: Locator;

  // --- 微信绑定 Tab ---
  readonly wechatTab: Locator;
  readonly wechatBoundState: Locator;
  readonly wechatUnboundState: Locator;
  readonly bindWechatButton: Locator;
  readonly unbindWechatButton: Locator;

  // --- 注销 Tab ---
  readonly deactivateTab: Locator;
  readonly verificationMethodSelect: Locator;
  readonly deactivatePasswordInput: Locator;
  readonly deactivatePhoneCodeInput: Locator;
  readonly deactivateEmailCodeInput: Locator;
  readonly deactivateSendPhoneCodeBtn: Locator;
  readonly deactivateSendEmailCodeBtn: Locator;
  readonly deactivateConfirmCheckbox: Locator;
  readonly deactivateImmediateCheckbox: Locator;
  readonly deactivateSubmitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // 全局
    this.backButton = page.getByRole('button', { name: /返回/ });
    this.errorAlert = page.locator('.alert.alert-error');
    this.successAlert = page.locator('.alert.alert-success');

    // 个人信息 Tab
    this.infoTab = page.getByRole('button', { name: /个人信息/ });
    this.avatarImage = page.locator('.avatar-image');
    this.avatarPlaceholder = page.locator('.avatar-placeholder');
    this.usernameDisplay = page.locator('.info-card').filter({ hasText: '用户名' }).locator('.info-content span');
    this.emailDisplay = page.locator('.info-card').filter({ hasText: '邮箱地址' }).locator('.info-content span');
    this.phoneDisplay = page.locator('.info-card').filter({ hasText: '手机号' }).locator('.info-content span');
    this.wechatStatus = page.locator('.info-card').filter({ hasText: '微信' }).locator('.info-content span');
    this.editProfileButton = page.getByRole('button', { name: /编辑/ });
    this.usernameInput = page.locator('input[name="username"]');
    this.nicknameInput = page.locator('input[name="nickname"]');
    this.saveProfileButton = page.getByRole('button', { name: /保存/ });
    this.cancelEditButton = page.getByRole('button', { name: /取消/ });

    // 修改密码 Tab
    this.passwordTab = page.getByRole('button', { name: /修改密码|设置密码/ });
    this.oldPasswordInput = page.locator('input[name="oldPassword"]');
    this.newPasswordInput = page.locator('input[name="newPassword"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    this.passwordSubmitButton = page.locator('.password-form button[type="submit"]');
    this.toggleOldPasswordBtn = page.locator('.password-form .toggle-password').first();
    this.toggleNewPasswordBtn = page.locator('.password-form .toggle-password').nth(1);
    this.toggleConfirmPasswordBtn = page.locator('.password-form .toggle-password').nth(2);
    this.forgotPasswordLink = page.getByText('忘记密码？');
    this.noPasswordHint = page.locator('.no-password-hint');
    this.passwordStrengthBar = page.locator('.password-strength .strength-fill');

    // 邮箱绑定 Tab
    this.emailTab = page.getByRole('button', { name: /邮箱绑定/ });
    this.emailInput = page.locator('input[name="email"]');
    this.emailCodeInput = page.locator('input[name="code"]');
    this.sendEmailCodeButton = page.getByRole('button', { name: /发送验证码/ });
    this.bindEmailButton = page.getByRole('button', { name: /确认绑定/ });
    this.rebindEmailButton = page.getByRole('button', { name: /换绑邮箱/ });
    this.emailBoundDisplay = page.locator('.bound-email');

    // 手机绑定 Tab
    this.phoneTab = page.getByRole('button', { name: /手机绑定/ });
    this.phoneInput = page.locator('input[name="phone"]');
    this.phoneCodeInput = page.locator('.phone-form input[name="code"]');
    this.sendSmsCodeButton = page.getByRole('button', { name: /获取验证码/ });
    this.bindPhoneButton = page.getByRole('button', { name: /确认绑定/ });
    this.rebindPhoneButton = page.getByRole('button', { name: /换绑手机号/ });
    this.phoneBoundDisplay = page.locator('.bound-phone');
    this.verifyOldPhoneButton = page.getByRole('button', { name: /确认验证/ });

    // 微信绑定 Tab
    this.wechatTab = page.getByRole('button', { name: /微信绑定/ });
    this.wechatBoundState = page.locator('.wechat-bound');
    this.wechatUnboundState = page.locator('.wechat-unbound');
    this.bindWechatButton = page.getByRole('button', { name: /绑定微信/ });
    this.unbindWechatButton = page.getByRole('button', { name: /解绑微信/ });

    // 注销 Tab
    this.deactivateTab = page.getByRole('button', { name: /注销账户/ });
    this.verificationMethodSelect = page.locator('.verification-select');
    this.deactivatePasswordInput = page.locator('.deactivate-form input[placeholder="请输入密码"]');
    this.deactivatePhoneCodeInput = page.locator('.deactivate-form input[placeholder*="手机验证码"]');
    this.deactivateEmailCodeInput = page.locator('.deactivate-form input[placeholder*="邮箱验证码"]');
    this.deactivateSendPhoneCodeBtn = page.locator('.deactivate-form .send-code-button');
    this.deactivateSendEmailCodeBtn = page.locator('.deactivate-form .send-code-button');
    this.deactivateConfirmCheckbox = page.locator('#confirmDeactivate');
    this.deactivateImmediateCheckbox = page.locator('#immediateDeactivate');
    this.deactivateSubmitButton = page.locator('.deactivate-form .submit-button.danger');
  }

  /** 导航到 /profile */
  async goto() {
    await this.page.goto('/profile');
  }

  /** 等待页面加载完成 */
  async waitForLoadComplete() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.infoTab).toBeVisible({ timeout: 10000 });
  }

  /** 切换 Tab */
  async switchToTab(tab: 'info' | 'password' | 'email' | 'phone' | 'wechat' | 'delete') {
    const tabMap: Record<string, Locator> = {
      info: this.infoTab,
      password: this.passwordTab,
      email: this.emailTab,
      phone: this.phoneTab,
      wechat: this.wechatTab,
      delete: this.deactivateTab,
    };
    await tabMap[tab].click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取当前选中的 Tab 名称 */
  async getCurrentTab(): Promise<string> {
    const activeBtn = this.page.locator('.tab-button.active');
    return (await activeBtn.textContent())?.trim() || '';
  }

  // =========================================================================
  // 个人信息
  // =========================================================================

  /** 获取个人资料信息 */
  async getProfileInfo(): Promise<ProfileInfo> {
    await this.switchToTab('info');

    const usernameText = await this.usernameDisplay.first().textContent();
    const emailText = await this.emailDisplay.first().textContent();
    const phoneText = await this.phoneDisplay.first().textContent();
    const wechatText = await this.wechatStatus.first().textContent();

    return {
      username: usernameText?.trim() || '',
      email: emailText?.replace(/✅|✓/g, '').trim() || '',
      phone: phoneText?.replace(/✅|✓/g, '').trim() || '',
      wechatBound: wechatText?.includes('已绑定') ?? false,
    };
  }

  /** 点击编辑按钮进入编辑模式 */
  async clickEditProfile() {
    await this.editProfileButton.click();
  }

  /** 保存个人资料 */
  async saveProfile(username?: string, nickname?: string) {
    if (username !== undefined) {
      await this.usernameInput.fill(username);
    }
    if (nickname !== undefined) {
      await this.nicknameInput.fill(nickname);
    }
    await this.saveProfileButton.click();
  }

  // =========================================================================
  // 修改密码
  // =========================================================================

  /** 修改/设置密码 */
  async changePassword(oldPwd: string, newPwd: string, confirmPwd: string) {
    await this.switchToTab('password');

    // 如果旧密码输入框可见则填写
    const oldInput = this.oldPasswordInput;
    if (await oldInput.isVisible()) {
      await oldInput.fill(oldPwd);
    }

    await this.newPasswordInput.fill(newPwd);
    await this.confirmPasswordInput.fill(confirmPwd);
    await this.passwordSubmitButton.click();
  }

  /** 获取密码表单字段 */
  async getPasswordFormFields() {
    await this.switchToTab('password');
    return {
      hasOldPasswordField: await this.oldPasswordInput.isVisible(),
      hasNewPasswordField: await this.newPasswordInput.isVisible(),
      hasConfirmPasswordField: await this.confirmPasswordInput.isVisible(),
    };
  }

  /** 检查用户是否已设置密码（有 oldPassword 输入框 = 已设置） */
  async isPasswordSet(): Promise<boolean> {
    await this.switchToTab('password');
    return this.oldPasswordInput.isVisible();
  }

  // =========================================================================
  // 邮箱绑定
  // =========================================================================

  /** 绑定邮箱 */
  async bindEmail(email: string, code: string) {
    await this.switchToTab('email');
    await this.emailInput.fill(email);
    await this.sendEmailCodeButton.click();
    // 等待进入验证码步骤
    await expect(this.emailCodeInput).toBeVisible({ timeout: 10000 });
    await this.emailCodeInput.fill(code);
    // 验证步骤的表单提交按钮
    const verifyFormBtn = this.page.locator('.email-form button[type="submit"]').last();
    await verifyFormBtn.click();
  }

  /** 发送邮箱验证码 */
  async sendEmailCode() {
    await this.switchToTab('email');
    await this.sendEmailCodeButton.click();
  }

  /** 获取邮箱绑定表单字段 */
  async getEmailBindingFields() {
    await this.switchToTab('email');
    return {
      hasEmailInput: await this.emailInput.isVisible(),
      hasCodeInput: await this.emailCodeInput.isVisible(),
      hasSendCodeButton: await this.sendEmailCodeButton.isVisible(),
    };
  }

  // =========================================================================
  // 手机绑定
  // =========================================================================

  /** 绑定手机号 */
  async bindPhone(phone: string, code: string) {
    await this.switchToTab('phone');
    await this.phoneInput.fill(phone);
    await this.sendSmsCodeButton.click();
    // 等待进入验证码步骤
    await expect(this.phoneCodeInput).toBeVisible({ timeout: 10000 });
    await this.phoneCodeInput.fill(code);
    const submitBtn = this.page.locator('.phone-form button[type="submit"]').last();
    await submitBtn.click();
  }

  /** 发送手机验证码 */
  async sendSmsCode() {
    await this.switchToTab('phone');
    await this.sendSmsCodeButton.click();
  }

  /** 获取手机绑定表单字段 */
  async getPhoneBindingFields() {
    await this.switchToTab('phone');
    return {
      hasPhoneInput: await this.phoneInput.isVisible(),
      hasCodeInput: await this.phoneCodeInput.isVisible(),
      hasSendCodeButton: await this.sendSmsCodeButton.isVisible(),
    };
  }

  // =========================================================================
  // 微信绑定
  // =========================================================================

  /** 绑定微信（点击绑定按钮） */
  async bindWechat() {
    await this.switchToTab('wechat');
    await this.bindWechatButton.click();
  }

  /** 解绑微信 */
  async unbindWechat() {
    await this.switchToTab('wechat');
    // 先确认弹窗
    await this.unbindWechatButton.click();
  }

  // =========================================================================
  // 注销账户
  // =========================================================================

  /** 开始注销流程 */
  async deleteAccount(reason?: string) {
    await this.switchToTab('delete');

    // 勾选确认复选框
    if (await this.deactivateConfirmCheckbox.isVisible()) {
      await this.deactivateConfirmCheckbox.check();
    }

    // 如果提供了 reason 且 immediate 复选框可见
    if (reason && (await this.deactivateImmediateCheckbox.isVisible())) {
      await this.deactivateImmediateCheckbox.check();
    }

    // 点击确认注销按钮——会触发确认弹窗
    if (await this.deactivateSubmitButton.isEnabled()) {
      await this.deactivateSubmitButton.click();
    }
  }

  /** 在确认弹窗中最终确认注销 */
  async confirmDeleteAccount() {
    // 确认弹窗中的"确定注销"按钮
    const confirmBtn = this.page.locator('[role="dialog"]').getByRole('button', { name: /确定注销/ });
    await confirmBtn.click();
  }

  // =========================================================================
  // 通用
  // =========================================================================

  /** 获取错误消息文本 */
  async getErrorMessage(): Promise<string> {
    if (await this.errorAlert.isVisible()) {
      return (await this.errorAlert.textContent())?.trim() || '';
    }
    return '';
  }

  /** 获取成功消息文本 */
  async getSuccessMessage(): Promise<string> {
    if (await this.successAlert.isVisible()) {
      return (await this.successAlert.textContent())?.trim() || '';
    }
    return '';
  }
}
