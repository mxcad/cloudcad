# 用户引导前置条件系统设计文档

> 版本: 1.0.0
> 日期: 2026-03-24
> 状态: 设计完成

## 1. 概述

### 1.1 背景

现有用户引导系统缺少前置条件检测机制，导致用户在不满足条件时无法顺利完成引导流程。例如：
- 用户想学"添加图纸到图库"，但没有项目或图纸文件
- 用户想学"协作功能"，但没有打开图纸文件
- 用户没有相应权限，却看到不该看到的引导

### 1.2 目标

1. **前置条件系统**：引导开始前自动检测条件，不满足则自动执行前置引导
2. **权限过滤**：根据用户权限过滤可见的引导流程
3. **自动化测试**：Playwright 配置驱动的端到端测试
4. **文档生成**：CDP 截图生成用户手册

### 1.3 核心设计原则

- **链式引导**：前置条件不满足 → 自动执行前置引导 → 完成后继续原引导
- **权限控制**：缺少权限的引导直接不显示，不给用户错误期望
- **配置驱动**：测试和文档都基于引导配置自动生成

---

## 2. 类型定义扩展

### 2.1 前置条件类型

```typescript
// types/tour.ts

import type { Permission } from '../constants/permissions';

/** 前置条件配置 */
export interface TourPrecondition {
  /** 条件描述（显示给用户） */
  description: string;
  
  /** 
   * 检测函数
   * 返回 true 表示条件满足
   */
  check: () => boolean | Promise<boolean>;
  
  /** 
   * 解决方式
   */
  resolve?: {
    /** 引导 ID（跳转到其他引导） */
    guideId?: string;
    /** 直接插入的步骤 */
    steps?: TourStep[];
    /** 自定义处理函数 */
    handler?: () => void | Promise<void>;
  };
}
```

### 2.2 可见性配置

```typescript
/** 引导可见性配置 */
export interface TourVisibility {
  /** 
   * 所需权限列表
   * 用户需要拥有所有列出的权限才能看到此引导
   */
  permissions?: Permission[];
  
  /** 
   * 自定义可见性检测
   * 返回 true 表示可见
   */
  check?: () => boolean | Promise<boolean>;
}
```

### 2.3 TourGuide 接口扩展

```typescript
export interface TourGuide {
  // ... 现有属性
  
  /** 可见性配置 */
  visibility?: TourVisibility;
  
  /** 前置条件列表（按顺序检测） */
  preconditions?: TourPrecondition[];
}
```

---

## 3. 执行流程

### 3.1 引导启动流程

```
用户点击引导
     ↓
检测 visibility（权限过滤）
     ↓
┌────┴────┐
│         │
无权限    有权限
│         │
不显示    检测 preconditions
          ↓
     ┌────┴────┐
     │         │
     满足     不满足
     │         │
     开始引导  执行 resolve
               ↓
          ┌────┴────┐
          │         │
       guideId   steps/handler
          │         │
       递归执行   直接执行
          │         │
          └────┬────┘
               ↓
          继续检测下一个条件
               ↓
          所有条件满足
               ↓
          开始原引导
```

### 3.2 核心逻辑实现

```typescript
// contexts/TourContext.tsx 中的核心逻辑

/** 开始引导（带前置条件处理） */
async function startTourWithPreconditions(guideId: string): Promise<void> {
  const guide = getTourGuideById(guideId);
  
  if (!guide) {
    console.error(`[Tour] Guide not found: ${guideId}`);
    return;
  }

  // 检测前置条件
  for (const condition of guide.preconditions || []) {
    const met = await condition.check();
    
    if (!met) {
      console.log(`[Tour] Precondition not met: ${condition.description}`);
      
      // 执行 resolve
      if (condition.resolve?.guideId) {
        // 递归执行前置引导
        await startTourWithPreconditions(condition.resolve.guideId);
      } else if (condition.resolve?.steps) {
        // 直接插入步骤执行
        await executeInsertedSteps(condition.resolve.steps);
      } else if (condition.resolve?.handler) {
        // 执行自定义处理
        await condition.resolve.handler();
      }
      
      // 重新检测条件
      const recheck = await condition.check();
      if (!recheck) {
        console.warn(`[Tour] Precondition still not met after resolve`);
        return;
      }
    }
  }
  
  // 所有条件满足，开始原引导
  startTour(guide);
}
```

---

## 4. 权限过滤集成

### 4.1 集成现有权限系统

项目已有完善的权限系统：
- `SystemPermission`：系统级权限
- `ProjectPermission`：项目级权限
- `projectsApi.checkPermission()`：权限检查 API

### 4.2 可见性检测 Hook

```typescript
// hooks/useTourVisibility.ts

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { TourGuide } from '../types/tour';
import type { Permission } from '../constants/permissions';

/**
 * 检查用户是否有指定权限
 */
async function checkPermissions(permissions: Permission[]): Promise<boolean> {
  // 根据项目现有权限检查逻辑实现
  // 系统权限：检查 user.role.permissions
  // 项目权限：调用 projectsApi.checkPermission
}

/**
 * 获取可见的引导列表
 */
export function useVisibleGuides(guides: TourGuide[]): TourGuide[] {
  const { user, isAuthenticated } = useAuth();
  
  return useMemo(async () => {
    if (!isAuthenticated) return [];
    
    const results: TourGuide[] = [];
    
    for (const guide of guides) {
      const visibility = guide.visibility;
      
      // 无配置 = 所有人可见
      if (!visibility) {
        results.push(guide);
        continue;
      }
      
      // 权限检查
      if (visibility.permissions) {
        const hasPerms = await checkPermissions(visibility.permissions);
        if (!hasPerms) continue;
      }
      
      // 自定义检查
      if (visibility.check) {
        const visible = await visibility.check();
        if (!visible) continue;
      }
      
      results.push(guide);
    }
    
    return results;
  }, [guides, user, isAuthenticated]);
}
```

---

## 5. 各引导流程配置

### 5.1 配置映射表

| 引导 ID | 所需权限 | 前置条件 | 解决方式 |
|---------|---------|---------|---------|
| `project-create` | `FILE_CREATE` | 无 | - |
| `file-upload` | `FILE_UPLOAD` | 有项目 | → `project-create` |
| `project-members` | `PROJECT_MEMBER_MANAGE` | 有项目 | → `project-create` |
| `add-to-gallery` | `FILE_OPEN`, `GALLERY_ADD` | 有项目 + 有 DWG/DXF 文件 | → `project-create` → `file-upload` |
| `project-roles` | `PROJECT_ROLE_MANAGE` | 有项目 | → `project-create` |
| `collaboration` | 自定义检测（CAD 编辑器） | 已打开图纸 | 内置步骤 |
| `external-reference` | `CAD_EXTERNAL_REFERENCE` | 已打开图纸 | 内置步骤 |
| `version-history` | `VERSION_READ` | 有项目 + 有文件 | → `project-create` → `file-upload` |
| `system-roles` | `SYSTEM_ROLE_READ` | 无 | - |
| `gallery-manage` | 无 | 无 | - |

### 5.2 配置示例

```typescript
// 文件上传引导（有前置条件）
{
  id: 'file-upload',
  name: '文件上传与管理',
  visibility: {
    permissions: [ProjectPermission.FILE_UPLOAD],
  },
  preconditions: [
    {
      description: '有项目',
      check: () => useProjectStore.getState().projects.length > 0,
      resolve: { guideId: 'project-create' },
    },
  ],
  steps: [/* ... */],
}

// 添加图纸到图库（多前置条件链）
{
  id: 'add-to-gallery',
  name: '添加图纸到图库',
  visibility: {
    permissions: [ProjectPermission.FILE_OPEN, ProjectPermission.GALLERY_ADD],
  },
  preconditions: [
    {
      description: '有项目',
      check: () => useProjectStore.getState().projects.length > 0,
      resolve: { guideId: 'project-create' },
    },
    {
      description: '有 DWG/DXF 文件',
      check: () => {
        const files = useFileStore.getState().files;
        return files.some(f => 
          f.name.toLowerCase().endsWith('.dwg') || 
          f.name.toLowerCase().endsWith('.dxf')
        );
      },
      resolve: { guideId: 'file-upload' },
    },
  ],
  steps: [/* ... */],
}

// 协作功能（内置步骤解决）
{
  id: 'collaboration',
  name: '协作功能',
  visibility: {
    check: () => window.location.pathname.startsWith('/cad-editor'),
  },
  preconditions: [
    {
      description: '已打开图纸文件',
      check: () => !!getCurrentFileId(),
      resolve: {
        steps: [
          {
            target: 'sidebar-projects',
            title: '选择项目',
            content: '请先选择一个包含图纸文件的项目。',
            mode: 'interactive',
            actionType: 'click',
          },
          {
            target: 'file-item',
            title: '打开图纸',
            content: '点击 DWG 或 DXF 文件在 CAD 编辑器中打开。',
            mode: 'interactive',
            actionType: 'click',
          },
        ],
      },
    },
  ],
  steps: [/* ... */],
}

// 系统角色管理（仅管理员可见）
{
  id: 'system-roles',
  name: '系统角色管理',
  visibility: {
    permissions: [SystemPermission.SYSTEM_ROLE_READ],
  },
  preconditions: [],
  steps: [/* ... */],
}
```

---

## 6. Playwright 测试系统

### 6.1 文件结构

```
packages/frontend/
├── e2e/
│   ├── playwright.config.ts          # Playwright 配置
│   ├── auth.setup.ts                 # 认证状态设置
│   ├── fixtures/
│   │   └── auth.ts                   # 登录 fixture
│   ├── utils/
│   │   ├── tour-test-runner.ts       # 配置驱动的测试运行器
│   │   └── screenshot-helper.ts      # 截图辅助函数
│   └── tours/
│       └── tour-guides.spec.ts       # 统一测试入口
```

### 6.2 登录方式

使用 **Cookie/Token 状态复用**：
- 首次运行时自动登录并保存状态到 `.auth/user.json`
- 后续测试复用已保存的认证状态

```typescript
// e2e/auth.setup.ts

import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="account"]', process.env.E2E_TEST_USER_EMAIL!);
  await page.fill('input[name="password"]', process.env.E2E_TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await page.context().storageState({ path: AUTH_FILE });
});
```

### 6.3 配置驱动的测试运行器

```typescript
// e2e/utils/tour-test-runner.ts

import { Page, test } from '@playwright/test';
import type { TourGuide, TourStep } from '../../src/types/tour';

/**
 * 执行单个引导步骤
 */
async function executeStep(page: Page, step: TourStep): Promise<void> {
  const selector = `[data-tour="${step.target}"]`;
  
  if (step.route) {
    await page.goto(step.route);
  }
  
  await page.waitForSelector(selector, { 
    state: 'visible', 
    timeout: (step.waitForElement as number) || 5000 
  });
  
  if (step.mode === 'interactive') {
    const element = page.locator(selector);
    switch (step.actionType) {
      case 'click':
        await element.click();
        break;
      case 'right-click':
        await element.click({ button: 'right' });
        break;
      // ... 其他操作
    }
  }
}

/**
 * 执行完整引导流程测试
 */
export async function runTourGuideTest(page: Page, guide: TourGuide): Promise<void> {
  const startUrl = guide.startPage === 'dashboard' ? '/' : 
                   guide.startPage === 'current' ? page.url() : 
                   guide.startPage;
  
  await page.goto(startUrl);
  
  for (let i = 0; i < guide.steps.length; i++) {
    const step = guide.steps[i];
    await test.step(`步骤 ${i + 1}/${guide.steps.length}: ${step.title}`, async () => {
      await executeStep(page, step);
    });
  }
}
```

### 6.4 统一测试入口

```typescript
// e2e/tours/tour-guides.spec.ts

import { test } from '@playwright/test';
import { tourGuides } from '../../src/config/tourGuides';
import { runTourGuideTest } from '../utils/tour-test-runner';

// 为每个引导生成测试
for (const guide of tourGuides) {
  test(`引导流程: ${guide.name}`, async ({ page }) => {
    await runTourGuideTest(page, guide);
  });
}
```

---

## 7. CDP 文档截图系统

### 7.1 文件结构

```
scripts/
├── generate-tour-docs.ts       # 文档生成主脚本
└── tour-docs-config.ts         # 文档生成配置

documents/user-guide/           # 输出目录
├── file-upload/
│   ├── index.md
│   ├── step-1-projects.png
│   └── ...
```

### 7.2 核心实现

```typescript
// scripts/generate-tour-docs.ts

import { chromium, Page, Browser, CDPSession } from 'playwright';
import * as fs from 'fs';
import { tourGuides } from '../packages/frontend/src/config/tourGuides';

class TourDocGenerator {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;

  async init() {
    this.browser = await chromium.launch({ headless: false });
    const context = await this.browser.newContext({
      storageState: './e2e/.auth/user.json',
      viewport: null,
    });
    this.page = await context.newPage();
    this.cdp = await this.page.context().newCDPSession(this.page);
  }

  /**
   * CDP 高质量截图
   */
  private async takeScreenshot(outputPath: string): Promise<void> {
    const result = await this.cdp!.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    const buffer = Buffer.from((result as any).data, 'base64');
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * 生成 Markdown 文档
   */
  private generateMarkdown(guide: TourGuide, screenshots: string[], outputDir: string): void {
    const lines = [
      `# ${guide.name}`,
      '',
      `> 预计时长：${guide.estimatedTime}`,
      '',
      guide.description,
      '',
      '## 操作步骤',
      '',
    ];

    guide.steps.forEach((step, i) => {
      lines.push(`### ${i + 1}. ${step.title}`);
      lines.push('');
      lines.push(`![${step.title}](${screenshots[i]})`);
      lines.push('');
      lines.push(step.content);
      lines.push('');
    });

    fs.writeFileSync(`${outputDir}/index.md`, lines.join('\n'));
  }
}
```

---

## 8. 实现计划

### Phase 1: 类型定义与核心逻辑

1. 扩展 `types/tour.ts` 添加前置条件和可见性类型
2. 实现 `hooks/useTourVisibility.ts` 权限过滤
3. 修改 `contexts/TourContext.tsx` 添加前置条件检测

### Phase 2: 配置更新

1. 更新 `config/tourGuides.ts` 添加 `visibility` 和 `preconditions`
2. 验证所有引导流程配置正确

### Phase 3: 测试系统

1. 添加 Playwright 依赖
2. 创建 `e2e/` 目录和测试文件
3. 实现配置驱动的测试运行器

### Phase 4: 文档生成

1. 创建 `scripts/generate-tour-docs.ts`
2. 实现 CDP 截图和 Markdown 生成
3. 生成所有引导的用户手册

---

## 9. 文件变更清单

**新增文件：**
```
packages/frontend/src/hooks/useTourVisibility.ts
packages/frontend/e2e/playwright.config.ts
packages/frontend/e2e/auth.setup.ts
packages/frontend/e2e/fixtures/auth.ts
packages/frontend/e2e/utils/tour-test-runner.ts
packages/frontend/e2e/tours/tour-guides.spec.ts
scripts/generate-tour-docs.ts
scripts/tour-docs-config.ts
documents/user-guide/  (自动生成)
```

**修改文件：**
```
packages/frontend/src/types/tour.ts
packages/frontend/src/config/tourGuides.ts
packages/frontend/src/contexts/TourContext.tsx
packages/frontend/package.json  (添加 Playwright 依赖和脚本)
```
