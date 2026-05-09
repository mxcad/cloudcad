# Playwright 代码规范

AI 生成测试代码时必须遵守以下规范。

## 项目结构

```
e2e/
├── spec/           # 测试文件：<domain>.spec.ts
├── pages/          # Page Objects：<PageName>.ts
├── fixtures/       # Playwright fixtures：<name>.fixture.ts
└── guide/          # 本指南
```

## 文件命名

- spec 文件：`<kebab-case-domain>.spec.ts`（如 `identity-auth.spec.ts`）
- Page Object：`<PascalCase>.ts`（如 `LoginPage.ts`、`FileSystemPage.ts`）
- Fixture：`<kebab-case>.fixture.ts`（如 `auth.fixture.ts`、`project.fixture.ts`）

## 代码风格

### 导入

```typescript
import { test, expect } from './fixtures/auth.fixture';  // 用项目 fixture
import { LoginPage } from './pages/LoginPage';
import { test as base, expect } from '@playwright/test';  // 新建 fixture 用 base
```

### 测试描述

```typescript
test.describe('业务域 - 页面名', () => {
  test.describe('模块/功能区域', () => {
    test('操作 → 预期结果', async ({ page, testUser }) => {
      // ...
    });
  });
});
```

### 测试用例命名

用例名用中文描述：`'操作 → 预期结果'` 或 `'条件 → 操作 → 预期结果'`。

```typescript
test('输入无效凭证 → 显示错误提示', async () => {});
test('VIEWER 角色 → 文件删除按钮不可见', async () => {});
test('空项目 → 显示空状态引导', async () => {});
```

### 选择器优先级

1. **首选**：`getByRole()` / `getByLabel()` / `getByPlaceholder()` / `getByText()` — Playwright 内置语义选择器
2. **次选**：`data-testid="xxx"` → `page.locator('[data-testid="xxx"]')`
3. **备选**：CSS 选择器 `page.locator('button:has-text("保存")')`
4. **避免**：XPath、脆弱 CSS 路径（`.btn-primary:nth-child(3)`）

```typescript
// ✅ 好
await page.getByRole('button', { name: '保存' }).click();
await page.getByLabel('用户名').fill('admin');
await expect(page.getByText('操作成功')).toBeVisible();

// ❌ 不好
await page.locator('.btn-save').click();
await page.locator('input[name="username"]').fill('admin');
```

### 等待策略

- 优先：`await expect(locator).toBeVisible()` — 自动等待
- 导航后：`await page.waitForURL('**/target-path')`
- 避免：`page.waitForTimeout(5000)` 硬等待

```typescript
// ✅ 好
await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
await page.waitForURL('**/dashboard');

// ❌ 不好
await page.waitForTimeout(3000);
```

### 断言

```typescript
// 元素可见
await expect(locator).toBeVisible();
// 元素不可见
await expect(locator).toBeHidden();
// 元素禁用
await expect(locator).toBeDisabled();
// 文本内容
await expect(locator).toHaveText('预期文本');
// URL
await expect(page).toHaveURL(/\/projects/);
// 属性
await expect(input).toHaveAttribute('type', 'password');
// 截图（仅关键步骤）
await expect(page).toHaveScreenshot('landing.png');
```

## Page Object 模式

参照 `LoginPage.ts` 现有模式：

```typescript
import type { Page, Locator } from '@playwright/test';

export class ProjectListPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly projectCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: '创建项目' });
    this.searchInput = page.getByPlaceholder('搜索项目');
    this.projectCards = page.locator('[data-testid="project-card"]');
  }

  async goto() {
    await this.page.goto('/projects');
  }

  async createProject(name: string, description?: string) {
    await this.createButton.click();
    await this.page.getByLabel('项目名称').fill(name);
    if (description) {
      await this.page.getByLabel('项目描述').fill(description);
    }
    await this.page.getByRole('button', { name: '确认' }).click();
  }
}
```

## Fixture 模式

参照 `auth.fixture.ts` 现有模式。使用 `storageState` 控制登录态：

```typescript
import { test as base, expect } from '@playwright/test';

export type ProjectFixtures = {
  projectPage: ProjectListPage;
};

export const test = base.extend<ProjectFixtures>({
  projectPage: async ({ page }, use) => {
    const projectPage = new ProjectListPage(page);
    await use(projectPage);
  },
});

export { expect };
```

多角色 fixture 通过不同 `storageState` 实现：

```typescript
// fixtures/multi-role.fixture.ts
import { test as base } from '@playwright/test';

type RoleName = 'admin' | 'viewer' | 'editor' | 'owner';

export const test = base.extend<{ role: RoleName }>({
  storageState: async ({ role }, use) => {
    await use(`e2e/.auth/${role}.json`);
  },
  role: ['admin', { option: true }],
});
```

## spec 文件结构

```typescript
import { test, expect } from '../fixtures/auth.fixture';
import { SomePage } from '../pages/SomePage';

// 按业务域设 metadata
test.describe('身份权限', { tag: ['@identity-auth'] }, () => {
  test.describe('登录页', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
      loginPage = new LoginPage(page);
      await loginPage.goto();
    });

    // 正常流程
    test('输入有效凭证 → 登录成功 → 跳转首页', async () => {});

    // 异常流程
    test('输入错误密码 → 显示错误提示', async () => {});

    // 权限
    test('未登录访问 /projects → 重定向到登录页', async () => {});

    // 状态
    test('提交中 → 按钮显示 loading', async () => {});
  });
});
```

## 并行控制

CAD 编辑器相关 spec 必须串行：

```typescript
// drawing-content.spec.ts 文件级别
test.describe.configure({ mode: 'serial' });
```

其他域默认 Playwright 行为（`fullyParallel: true`）。

## 环境变量

```typescript
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
```

不要硬编码 URL。用 `playwright.config.ts` 的 `baseURL` 配置。
