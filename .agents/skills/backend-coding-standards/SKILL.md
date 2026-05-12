---
name: backend-coding-standards
description: 后端编码规范 — NestJS DI 注意事项、Prisma 迁移/枚举规则、Façade 模式、审计日志、权限检查、配置管理。触发条件：编写 NestJS service/controller、Prisma schema 变更、权限逻辑、后端 API 或任何 packages/backend 下的代码变更。自动引用 project-coding-standards 的公共规范。
---

<what-to-do>

处理后端代码时，必须遵守以下后端特有规范。同时自动遵守 `project-coding-standards` 的全部公共规则。

**核心原则**：Controller 只做路由委托，业务逻辑放 Service。先查已有 Service 是否提供所需功能，再决定是否新增。

</what-to-do>

<supporting-info>

## 触发场景与按需加载

AI 应根据当前任务选择阅读相关文档：

| 场景 | 必须检查的文档 |
|------|-------------|
| Controller/Service 编写 | `docs/nestjs-di.md` + `docs/service-patterns.md` |
| Prisma schema 变更 | `docs/prisma-rules.md` |
| 权限检查 | `docs/permission-system.md` |
| 配置/环境变量 | `docs/config-management.md` |
| Façade 模式使用 | `docs/facade-pattern.md` |
| 审计日志 | `docs/audit-logging.md` |
| 任何后端反模式检查 | `docs/anti-patterns.md` |
| 提交前检查 | `docs/verify.md` |

## 核心基础设施（始终检查）

### 1. NestJS DI（最常出错）

**禁止使用 `import type` 注入类：**

```typescript
// ❌ 错误 — import type 会剥离装饰器元数据，导致 DI 失败
import type { UsersService } from '../users/users.service';

// ✅ 正确
import { UsersService } from '../users/users.service';
```

**类注入使用 Token 打破循环依赖：**

```typescript
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_SERVICE) private readonly userService: IUserService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: IAuthProvider,
  ) {}
}
```

- `forwardRef` 已在 AuthModule 中移除，模块依赖为单向：AuthModule → UsersModule, CommonModule。
- 模块依赖必须保持单向 DAG。

### 2. Prisma 规范

**Migration 脚本：**
- 修改 `schema.prisma` 后，禁止仅执行 `db push`。
- 必须运行 `pnpm prisma migrate dev --name <描述你的变更>` 生成 migration 脚本。
- Migration 脚本必须提交到 Git。
- 部署前自动备份数据库到 `data/backups/`。

**枚举使用规则：**
- Prisma 枚举 `$Enums.FileStatus` 禁止直接用在 `@ApiProperty` 装饰器中。
- 必须使用本地枚举（`src/common/enums/`），并显式转换：
  ```typescript
  fileStatus: node.fileStatus as FileStatus,
  ```
- 自定义 ESLint 规则 `no-prisma-enum-in-api-property` 已强制执行此规则。

**Prisma v7 类型重命名：**
- v7 可能将 `ModelName` 重命名为 `ModelNameOmit`。`pnpm prisma generate` 后必须运行 `pnpm type-check` 验证。

### 3. Façade 模式（ADR 0002）

`FileSystemService` 已是 Façade — 仅供外部消费者使用（`library/`、`mxcad/`、`file-download/`）。

`FileSystemController` 直接注入子 Service：

| 子 Service | 职责 |
|-----------|------|
| `ProjectCrudService` | 项目 CRUD、文件夹、项目成员 |
| `FileOperationsService` | 文件操作（移动、复制、删除、更新） |
| `FileTreeService` | 树导航（子节点、节点查询、分类） |
| `FileDownloadExportService` | 下载、格式转换、文件访问检查 |
| `StorageInfoService` | 配额管理 |
| `ProjectMemberService` | 项目成员管理 |
| `SearchService` | 搜索功能 |

**规则：** 外部 API 消费者 → 走 Façade。Controller 内部逻辑 → 直接调用子 Service。

### 4. 权限系统

双层权限架构：

| 维度 | 装饰器 | 示例 |
|------|--------|------|
| 系统权限 | `@RequirePermissions()` | `@RequirePermissions(SystemPermission.SYSTEM_USER_MANAGE)` |
| 项目权限 | `@RequireProjectPermission()` | `@RequireProjectPermission(ProjectPermission.FILE_CREATE)` |
| 角色检查 | `@Roles()` | `@Roles('admin')` |

调用链：Controller → Guard → Service → Cache → DB

详细规则见 `docs/permission-system.md`。

### 5. 配置管理

三层配置体系：

| 层级 | 来源 | 用途 |
|------|------|------|
| 环境变量 | `process.env` | 部署时固定（JWT_SECRET、DATABASE_URL 等） |
| 运行时配置 | `RuntimeConfig`（DB） | 动态开关（注册开关、验证策略等），通过管理后台实时调整 |
| 部署配置 | `config-service` 包 | 多环境部署配置中心 |

**关键约定：**
- `jwt.secret` 来自 `JWT_SECRET` 环境变量 → 通过 `ConfigService.get('jwt.secret')` 读取。
- 禁止直接用 `'JWT_SECRET'` 作为 config key。

### 6. 审计日志

`AuditLogger`（继承 `ConsoleLogger`）全局拦截 `context='audit'` 的日志，自动写入数据库。

无需注入额外服务，只需调用：
```typescript
this.logger.log({
  action,       // 必填 — 操作类型
  resourceType, // 必填 — 资源类型
  resourceId,   // 可选
  userId,       // 必填
  success,      // 必填
  errorMessage, // 可选
  details,      // 可选
}, 'audit');
```

### 7. Express v5 注意事项

- `session.destroy()` 返回 `Promise<void>`（无 callback），直接 `await`。
- `session.save()` 返回 `Promise<void>`。
- `AuthenticatedRequest` 显式省略 `session`，需访问 Express 属性时 cast 为 `any`。

## 后端特有反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `import type { XService }` 用于 NestJS DI | `import { XService }` |
| Controller 写业务逻辑 | 逻辑放 Service，Controller 只做路由委托 |
| 外部消费者直接调用子 Service | 外部走 `FileSystemService` Façade |
| 修改 Prisma schema 后只执行 `db push` | 生成 migration 脚本并提交 |
| Prisma 枚举 `$Enums.X` 用在 `@ApiProperty` | 使用本地枚举 + 显式转换 |
| `console.log()` | 使用 NestJS Logger |
| `@Req()` / `@Res()` 直接使用 | 使用 DTO 和正确的返回类型 |
| 异步函数缺少错误处理 | 所有 async 函数包裹 try/catch 或使用异常过滤器 |
| 相关操作不使用事务 | 关联写操作必须包裹在 Prisma 事务中 |
| 硬编码可配置字符串 | 使用 `ConfigService` 或 `RuntimeConfig` |
| 循环依赖（模块 A ↔ 模块 B） | 单向依赖 DAG，必要时提取公共接口 |
| 审计关键操作不记录日志 | 通过 `this.logger.log({...}, 'audit')` 记录 |

## 测试

```bash
pnpm exec jest                    # 全部测试（timeout: 30s）
pnpm exec jest -- --testPathPattern="auth"  # 特定套件
pnpm test:permission              # 权限测试
pnpm test:permission:scenarios    # 权限场景测试
```

**覆盖率阈值（按文件强制执行）：**
- P0 (80%): `auth.service.ts`, `permission.service.ts`
- P1 (70%): `file-system.service.ts`, `role-inheritance.service.ts`, `file-validation.service.ts`, `file-system-permission.service.ts`

**配置：** `clearMocks`, `restoreMocks`, `resetMocks` 全为 true。`detectOpenHandles: true`, `forceExit: true`。

## 文档引用

- 公共编码规范：加载 `project-coding-standards` Skill
- 领域术语：`CONTEXT.md`
- ADR 0002 — FileSystemService Façade：`docs/adr/0002-decouple-file-operations-module.md`
- ADR 0003 — IPermissionStore 策略模式：`docs/adr/0003-permission-store-strategy-pattern.md`
- 后端详细规范：`packages/backend/CLAUDE.md`
- TypeScript 配置：`tsconfig.json` — `strictNullChecks: false`, `noImplicitAny: false`

## 注意事项

- 此 Skill 的所有规则均为强制性
- 公共规则（复用优先、文件约定、重构原则、提交前检查）由 `project-coding-standards` Skill 统一管理，此处不重复
- Biome 的 `organizeImports` 会自动将 NestJS DI 需要的 import 变为 `import type` — 执行后必须手动检查并还原
- `ConvertServerFileParam` 使用 **camelCase**（`srcPath`、`fileHash`、`nodeId`、`createPreloadingData`），不是 snake_case

</supporting-info>