# 后端 — packages/backend

NestJS 11 API 服务（端口 3001），提供认证、文件系统、权限、计费、协同协调、存储抽象。

## 结构

```
packages/backend/
├── src/
│   ├── common/           # 共享 guards, interceptors, pipes, exceptions
│   ├── config/           # 配置模块
│   ├── [模块]/           # 各功能模块
│   ├── main.ts           # 入口
├── prisma/
│   └── migrations/       # migration 历史（schema 单一源在 packages/db/prisma/schema.prisma，ADR-0027）
```

> 数据库 schema 单一源在 `packages/db/prisma/schema.prisma`（@cloudcad/db，ADR-0027），
> migration 由本包执行（`pnpm prisma migrate dev`），Prisma Client 生成物由 @cloudcad/db 导出。

## 模块依赖

三层依赖方向约束（ADR-0007）：Layer1 基础设施 → Layer2 核心业务 → Layer3 业务编排，箭头方向不可逆。完整的模块-层级映射见 ADR-0007。

## 关键命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # nest build (SWC) + generate:swagger
pnpm test             # 单元测试（默认语义，无 DB 可跑）
pnpm test:unit        # 单元测试（与 pnpm test 同语义，显式别名）
pnpm test:integration # 集成测试（需真实 PG+Redis，串行执行）
pnpm test:permission  # 仅权限测试
pnpm type-check       # tsc --noEmit
pnpm verify           # check:fix → test → build
pnpm prisma generate  # 重新生成 Prisma Client
pnpm prisma migrate dev  # 创建迁移
pnpm db:seed          # 种子数据
```

## 关键说明

- **TypeScript strictNullChecks（ADR-0008）**：增量开启中。新接口文件（`*/interfaces/` 目录下）已单独开启。旧模块分批治理中。编写新代码时始终假设 `strictNullChecks: true`——对可能为 null/undefined 的值做显式检查（`?.`、`??`、`if (!x) throw`），不要依赖编译器的宽松模式。
- **可替换模块 vs 内部服务（ADR-0020）**：只有 OSS/Pro/Enterprise 确有不同实现的模块才使用「接口 + DI token」模式（auth、storage、conversion、email、sms、permission）。内部服务直接用 class-based DI。详见 `replaceable-module` 技能和 `backend-coding-standards/docs/service-patterns.md`。

- **DI**: `import { Service }` 而非 `import type`，否则装饰器元数据丢失
- **格式化**: Prettier（全仓统一，根目录 `.prettierrc`；后端无 Biome）
- **权限**: 见 `permission-system` 技能
- **审计日志**: `this.logger.log({ action, resourceType, userId }, 'audit')`
- **数据库**: PostgreSQL + Prisma，schema 变更必须走 migration
- **认证**: JWT（access token 1h / refresh token 7d）
- **协同**: WebSocket 端口 3091
- **MX 集成**: 通过 `mxVersionTool` 包进行版本控制
