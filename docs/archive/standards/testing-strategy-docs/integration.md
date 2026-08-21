# 集成测试详细模式

## 架构

```
packages/backend/test/
├── integration/              # 集成测试套件
│   ├── auth-registration-login.integration.spec.ts
│   ├── auth-token-refresh.integration.spec.ts
│   ├── cad-concurrent-save-optimistic-lock.integration.spec.ts
│   ├── cad-external-ref.integration.spec.ts
│   ├── cad-save-version.integration.spec.ts
│   ├── cad-upload-convert.integration.spec.ts
│   ├── file-delete-recycle.integration.spec.ts
│   ├── file-operations-crud.integration.spec.ts
│   ├── permission-allocation-cache.integration.spec.ts
│   ├── project-archive-restore.integration.spec.ts
│   ├── project-creation-quota.integration.spec.ts
│   ├── project-member.integration.spec.ts
│   ├── project-ownership-transfer.integration.spec.ts
│   ├── storage-quota-full.integration.spec.ts
│   ├── system-permission-allocation.integration.spec.ts
│   ├── user-deactivation-restore.integration.spec.ts
│   ├── user-password-change.integration.spec.ts
│   ├── workflow-1-upload-convert-open.integration.spec.ts
│   ├── workflow-2-save-mx-version.integration.spec.ts
│   └── workflow-3-delete-recycle-permanent.integration.spec.ts
├── jest-integration.json     # 集成测试 jest 配置
├── jest-e2e.json             # E2E 测试配置
└── mocks-setup.ts            # 集成测试 mock
```

## 集成测试模式

```typescript
describe("Feature Name", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await cleanupTestData();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  }, 60000);

  describe("T1: Specific Flow Step", () => {
    it("T1-S1: Should behave as expected", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "Pass123!" })
        .expect(201);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toBeValidUser();
    });
  });
});
```

## 关键约定

| 约定 | 说明 |
|------|------|
| 测试编号 | `T{num}-S{num}`（如 `T1-S1`） |
| 超时 | 60 秒（模块编译 + 数据库清理） |
| 数据库 | `beforeAll` 清理，`afterAll` 清理 |
| HTTP 客户端 | `supertest` (`request(app.getHttpServer())`) |
| 测试配置 | `jest-integration.json`（独立配置文件） |
| Mock | 不 mock 基础设施（真实 PostgreSQL + Redis） |

## Workflow 集成测试

项目有 3 个 workflow 集成测试覆盖完整业务流程：

| Workflow | 覆盖路径 |
|----------|---------|
| workflow-1 | 上传 → 转换 → 打开 |
| workflow-2 | 保存 → 版本控制 |
| workflow-3 | 删除 → 回收站 → 永久删除 |

## 权限测试运行器

`packages/backend/src/test/permission-test-runner.ts` 是特殊的 `@Injectable()` 权限验证类：

```typescript
const runner = module.get<PermissionTestRunner>(PermissionTestRunner);
const result = await runner.runSystemRoleTestSuite();
// 返回：{ passed, failed, skipped, details }
```

测试套件：
- 系统角色测试（ADMIN vs USER）
- 权限继承测试（USER_MANAGER 继承 USER）
- 缓存一致性测试
- 批量权限检查测试

批量用户创建避免 N+1 问题，测试结果输出 JSON/Markdown 报告。
