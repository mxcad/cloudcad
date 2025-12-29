# 任务 010：集成测试

## 任务描述

对外部参照上传功能进行完整的集成测试，确保所有功能正常工作。

## 任务目标

- ✅ 编写后端集成测试
- ✅ 编写前端集成测试
- ✅ 编写 E2E 测试
- ✅ 测试所有用户场景
- ✅ 验证性能和稳定性
- ✅ 修复发现的问题

## 技术细节

### 1. 后端集成测试

**文件位置**：`packages/backend/test/mxcad-integration.spec.ts`（新建）

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MxCadModule } from '../src/mxcad/mxcad.module';
import { MxCadController } from '../src/mxcad/mxcad.controller';
import { MxCadService } from '../src/mxcad/mxcad.service';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

describe('MxCAD External Reference Integration', () => {
  let app: INestApplication;
  let mxCadService: MxCadService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MxCadModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    mxCadService = moduleFixture.get<MxCadService>(MxCadService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('完整流程测试', () => {
    const testFileHash = 'test_integration_hash';

    beforeAll(() => {
      // 创建测试文件和预加载数据
      const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, testFileHash);

      if (!fs.existsSync(hashDir)) {
        fs.mkdirSync(hashDir, { recursive: true });
      }

      // 创建预加载数据文件
      const preloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      fs.writeFileSync(
        path.join(hashDir, `${testFileHash}.dwg.mxweb_preloading.json`),
        JSON.stringify(preloadingData)
      );
    });

    afterAll(() => {
      // 清理测试文件
      const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, testFileHash);

      if (fs.existsSync(hashDir)) {
        fs.rmSync(hashDir, { recursive: true, force: true });
      }
    });

    it('应该成功获取预加载数据', async () => {
      return request(app.getHttpServer())
        .get(`/api/mxcad/file/${testFileHash}/preloading`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('tz');
          expect(res.body).toHaveProperty('src_file_md5', testFileHash);
          expect(res.body.images).toHaveLength(2);
          expect(res.body.externalReference).toHaveLength(2);
        });
    });

    it('应该正确检查外部参照存在性', async () => {
      // 检查不存在的文件
      return request(app.getHttpServer())
        .post(`/api/mxcad/file/${testFileHash}/check-reference`)
        .send({ fileName: 'ref1.dwg' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('exists', false);
        });
    });

    it('应该成功上传外部参照 DWG', async () => {
      const testFilePath = path.join(__dirname, 'fixtures', 'test_ref.dwg');
      
      // 创建测试文件
      if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, 'test content');
      }

      return request(app.getHttpServer())
        .post('/api/mxcad/up_ext_reference_dwg')
        .attach('file', testFilePath)
        .field('src_dwgfile_hash', testFileHash)
        .field('ext_ref_file', 'ref1.dwg')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('code', 0);
        })
        .finally(() => {
          // 清理测试文件
          if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
          }
        });
    });

    it('应该在上传后检查到文件存在', async () => {
      return request(app.getHttpServer())
        .post(`/api/mxcad/file/${testFileHash}/check-reference`)
        .send({ fileName: 'ref1.dwg' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('exists', true);
        });
    });

    it('应该拒绝无效的外部参照文件', async () => {
      const testFilePath = path.join(__dirname, 'fixtures', 'test_invalid.dwg');
      
      if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, 'test content');
      }

      return request(app.getHttpServer())
        .post('/api/mxcad/up_ext_reference_dwg')
        .attach('file', testFilePath)
        .field('src_dwgfile_hash', testFileHash)
        .field('ext_ref_file', 'invalid.dwg')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('code', -1);
          expect(res.body).toHaveProperty('message', '无效的外部参照文件');
        })
        .finally(() => {
          if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
          }
        });
    });
  });
});
```

### 2. 前端集成测试

**文件位置**：`packages/frontend/test/integration/external-reference.spec.ts`（新建）

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MxCadUploader } from '../../components/MxCadUploader';
import * as apiService from '../../services/apiService';

// Mock API 服务
vi.mock('../../services/apiService', () => ({
  apiService: {},
  mxcadApi: {
    getPreloadingData: vi.fn(),
    checkExternalReferenceExists: vi.fn(),
    uploadExtReferenceDwg: vi.fn(),
    uploadExtReferenceImage: vi.fn(),
  },
}));

describe('MxCAD External Reference Integration', () => {
  const mockFileHash = 'test_integration_hash';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('完整上传流程', () => {
    it('应该在上传成功后自动检测外部参照', async () => {
      // Mock 文件上传成功
      const mockUploadFiles = vi.fn().mockImplementation((config) => {
        config.onSuccess?.({
          file: new File(['content'], 'test.dwg'),
          id: mockFileHash,
          name: 'test.dwg',
          size: 1024,
          type: 'application/octet-stream',
          hash: mockFileHash,
          isUseServerExistingFile: false,
        });
      });

      // Mock 获取预加载数据
      vi.mocked(apiService.mxcadApi.getPreloadingData).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: mockFileHash,
          images: ['image1.png'],
          externalReference: ['ref1.dwg'],
        },
      } as any);

      // Mock 检查外部参照存在性
      vi.mocked(apiService.mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      render(
        <MxCadUploader
          nodeId="test-node-id"
          onSuccess={() => {}}
          onError={() => {}}
        />
      );

      // 触发文件上传
      const uploadButton = screen.getByText('上传 CAD 文件');
      await userEvent.click(uploadButton);

      // 等待外部参照检测完成
      await waitFor(() => {
        expect(screen.getByText(/检测到 2 个缺失的外部参照文件/)).toBeInTheDocument();
      });
    });

    it('应该支持跳过外部参照上传', async () => {
      // Mock 文件上传成功
      const mockUploadFiles = vi.fn().mockImplementation((config) => {
        config.onSuccess?.({
          file: new File(['content'], 'test.dwg'),
          id: mockFileHash,
          name: 'test.dwg',
          size: 1024,
          type: 'application/octet-stream',
          hash: mockFileHash,
          isUseServerExistingFile: false,
        });
      });

      // Mock 获取预加载数据
      vi.mocked(apiService.mxcadApi.getPreloadingData).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: mockFileHash,
          images: ['image1.png'],
          externalReference: ['ref1.dwg'],
        },
      } as any);

      // Mock 检查外部参照存在性
      vi.mocked(apiService.mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      const onSkip = vi.fn();

      render(
        <MxCadUploader
          nodeId="test-node-id"
          onSuccess={() => {}}
          onError={() => {}}
          onExternalReferenceSkip={onSkip}
        />
      );

      // 触发文件上传
      const uploadButton = screen.getByText('上传 CAD 文件');
      await userEvent.click(uploadButton);

      // 等待外部参照检测完成
      await waitFor(() => {
        expect(screen.getByText(/检测到 2 个缺失的外部参照文件/)).toBeInTheDocument();
      });

      // 点击"稍后上传"
      const skipButton = screen.getByText('稍后上传');
      await userEvent.click(skipButton);

      // 验证跳过回调被调用
      expect(onSkip).toHaveBeenCalled();
    });

    it('应该支持上传外部参照文件', async () => {
      // Mock 文件上传成功
      const mockUploadFiles = vi.fn().mockImplementation((config) => {
        config.onSuccess?.({
          file: new File(['content'], 'test.dwg'),
          id: mockFileHash,
          name: 'test.dwg',
          size: 1024,
          type: 'application/octet-stream',
          hash: mockFileHash,
          isUseServerExistingFile: false,
        });
      });

      // Mock 获取预加载数据
      vi.mocked(apiService.mxcadApi.getPreloadingData).mockResolvedValue({
        data: {
          tz: false,
          src_file_md5: mockFileHash,
          images: ['image1.png'],
          externalReference: ['ref1.dwg'],
        },
      } as any);

      // Mock 检查外部参照存在性
      vi.mocked(apiService.mxcadApi.checkExternalReferenceExists).mockResolvedValue({
        data: { exists: false },
      } as any);

      // Mock 上传外部参照
      vi.mocked(apiService.mxcadApi.uploadExtReferenceDwg).mockResolvedValue({
        data: { code: 0, message: 'ok' },
      } as any);

      const onSuccess = vi.fn();

      render(
        <MxCadUploader
          nodeId="test-node-id"
          onSuccess={() => {}}
          onError={() => {}}
          onExternalReferenceSuccess={onSuccess}
        />
      );

      // 触发文件上传
      const uploadButton = screen.getByText('上传 CAD 文件');
      await userEvent.click(uploadButton);

      // 等待外部参照检测完成
      await waitFor(() => {
        expect(screen.getByText(/检测到 2 个缺失的外部参照文件/)).toBeInTheDocument();
      });

      // 点击"选择文件"
      const selectButton = screen.getByText('选择文件');
      await userEvent.click(selectButton);

      // 点击"上传"
      await waitFor(() => {
        const uploadButton = screen.getByText('上传');
        expect(uploadButton).not.toBeDisabled();
      });

      const uploadButton = screen.getByText('上传');
      await userEvent.click(uploadButton);

      // 等待上传完成
      await waitFor(() => {
        expect(screen.getByText('完成')).not.toBeDisabled();
      });

      // 点击"完成"
      const completeButton = screen.getByText('完成');
      await userEvent.click(completeButton);

      // 验证成功回调被调用
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
```

### 3. E2E 测试

**文件位置**：`packages/frontend/test/e2e/external-reference.e2e-spec.ts`（新建）

```typescript
import { test, expect } from '@playwright/test';

test.describe('外部参照上传 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="account"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:3000/projects');
  });

  test('应该在上传 CAD 文件后检测外部参照', async ({ page }) => {
    // 创建测试项目
    await page.click('button:has-text("新建项目")');
    await page.fill('input[placeholder="请输入项目名称"]', '测试项目');
    await page.click('button:has-text("创建")');

    // 等待项目创建完成
    await page.waitForSelector('text=测试项目');

    // 上传 CAD 文件
    const fileInput = await page.$('input[type="file"]');
    const file = await page.$('button:has-text("上传 CAD 文件")');
    await file?.click();

    // 选择测试文件
    await page.setInputFiles('input[type="file"]', 'test/fixtures/test_with_references.dwg');

    // 等待上传完成
    await page.waitForSelector('text=文件上传成功');

    // 验证外部参照检测模态框显示
    await expect(page.locator('text=上传外部参照文件')).toBeVisible();
    await expect(page.locator('text=/检测到.*个缺失的外部参照文件/')).toBeVisible();
  });

  test('应该支持跳过外部参照上传', async ({ page }) => {
    // 上传文件（同上）
    // ...

    // 点击"稍后上传"
    await page.click('button:has-text("稍后上传")');

    // 验证模态框关闭
    await expect(page.locator('text=上传外部参照文件')).not.toBeVisible();

    // 验证文件列表显示警告标识
    await expect(page.locator('text=缺失.*个外部参照')).toBeVisible();
  });

  test('应该支持随时上传外部参照', async ({ page }) => {
    // 上传文件并跳过（同上）
    // ...

    // 点击"更多操作"按钮
    await page.click('button[title="更多操作"]');

    // 点击"上传外部参照"
    await page.click('text=上传外部参照');

    // 验证模态框重新打开
    await expect(page.locator('text=上传外部参照文件')).toBeVisible();

    // 上传外部参照文件
    await page.click('button:has-text("选择文件")');
    await page.setInputFiles('input[type="file"]', 'test/fixtures/ref1.dwg');

    // 等待上传完成
    await page.waitForSelector('text=上传成功');

    // 点击"完成"
    await page.click('button:has-text("完成")');

    // 验证警告标识消失
    await expect(page.locator('text=缺失.*个外部参照')).not.toBeVisible();
  });
});
```

### 4. 测试场景清单

| 场景 | 描述 | 优先级 |
|------|------|--------|
| 场景 1 | 上传有外部参照的文件，自动检测 | 高 |
| 场景 2 | 立即上传所有外部参照 | 高 |
| 场景 3 | 跳过外部参照上传 | 高 |
| 场景 4 | 从文件列表上传外部参照 | 高 |
| 场景 5 | 从操作菜单上传外部参照 | 中 |
| 场景 6 | 无缺失外部参照时不显示警告 | 中 |
| 场景 7 | 上传失败时显示错误提示 | 中 |
| 场景 8 | 部分文件上传失败的处理 | 中 |
| 场景 9 | 并发上传多个外部参照 | 低 |
| 场景 10 | 大文件上传性能测试 | 低 |

## 验收标准

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 所有 E2E 测试通过
- [ ] 测试覆盖率 >= 80%
- [ ] 性能测试通过
- [ ] 无已知严重 bug
- [ ] 文档完整

## 测试执行

### 1. 后端测试

```bash
cd packages/backend
pnpm test mxcad-integration.spec.ts
```

### 2. 前端测试

```bash
cd packages/frontend
pnpm test external-reference.spec.ts
```

### 3. E2E 测试

```bash
cd packages/frontend
pnpm test:e2e external-reference.e2e-spec.ts
```

### 4. 测试覆盖率

```bash
cd packages/backend
pnpm test:cov

cd packages/frontend
pnpm test:coverage
```

## 注意事项

1. **测试数据**：使用独立的测试数据，避免污染生产数据
2. **清理工作**：测试完成后清理临时文件和数据
3. **并发测试**：确保测试可以并发执行
4. **性能监控**：监控测试执行时间和资源使用
5. **错误报告**：提供详细的错误报告和日志

## 依赖任务

- ✅ 任务 001-009：所有前置任务（必须）

## 后续任务

- 性能优化
- 文档完善
- 部署验证

---

**任务状态**：⬜ 待开始  
**预计工时**：4 小时  
**负责人**：待分配  
**创建日期**：2025-12-29