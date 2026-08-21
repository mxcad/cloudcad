---
name: testing-strategy
description: CloudCAD 测试策略与规范 — Jest（后端）/ Vitest（前端）配置、Mock 模式、集成测试、覆盖阈值。Use when writing tests, running test commands, mocking dependencies, setting up test modules, or fixing test failures in backend or frontend.
---

# 测试策略

> 后端 Jest（30s timeout, clearMocks+restoreMocks+resetMocks），前端 Vitest（happy-dom, MSW mock）。

## 强制规则（#284-#296 立项依据）

1. **新增关键业务模块/路径必须附带集成测试或排票声明**，禁止出现"零测试模块"。判断标准：跨模块编排 + 真实基础设施（DB/Redis/三方/WebSocket）交互，单测 mock 覆盖不了正确性（实例：share/public-file/notification 曾整体零测试）。
2. **关键 bug 修复必须带回归测试**（无法单测覆盖的走集成测试）。
3. **契约先行**：改 DTO/Controller 后必须重新生成 API SDK + MSW handler 并提交（CI 门禁 #296 落地前由人工检查）。
4. 集成测试归口 `test/integration/`（真实 PG+Redis，`pnpm test:integration` 跑）；`src/test/` 下不得新增 mock 伪集成文件（命名 `*.integration.spec.ts` 即被视为真集成，统一放 `test/integration/`；mock 单测用 `*.unit.spec.ts` 命名）。
5. 三命令语义（jest.config.cjs 已固化）：`pnpm test` / `test:unit` = **纯单元测试**（本地无 DB 可全绿，已排除 `/integration/`、`*.integration.spec.ts`、`*.e2e-spec.ts`）；`pnpm test:integration` = 真集成（需 DB，`maxWorkers=1` 串行）。

**已立项缺口**：#284 协同、#285 微信登录、#286 批量下载、#287 分享、#288 图库、#289 配额边界、#290-#293 前端页面级、#294 协同 E2E、#295 测试基础设施、#296 契约门禁。

## 命令速查

```bash
# 后端
pnpm test                    # 单元测试（默认，无 DB 可跑）
pnpm test:unit               # 单元测试（与 pnpm test 同语义，显式别名）
pnpm test:integration        # 集成测试（独立 jest config，需 PG+Redis，串行执行）
pnpm test:permission         # 仅 permission 测试
pnpm test:permission:scenarios

# 前端
pnpm test                    # vitest run
pnpm test:coverage           # 带覆盖率
pnpm test:ui                 # UI 模式
```

## 后端测试模式

### Service 测试

```typescript
describe('LoginService', () => {
  let service: LoginService;
  const mockPrisma = { user: { findFirst: jest.fn() } };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoginService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<LoginService>(LoginService);
  });

  describe('when user does not exist', () => {
    it('should throw UnauthorizedException', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

**规则：**
- Mock **内联定义**（不从外部导入 mock 对象）
- 测试验证输出（返回值）+ 副作用（mock 调用参数）
- `describe('when ...')` 嵌套覆盖成功/错误/边界路径

### Controller 测试

```typescript
describe('BatchDownloadController', () => {
  let controller: BatchDownloadController;
  let mockService: any;  // 宽松类型（后端 tsconfig）

  const mockRequest = (userId) => ({ user: { id: userId } } as any);

  beforeEach(async () => {
    mockService = { createTask: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [BatchDownloadController],
      providers: [{ provide: BatchDownloadService, useValue: mockService }],
    }).compile();
    controller = module.get<BatchDownloadController>(BatchDownloadController);
  });
});
```

**规则：**
- 只 mock Service 层（不 mock 基础设施）
- 请求/响应手动构建（`as any`）
- Guard 通过 `.overrideGuard()` 绕过

### 集成测试

```typescript
describe("Auth Registration → Login Integration", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],  // 真实模块
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = new PrismaClient();
    await cleanupTestData();
  }, 60000);
});
```

**规则：**
- 导入 `AppModule`（真实模块）
- 使用 `supertest` (`request(app.getHttpServer())`)
- `beforeAll` 中清理数据库
- 测试编号 `T1-S1`, `T3-S2` 等

> 详细模式见 [docs/integration.md](docs/integration.md)

## 全局 Mock 策略

### 后端（`src/test/setup.ts`）

| 依赖 | Mock 方式 |
|------|----------|
| `bcryptjs` | hash → `"hashed-password"`, compare → `true` |
| `conversion` | mock `ProcessRunnerService` + `ConversionModule` |
| `@nestjs-modules/mailer` | mock `MailerService` |
| `flydrive` | mock 存储层 |
| `ioredis` | mock Redis（get/set/del/exists） |

### 前端（`vitest.config.ts` + `src/test/setup.ts`）

| 依赖 | Mock 方式 |
|------|----------|
| `mxcad`, `mxdraw` | `src/test/__mocks__/empty.ts`（空导出） |
| API 请求 | MSW (`src/test/msw/generated/handlers.ts`，从 Swagger 自动生成) |
| 浏览器 API | `ResizeObserver`, `matchMedia`, `IntersectionObserver` |

## 自定义 Matcher（后端）

| Matcher | 验证内容 |
|---------|---------|
| `toBeValidUser()` | id/email/username/role/status，无 password |
| `toBeValidAuthResponse()` | accessToken + refreshToken + user |
| `toBeValidPaginatedResponse()` | `{ data, pagination: { page, limit, total, totalPages } }` |
| `toHavePermission(perm)` | 权限数组中包含某权限 |
| `toBeInStatus(status)` | 用户状态字段 |

## 测试工具（`src/test/test-utils.ts`）

```typescript
// 测试模块构建
createTestModule()  // NestJS Test.createTestingModule 封装

// Mock 数据工厂
createMockUser(), createMockProject(), createMockFile()
createMockProjectMember(), createMockFileAccess()

// 预定义用户
testUsers.admin, testUsers.user, testUsers.inactive

// 预定义令牌
testTokens.admin, testTokens.user, testTokens.expired, testTokens.invalid

// 预构建 mock 对象
mockDatabaseService, mockJwtService, mockConfigService
mockPermissionService, mockPermissionCacheService
mockAuthService, mockUsersService

// 辅助函数
setupTestDatabase(), cleanupTestDatabase()
expectValidUserResponse(), expectValidAuthResponse()
expectPaginatedResponse(), expectErrorResponse()
sleep(ms), generateId(), generateEmail(), generateUsername()
createTestUserData(), createTestLoginData()
```

## 覆盖阈值

| 文件 | 分支 | 函数 | 行 | 语句 |
|------|------|------|-----|------|
| `auth.service.ts` | 80% | 85% | 85% | 85% |
| `permission.service.ts` | 80% | 85% | 85% | 85% |
| `file-system.service.ts` | 70% | 75% | 75% | 75% |
| `role-inheritance.service.ts` | 70% | 75% | 75% | 75% |
| `file-validation.service.ts` | 70% | 75% | 75% | 75% |
| `file-system-permission.service.ts` | 70% | 75% | 75% | 75% |

## 关键陷阱

- **后端 `clearMocks+restoreMocks+resetMocks` 全 `true`** — mock 状态每个 test 前重置
- **前端 MSW `onUnhandledRequest: 'error'`** — 未 mock 的 API 请求会抛错
- **集成测试 60s 超时** — `beforeAll` 中模块编译可能较慢
- **`describe('when ...')` 嵌套是强制约定** — 结构化测试组织
- **`createTestModule()` 不是 `beforeEach` 默认** — 每个测试文件根据需求决定是否复用
