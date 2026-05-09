# Spec 文件模板

AI 生成 `.spec.ts` 代码时使用此模板。输出文件：`e2e/spec/<domain>.spec.ts`。

遵守 `conventions/playwright-standards.md` 的代码规范。

---

```typescript
import { test, expect } from '../fixtures/auth.fixture';
// 引入该项目 fixture 或 base
// 引入 Page Objects

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

/**
 * <业务域> — E2E 测试
 *
 * 执行方式：
 *   按业务域并行，域内串行（Playwright 默认 fullyParallel: false）。
 *   图纸内容域 spec 文件级别设 test.describe.configure({ mode: 'serial' })。
 */
test.describe('<业务域>', { tag: ['@<domain-tag>'] }, () => {

  // ========== 页面 1 测试 ==========
  test.describe('<页面1>', () => {
    let pageObj: PageObjectType;

    test.beforeEach(async ({ page }) => {
      pageObj = new PageObjectType(page);
      await pageObj.goto();
    });

    // 基础交互
    test.describe('基础交互', () => {
      test('页面加载 → 核心元素可见', async () => {
        await expect(pageObj.coreElement).toBeVisible();
      });

      test('点击按钮 → 触发预期行为', async () => {
        await pageObj.button.click();
        await expect(pageObj.resultElement).toBeVisible();
      });
    });

    // 表单交互
    test.describe('表单交互', () => {
      test('提交空表单 → 显示校验错误', async () => {
        await pageObj.submitButton.click();
        await expect(pageObj.errorMessage).toBeVisible();
      });

      test('填写有效数据 → 提交成功', async ({ testUser }) => {
        await pageObj.fillForm(testUser);
        await pageObj.submitButton.click();
        await expect(page.getByText('成功')).toBeVisible();
      });
    });

    // 选择交互
    test.describe('选择交互', () => {
      test('下拉框 → 展开 → 选中选项', async () => {
        await pageObj.select.click();
        await page.getByRole('option', { name: '选项A' }).click();
        await expect(pageObj.select).toHaveText('选项A');
      });
    });

    // 弹窗交互
    test.describe('弹窗交互', () => {
      test('打开弹窗 → 确认 → 关闭', async () => {
        await pageObj.openModalButton.click();
        await expect(pageObj.modal).toBeVisible();
        await pageObj.modalConfirmButton.click();
        await expect(pageObj.modal).toBeHidden();
      });

      test('弹窗 → 点击遮罩 → 关闭', async () => { /* ... */ });
      test('弹窗 → 按 Esc → 关闭', async () => { /* ... */ });
    });

    // 状态
    test.describe('状态', () => {
      test('数据加载中 → 显示 Skeleton', async () => { /* ... */ });
      test('数据为空 → 显示空状态', async () => { /* ... */ });
      test('网络错误 → 显示重试', async () => { /* ... */ });
    });

    // 权限
    test.describe('权限', () => {
      test('VIEWER 角色 → 创建按钮不可见', async ({ viewerPage }) => {
        // viewerPage 用 viewer storageState 登录
        await expect(viewerPage.createButton).toBeHidden();
      });
    });

    // 边界
    test.describe('边界', () => {
      test('超长文件名 → 显示截断', async () => { /* ... */ });
      test('快速连续点击 → 不重复提交', async () => { /* ... */ });
    });
  });

  // ========== 页面 2 测试 ==========
  test.describe('<页面2>', () => {
    // ... 同上结构
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    test('<工作流名称>', async ({ page }) => {
      // 步骤 1
      // 步骤 2
      // ...
      // 最终断言
    });
  });
});
```

## 关键模式

### 多角色权限验证

```typescript
test.describe('权限 - 删除操作', () => {
  test.use({ storageState: 'e2e/.auth/viewer.json' });

  test('VIEWER → 删除按钮不可见', async ({ page }) => {
    await page.goto('/projects/test-project/files');
    await expect(page.getByRole('button', { name: '删除' })).toBeHidden();
  });
});
```

### CAD 编辑器外围测试

```typescript
test.describe('CAD 编辑器', () => {
  test('编辑器容器渲染', async ({ page }) => {
    await page.goto('/cad-editor/test-file-id');
    await expect(page.locator('#mx-cad-container')).toBeAttached({ timeout: 30000 });
  });

  test('保存按钮可见', async ({ page }) => {
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
  });
});
```

### API 拦截（验证后端请求）

```typescript
test('保存触发正确 API 调用', async ({ page }) => {
  const saveRequest = page.waitForRequest(
    req => req.url().includes('/mxcad/savemxweb/') && req.method() === 'POST'
  );
  await page.getByRole('button', { name: '保存' }).click();
  const request = await saveRequest;
  expect(request.postDataJSON()).toHaveProperty('nodeId');
});
```

### 文件上传

```typescript
test('上传 DWG 文件', async ({ page }) => {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/test-files/sample.dwg');
  await expect(page.getByText('上传成功')).toBeVisible({ timeout: 30000 });
});
```
