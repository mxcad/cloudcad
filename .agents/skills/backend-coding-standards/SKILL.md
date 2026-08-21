---
name: backend-coding-standards
description: 后端编码规范 — NestJS DI 注意事项、Prisma 迁移/枚举规则、Façade 模式、审计日志、权限检查、配置管理。触发条件：编写 NestJS service/controller、Prisma schema 变更、权限逻辑、后端 API 或任何 packages/backend 下的代码变更。自动引用 project-coding-standards 的公共规范。
---

<what-to-do>

处理后端代码时，遵守以下规则。同时遵守 `project-coding-standards` 的全部公共规则。

**核心原则**：Controller 只做路由委托，业务逻辑放 Service。

</what-to-do>

<supporting-info>

## 场景文档索引

| 场景 | 必读文档 |
|------|----------|
| Controller/Service 编写 | [`docs/nestjs-di.md`](docs/nestjs-di.md) + [`docs/service-patterns.md`](docs/service-patterns.md) |
| Controller 参数声明（Swagger/SDK 契约） | [`docs/api-contract-declaration.md`](docs/api-contract-declaration.md) + 审计 `pnpm scan:undeclared-params` |
| Prisma schema 变更 | [`docs/prisma-rules.md`](docs/prisma-rules.md) |
| 权限检查 | [`docs/permission-system.md`](docs/permission-system.md) |
| 配置/环境变量 | [`docs/config-management.md`](docs/config-management.md) |
| Façade 模式 | [`docs/facade-pattern.md`](docs/facade-pattern.md) |
| 审计日志 | [`docs/audit-logging.md`](docs/audit-logging.md) |
| Express v5 兼容 | [`docs/express-v5.md`](docs/express-v5.md) |
| TypeScript 配置 | [`docs/typescript-config.md`](docs/typescript-config.md) |
| 类型获取 | ADR-0026（扩展机制总纲·类型获取规则）+ ADR-0027（@cloudcad/db）+ [`docs/type-acquisition.md`](docs/type-acquisition.md) |
| 后端 i18n | [`docs/backend-i18n.md`](docs/backend-i18n.md) |
| 格式化（Prettier） | [`docs/biome-formatting.md`](docs/biome-formatting.md) |
| 提交前检查 | [`docs/verify.md`](docs/verify.md) |
| 模块依赖分层 | ADR-0007（三层依赖约束） |
| strictNullChecks | ADR-0008（增量开启策略） |
| 接口抽象决策 | ADR-0020 + `backend-coding-standards/docs/service-patterns.md` |
| 可替换模块设计 | 加载 `replaceable-module` Skill |

## 关键陷阱（快速检查）

- **禁止 `import type` 注入类** — 装饰器元数据被 strip，DI 失败
- **Biome 的 `organizeImports`** 自动将 DI import 变为 `import type`，执行后手动还原
- **Prisma 更新后跑 `pnpm prisma generate` + `pnpm type-check`** — v7 可能重命名类型为 `ModelNameOmit`
- **数据层类型禁 `import from '@prisma/client'`** — 一律从 `@cloudcad/db` 获取（`PrismaClient`/模型/枚举/`Prisma` namespace），schema 单一源在 `packages/db/prisma/schema.prisma`
- **HTTP DTO 不手动定义** — 由 backend DTO → Swagger → `@cloudcad/api-sdk` 自动生成；contracts 只放纯 interface 业务契约，不得重复定义 HTTP DTO
- **接口方法不得 `any`** — 数据适配器接口返回 `@cloudcad/db` 的 Prisma 类型（`IDatabaseService = PrismaClient`）
- **Controller 只做路由委托** — 业务逻辑放 Service
- **Controller 直接 return payload** — 禁止手包 `{ message, data }`：全局 `ResponseInterceptor` 已统一包装 `{ code, message, data, timestamp }`，手包会形成 data 双层嵌套，前端 responseTransformer 只解包一层导致数据解析不到（详见 `docs/anti-patterns.md` 响应格式反模式）
- **Express v5**：`session.destroy()` / `session.save()` 返回 `Promise<void>`，直接 `await`
- **`ConvertServerFileParam` 使用 camelCase**（`srcPath`，不是 `srcpath`）
- **读取 `req.params`/`req.query` 必须显式声明 `@Param`/`@Query`** — 否则 Swagger/SDK 生成 `path?: never`，前端无法走 SDK（被迫手拼 URL/fetch，ADR-0034 治理的根源）；可选参数还要配 `@ApiQuery({ required: false })` 纠正 required 推断。提交前跑 `pnpm scan:undeclared-params`（详见 `docs/api-contract-declaration.md`）

## 反模式清单

详见 [`docs/anti-patterns.md`](docs/anti-patterns.md)。关键条目：
- `import type` 用于 DI → 用 `import`
- Controller 写业务逻辑 → 放 Service
- 外部消费者直接调子 Service → 走 `FileSystemService` Façade
- Prisma schema 修改后 `db push` → 生成 migration 脚本并提交
- `console.log()` → 使用 NestJS Logger
- 审计关键操作不记录 → `this.logger.log({...}, 'audit')`
- **模块健康**：新建模块前三问（消费者/测试/最小文件数）；无消费者代码删或标注；未激活模块必须 JSDoc 标注 + 登记 issue；迁移（expand-contract）必须排收尾票禁双轨；防孤儿模块详见 `docs/anti-patterns.md`「模块健康反模式」

## 测试

```bash
pnpm exec jest                    # 全部测试（timeout: 30s）
pnpm test:permission              # 权限测试
pnpm test:unit                    # 单元测试（默认语义，无 DB 可跑）
pnpm test:integration             # 集成测试（需 DB，串行）
```

Config: `clearMocks`+`restoreMocks`+`resetMocks` 全 true。
覆盖阈值：P0 80%（auth.service, permission.service），P1 70%。

</supporting-info>
