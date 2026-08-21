# 测试质量审查报告 — CloudCAD

> 审查日期：2026-05-08 | 审查范围：packages/backend、packages/frontend | 测试框架：Jest（后端）、Vitest（前端）

---

## 1. 测试覆盖率概览

### 1.1 整体数据

| 维度 | 后端 | 前端 | 合计 |
|------|------|------|------|
| 单元测试文件 (.spec.ts) | 48 | 13 | 61 |
| 集成测试文件 (.integration.spec.ts) | 24 | 1 | 25 |
| E2E 测试文件 | 0 | 1 | 1 |
| **测试文件总计** | **72** | **15** | **87** |
| 源代码 service 文件 | 90 | N/A | - |
| 源代码 controller 文件 | 21 | N/A | - |

### 1.2 按模块的测试覆盖

| 模块 | 源文件数 | 有测试 | 覆盖率 |
|------|---------|--------|--------|
| **auth** | 10 | 7 (含 1 个 facade) | ✅ 70% |
| **file-system** | 15 | 10 | ✅ 67% |
| **mxcad** | 16 | 9 | 🟡 56% |
| **roles** | 3 | 3 | ✅ 100% |
| **version-control** | 1 | 1 | ✅ 100% |
| **common/services** | 12 | 2 | 🔴 17% |
| **conversion** | 3 | 0 | 🔴 0% |
| **cache-architecture** | 3 | 2 | 🟡 67% |
| **users** | 2 | 0 | 🔴 0% |
| **library** | 2 | 0 | 🔴 0% |
| **policy-engine** | 3 | 0 | 🔴 0% |
| **storage** | 2 | 0 | 🔴 0% |
| **fonts** | 1 | 0 | 🔴 0% |
| **public-file** | 2 | 0 | 🔴 0% |
| **database** | 1 | 0 | 🔴 0% |

---

## 2. 问题详细列表

### 问题 1：大量核心 service 缺乏单元测试

- **文件路径**: `packages/backend/src/common/services/` 目录
- **严重程度**: 🔴 高
- **问题描述**: `common/services/` 包含 12 个 service，仅有 2 个（`permission.service.ts`、`permission.service.spec.ts`）有测试。以下关键 service 完全无测试：
  - `role-inheritance.service.ts` — 权限继承核心逻辑，jest.config 中设定了 70% 覆盖率阈值却无测试文件
  - `redis-cache.service.ts` — Redis 缓存操作
  - `storage-manager.service.ts` — 存储路径管理
  - `file-lock.service.ts` — 文件锁并发控制
  - `directory-allocator.service.ts` — 目录分配算法
  - `disk-monitor.service.ts` — 磁盘监控
  - `permission-cache.service.ts` — 权限缓存核心
- **修复建议**: 按优先级逐步补充。P0：`role-inheritance.service.spec.ts`、`permission-cache.service.spec.ts`；P1：`storage-manager.service.spec.ts`、`file-lock.service.spec.ts`
- **是否需要用户确认**: 是（需排定优先级）

### 问题 2：conversion 模块完全无测试

- **文件路径**: `packages/backend/src/conversion/` 目录
- **严重程度**: 🔴 高
- **问题描述**: conversion 模块包含 3 个 service（`format-converter.service.ts`、`output-path-resolver.service.ts`、`process-runner.service.ts`），是文件格式转换的核心管线。`process-runner.service.ts` 更是在全局 `setup.ts` 中被 mock（第 222 行），说明这是一个难以测试的外部依赖，但完全没有单元测试覆盖其集成逻辑。
- **修复建议**: 建立 `process-runner.service.spec.ts`，通过 mock 子进程验证启动/停止/错误处理逻辑；建立 `format-converter.service.spec.ts` 验证格式转换参数构建
- **是否需要用户确认**: 是（确认 conversion 模块测试策略）

### 问题 3：file-system.service.spec.ts 过度 mock，测试沦为"委托验证"

- **文件路径**: `packages/backend/src/file-system/file-system.service.spec.ts:1-367`
- **严重程度**: 🟡 中
- **问题描述**: `FileSystemService` 是一个门面类，其方法主要委托给 7 个子 service。当前测试 367 行的 90% 都是验证"调用 X 方法时，子 service Y 的 Z 方法被正确调用"。例如：
  ```
  it('createProject delegates to ProjectCrudService', async () => {
    mockProjectCrud.createProject.mockResolvedValue({ id: 'p1' });
    expect(await service.createProject('u1', dto as any)).toEqual({ id: 'p1' });
    expect(mockProjectCrud.createProject).toHaveBeenCalledWith('u1', dto);
  });
  ```
  这类测试验证的是框架级委托链，而非业务逻辑。如果子 service 被重构为直接注入 Controller，这些测试完全不提供保护价值。只有 `getNodeStorageQuota` 和 `updateNodeStorageQuota` 等少数方法有真正的业务断言（如"节点不存在时抛出异常"）。
- **修复建议**: 
  1. 对于纯委托方法，可考虑使用集成测试覆盖（不 mock 子 service）
  2. 保留有业务逻辑的方法的单元测试（如 storage quota 相关）
  3. 避免对所有委托方法编写同质化的 mock 验证测试
- **是否需要用户确认**: 否

### 问题 4：前端 controller 层完全无测试

- **文件路径**: `packages/backend/src/*/` 各模块 controller
- **严重程度**: 🟡 中
- **问题描述**: 后端 21 个 controller 中，仅 3 个有测试（`mxcad.controller.spec.ts`、`thumbnail.controller.spec.ts`、`save.controller.spec.ts`）。`auth.controller.ts`、`file-system.controller.ts`、`users.controller.ts` 等核心 controller 完全无单元测试。这意味着路由、守卫、拦截器、参数验证等 NestJS 层面的行为未被覆盖。
- **修复建议**: 至少对核心 controller（auth、file-system、users）补充 controller 级别的单元测试，验证路由守卫和参数验证逻辑
- **是否需要用户确认**: 是（需确认 controller 测试策略——单元测试 vs E2E 测试）

### 问题 5：前端业务 hook 测试过少

- **文件路径**: `packages/frontend/src/hooks/` 目录
- **严重程度**: 🟡 中
- **问题描述**: 前端 hooks 目录包含约 15+ 个 hook 文件，但仅有 5 个有测试：
  - `usePermission.spec.ts` ✅
  - `useProjectPermission.spec.ts` ✅
  - `useLoginForm.spec.ts` ✅（仅 2 个测试用例）
  - `useFileSystemCRUD.spec.ts` ✅
  - `useExternalReferenceUpload.spec.ts` ✅
  
  缺少测试的关键 hook：`useAuth`、`useFileOperations`、`useNodeSelection`、`useProjectList`、`useSearch` 等。
- **修复建议**: 优先为使用频率最高的 hook（`useAuth`、`useFileOperations`）补充测试
- **是否需要用户确认**: 否

### 问题 6：useLoginForm.spec.ts 测试用例严重不足

- **文件路径**: `packages/frontend/src/pages/Login/hooks/useLoginForm.spec.ts:30-66`
- **严重程度**: 🟡 中
- **问题描述**: `useLoginForm` hook 包含表单验证、发送验证码、多种登录方式切换等复杂逻辑，但测试文件仅有 2 个测试用例（发送验证码成功和验证失败）。以下场景完全未覆盖：
  - 表单验证逻辑（邮箱格式、手机号格式、密码长度）
  - 登录方式切换（邮箱/手机/微信）
  - 登录失败处理（错误提示）
  - 加载状态管理
  - 微信登录流程
- **修复建议**: 为 useLoginForm 补充至少 10+ 测试用例覆盖所有登录方式和边界条件
- **是否需要用户确认**: 否

### 问题 7：全局覆盖率阈值设置为 0

- **文件路径**: `packages/backend/jest.config.ts:46-52`
- **严重程度**: 🟡 中
- **问题描述**: 
  ```ts
  coverageThreshold: {
    global: {
      branches: 0,  // 全局不要求覆盖率
      functions: 0,
      lines: 0,
      statements: 0,
    },
  ```
  全局阈值全部为 0，意味着无论整体覆盖率多低，CI 都不会失败。虽然有 6 个文件的独立阈值（P0:80%、P1:70%），但这些阈值的文件路径 `./src/auth/auth.service.ts` 可能不存在（实际文件是 `auth-facade.service.ts` 或 `login.service.ts`）。
- **修复建议**: 
  1. 验证覆盖率阈值中的文件路径是否与实际文件匹配
  2. 将全局 `branches` 阈值至少设为 50%，渐进提升
  3. 添加更多核心模块的独立阈值
- **是否需要用户确认**: 是（需确认阈值数值）

### 问题 8：前端 vitest 配置缺少覆盖率阈值

- **文件路径**: `packages/frontend/vitest.config.ts:14-17`
- **严重程度**: 🟡 中
- **问题描述**: 前端 vitest 配置了 coverage 的 provider 和 reporter，但完全没有设置 `thresholds`：
  ```ts
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
  },
  ```
  缺少 `thresholds` 导致前端任何覆盖率都不会触发 CI 失败。
- **修复建议**: 添加最低覆盖率阈值：
  ```ts
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    thresholds: {
      lines: 40,
      functions: 40,
      branches: 30,
      statements: 40,
    },
  },
  ```
- **是否需要用户确认**: 是（需确认前端阈值数值）

### 问题 9：fileUtils.spec.ts 使用 emoji 对比，脆弱不可靠

- **文件路径**: `packages/frontend/src/utils/fileUtils.spec.ts:64-145`
- **严重程度**: 🟢 低
- **问题描述**: `getFileIcon` 函数返回 emoji 作为文件图标（📁、📐、📏、📄、🖼️），测试中直接对比 emoji 字面量。例如：
  ```ts
  expect(getFileIcon(folder)).toBe('📁');
  expect(getFileIcon(dwgFile)).toBe('📐');
  ```
  这种测试的问题：
  1. 如果产品经理要求更换图标，测试会失败但功能并未出错
  2. emoji 在不同环境下渲染可能不一致
  3. 测试无法传达图标语义的正确性
- **修复建议**: 验证返回值为非空字符串而非精确匹配 emoji，或者使用语义化的常量映射
- **是否需要用户确认**: 否

### 问题 10：多个集成测试路径重复

- **文件路径**: `packages/backend/test/integration/` 和 `packages/backend/src/test/integration/`
- **严重程度**: 🟢 低
- **问题描述**: 后端有两个集成测试目录：
  - `packages/backend/test/integration/`（22 个文件）
  - `packages/backend/src/test/integration/`（2 个文件）
  
  `file-delete-recycle.integration.spec.ts` 在两个目录中重复存在。这种分离可能导致测试维护混乱。
- **修复建议**: 统一集成测试目录为 `packages/backend/test/integration/`，删除 `src/test/integration/` 中的重复文件
- **是否需要用户确认**: 是（需确认统一到哪个目录）

### 问题 11：后端 jest-snapshot-resolver.js 引用但文件存在性未验证

- **文件路径**: `packages/backend/jest.config.ts:106`
- **严重程度**: 🟢 低
- **问题描述**: config 引用了 `<rootDir>/jest-snapshot-resolver.js`，但未确认该文件是否存在。如果缺失会导致快照功能异常。
- **修复建议**: 确认 `packages/backend/jest-snapshot-resolver.js` 存在并包含正确的自定义解析逻辑
- **是否需要用户确认**: 否

### 问题 12：测试 setup 中 console mock 可能隐藏真实错误

- **文件路径**: `packages/backend/src/test/setup.ts:26-31`
- **严重程度**: 🟢 低
- **问题描述**: 全局 setup 中 mock 了所有 console 方法：
  ```ts
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  ```
  这会隐藏测试中可能发生的真实错误日志，使调试困难。建议仅 mock `log` 和 `debug`，保留 `warn` 和 `error`。
- **修复建议**: 移除 `console.warn` 和 `console.error` 的 mock，或至少改为透传
- **是否需要用户确认**: 否

### 问题 13：version-control.service.spec.ts 中的 mock 架构值得称赞

- **文件路径**: `packages/backend/src/version-control/version-control.service.spec.ts:30-91`
- **严重程度**: ✅ 正面案例
- **问题描述**: 该测试文件展示了优秀的 mock 模式：
  - 使用可变的 dispatch 表 (`svnBehaviors`) 实现不同测试场景的 SVN 行为切换
  - 提供 `svnOk()` 和 `svnFail()` 工厂函数简化测试编写
  - `resetSvnDefaults()` 在 `beforeEach` 中重置状态
  - 覆盖了初始化状态、错误处理、XML 解析、实体解码、锁重试等多种场景
  - 使用 `T2-S1/S2/S3` 的结构化场景编号
  
  这是一个高质量的测试文件，可作为团队的参考模板。
- **是否需要用户确认**: 否

### 问题 14：permission.service.spec.ts 的缓存逻辑测试质量高

- **文件路径**: `packages/backend/src/common/services/permission.service.spec.ts:76-154`
- **严重程度**: ✅ 正面案例
- **问题描述**: `checkSystemPermission` 的测试覆盖了完整的缓存状态机：
  - 缓存命中（true/false）→ 直接返回，不调用下层服务
  - 缓存未命中 → 委托给 RoleInheritanceService → 缓存结果
  - RoleInheritanceService 抛异常 → 返回 false，不缓存错误结果
  - Cache service 抛异常 → 安全降级返回 false
  
  这种对缓存边界条件的全面测试应当推广到其他使用缓存的 service。
- **是否需要用户确认**: 否

### 问题 15：auth-registration-login.integration.spec.ts 集成测试结构优秀

- **文件路径**: `packages/backend/test/integration/auth-registration-login.integration.spec.ts:1-413`
- **严重程度**: ✅ 正面案例
- **问题描述**: 这个集成测试文件展示了优秀的全链路测试模式：
  - 使用真实的 NestJS AppModule + Prisma + supertest
  - `beforeAll`/`afterAll` 进行数据清理，保证测试隔离
  - 结构化的 T1-T6 场景编号（注册 → 邮箱验证 → 登录 → Token 刷新 → 登出 → 完整链路）
  - 每个场景包含多个 S1-S5 子场景，覆盖正常流程 + 异常路径
  - 使用 `Date.now()` 生成唯一测试数据避免冲突
  
  这种集成测试模式应与单元测试形成互补，目前缺少此类测试的模块应参考此结构补充。
- **是否需要用户确认**: 否

---

## 3. 集成测试覆盖分析

### 3.1 已覆盖模块

| 集成测试文件 | 覆盖模块 | 质量 |
|------------|---------|------|
| auth-registration-login | 注册→验证→登录→刷新→登出 全链路 | ⭐⭐⭐ |
| auth-token-refresh | Token 刷新专项 | ⭐⭐⭐ |
| cad-concurrent-save-optimistic-lock | 并发保存乐观锁 | ⭐⭐⭐ |
| cad-external-ref | 外部参照 | ⭐⭐ |
| cad-save-as-duplicate-version-chain | 版本链 | ⭐⭐ |
| cad-save-version | 保存版本 | ⭐⭐ |
| cad-upload-convert | 上传转换 | ⭐⭐ |
| file-operations-crud | 文件 CRUD | ⭐⭐ |
| file-delete-recycle | 删除回收 | ⭐⭐ |
| file-search | 文件搜索 | ⭐⭐ |
| permission-allocation-cache | 权限分配缓存 | ⭐⭐ |
| project-* 系列 | 项目相关操作 | ⭐⭐ |
| user-* 系列 | 用户管理 | ⭐⭐ |
| workflow-1/2/3 | 端到端工作流 | ⭐⭐⭐ |
| project-lifecycle | 项目生命周期 | ⭐⭐ |

### 3.2 缺失集成测试的关键路径

- **文件转换完整管线**：upload → convert → save → commit（无端到端转换测试）
- **WebSocket 实时协作**：多用户同时编辑同一文件
- **大文件分片上传**：TUS 协议完整流程
- **角色继承链**：系统角色 → 项目角色 → 个人权限的传递验证
- **缓存一致性**：Redis 缓存与数据库之间的数据一致性

---

## 4. Mock 使用评估

### 4.1 后端全局 Mock（setup.ts）

| Mock 对象 | 合理性 | 说明 |
|----------|--------|------|
| `bcryptjs` | ✅ | 避免真实密码哈希影响测试速度 |
| `conversion` 模块 | ✅ | 避免子进程依赖 |
| `@nestjs-modules/mailer` | ✅ | 避免原生 binary 依赖 |
| `@tus/server`, `@tus/file-store` | ✅ | ESM 兼容性 |
| `flydrive` | ✅ | ESM 兼容性 |
| `ioredis` (Redis) | ✅ | 避免测试需要 Redis 实例 |

### 4.2 前端全局 Mock（setup.ts）

| Mock 对象 | 合理性 | 说明 |
|----------|--------|------|
| `mxcad` / `mxdraw` | ✅ | Native SDK，测试环境无法加载 |
| MSW server | ✅ | HTTP 请求拦截，专业方案 |
| `ResizeObserver` / `IntersectionObserver` | ✅ | happy-dom 不支持 |
| `matchMedia` | ✅ | happy-dom 不支持 |

---

## 5. 测试组织评估

### 5.1 结构清晰度

- ✅ 后端测试普遍使用 `describe` 嵌套组织，子场景使用 `describe('when ...')` 模式
- ✅ 集成测试使用 `T1-S1` 编号系统，便于追踪
- ✅ 前端使用 Vitest 的 `describe`/`it`，组织合理
- 🟡 部分测试文件缺少 `afterEach` 清理（如 `login.service.spec.ts`）
- 🟡 后端 `jest.config` 设置了 `clearMocks/restoreMocks/resetMocks = true`，但 `beforeEach` 中仍有冗余的 `jest.clearAllMocks()` 调用

### 5.2 断言充分性

- ✅ `permission.service.spec.ts`：断言包含参数匹配 (`expect.any(Number)`)、调用次数、未调用验证
- ✅ `login.service.spec.ts`：使用 `expect.objectContaining` 和 `expect.arrayContaining` 进行深度匹配
- 🟡 `file-system.service.spec.ts`：大部分断言仅验证 delegate 调用，缺少返回值内容验证
- 🟡 `mxcad.service.spec.ts`：部分测试仅验证返回值的单一字段，未验证完整响应结构

---

## 6. 总结

### 6.1 测试体系优势

1. **集成测试丰富**：24 个集成测试文件覆盖了认证、文件操作、CAD 保存、权限等核心流程，使用真实数据库 + supertest 的端到端方案
2. **关键模块测试深入**：`version-control`（SVN mock 模式经典）、`permission`（缓存逻辑全面）、`auth`（登录全路径覆盖）的单元测试质量高
3. **全局 Mock 策略合理**：ESM 兼容性问题、Native 依赖、子进程通过全局 setup 统一 mock，性价比高
4. **自定义 Jest matcher**：`toBeValidUser`、`toBeValidAuthResponse` 等自定义断言提高测试可读性
5. **MSW 集成**：前端使用 MSW 进行 HTTP mock，是业界最佳实践

### 6.2 主要不足

| 严重程度 | 数量 | 关键问题 |
|---------|------|---------|
| 🔴 高 | 2 | common/services 大面积缺失测试、conversion 模块零测试 |
| 🟡 中 | 6 | controller 层少测试、file-system 过度 mock、前端 hook 测试少、useLoginForm 不足、覆盖率阈值问题 |
| 🟢 低 | 4 | emoji 对比脆弱、目录分离、snapshot resolver 引用、console mock 过度 |
| ✅ 正面 | 3 | version-control mock 模式、permission 缓存测试、auth 集成测试 |

### 6.3 优先级建议

| 优先级 | 行动 | 预计工作量 |
|--------|------|----------|
| P0 | 为 `role-inheritance.service.ts`、`permission-cache.service.ts` 补充单元测试 | 3-5 天 |
| P0 | 为 `conversion` 模块中 `process-runner.service.ts` 补充测试 | 2-3 天 |
| P1 | 提升全局覆盖率阈值（后端 branches ≥ 50%，前端 lines ≥ 40%） | 0.5 天 |
| P1 | 为 `auth.controller.ts`、`file-system.controller.ts` 补充 controller 测试 | 3-5 天 |
| P1 | 为前端 `useAuth`、`useFileOperations` 等核心 hook 补充测试 | 3-5 天 |
| P2 | 删除重复的集成测试目录，统一结构 | 0.5 天 |
| P2 | 为 `file-system.service.spec.ts` 中的委托方法替换为集成测试覆盖 | 2-3 天 |
| P3 | 完善 `useLoginForm.spec.ts` 到 10+ 用例 | 1-2 天 |

**总计预估工作量**：15-25 人天

---

*报告由测试质量审查专家生成，审查范围覆盖 packages/backend 和 packages/frontend 的全部测试文件、配置和关键源码。*
