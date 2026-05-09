import type { Page, Locator } from '@playwright/test';

/**
 * 个人中心页 Page Object
 */
export class ProfilePage {
  readonly page: Page;
  readonly infoTab: Locator;
  readonly passwordTab: Locator;
  readonly emailTab: Locator;
  readonly phoneTab: Locator;
  readonly wechatTab: Locator;
  readonly deactivateTab: Locator;
  readonly backButton: Locator;
  readonly errorAlert: Locator;
  readonly successAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.infoTab = page.getByRole('button', { name: /个人信息/ });
    this.passwordTab = page.getByRole('button', { name: /修改密码|设置密码/ });
    this.emailTab = page.getByRole('button', { name: /邮箱绑定/ });
    this.phoneTab = page.getByRole('button', { name: /手机绑定/ });
    this.wechatTab = page.getByRole('button', { name: /微信绑定/ });
    this.deactivateTab = page.getByRole('button', { name: /注销账户/ });
    this.backButton = page.getByRole('button', { name: /返回/ });
    this.errorAlert = page.locator('.alert.alert-error');
    this.successAlert = page.locator('.alert.alert-success');
  }

  async goto() {
    await this.page.goto('/profile');
  }

  async switchToTab(tab: 'info' | 'password' | 'email' | 'phone' | 'wechat' | 'deactivate') {
    const tabMap = {
      info: this.infoTab,
      password: this.passwordTab,
      email: this.emailTab,
      phone: this.phoneTab,
      wechat: this.wechatTab,
      deactivate: this.deactivateTab,
    };
    await tabMap[tab].click();
  }

  async changePassword(oldPassword: string, newPassword: string, confirmPassword: string) {
    await this.switchToTab('password');
    await this.page.locator('input[name="oldPassword"]').fill(oldPassword);
    await this.page.locator('input[name="newPassword"]').fill(newPassword);
    await this.page.locator('input[name="confirmPassword"]').fill(confirmPassword);
    await this.page.getByRole('button', { name: /修改密码|设置密码|提交/ }).click();
  }

  async deactivateAccount(password?: string) {
    await this.switchToTab('deactivate');
    if (password) {
      await this.page.locator('input[name="password"]').fill(password);
    }
    // check confirmed checkbox
    const checkbox = this.page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.check();
    }
    await this.page.getByRole('button', { name: /注销|确认注销/ }).click();
  }
}
