# AGENTS.md — 项目规范和技能索引

所有 agent 在处理本项目时必须遵守以下规范。

---

## 项目技能

以下技能位于 `.agents/skills/`，通过软链接映射到 `.claude/skills/`。**遇到对应场景时必须触发。**

| 技能 | 触发条件 | 核心规则 |
|------|----------|----------|
| **api-contracts** | 类型缺失、DTO 找不到、`has no exported member`、`is not a function` | 先查后端 DTO 的 `@ApiProperty`，禁止前端本地定义类型 |
| **permission-system** | 权限检查、角色管理、权限装饰器、`@RequirePermissions` | 双层权限架构（系统+项目），严格调用链 Controller→Guard→Service→Cache→DB |
| **nestjs-circular-dependency** | `Circular dependency`、`forwardRef`、模块相互导入 | 模块依赖单向 DAG，数据库关系可双向 |
| **prisma-database** | 修改 `schema.prisma`、添加/删除字段、迁移脚本 | 迁移脚本必提交、部署前备份、破坏性变更分版本 |
| **config-management** | 添加环境变量、修改配置项、`process.env` | 三层配置体系：环境变量 → 运行时配置 → 部署配置中心 |
| **decompose** | 大型重构、5+文件改动、需要并发 agent | grill → plan → 拆独立任务文档 → 并发派发 → 汇总汇报 |
| **verify** | 提交前、PR 前 | lint → format → type-check → test |
| **issue** | 创建/管理 GitHub Issues | `/issue` |

## 规范速查

| 规范 | 位置 |
|------|------|
| API 契约 | `.claude/skills/api-contracts/SKILL.md` |
| 任务分解 | `.claude/skills/decompose/SKILL.md` |
| Prisma 迁移 | 见下方 |
| 前端编码 | `packages/frontend/CLAUDE.md` |
| 后端编码 | `packages/backend/CLAUDE.md` |
| 全局规范 | `CLAUDE.md` |

---

### 数据库迁移规范 (Prisma)

**核心原则：生产环境必须使用 Migration 脚本，禁止使用 `db push` 进行部署。**

1. **开发阶段**：
   - ❌ **禁止**：修改 `schema.prisma` 后仅依赖 `db push`。
   - ✅ **必须**：运行 `pnpm prisma migrate dev --name <描述你的变更>`。
   - 这会在 `packages/backend/prisma/migrations/` 下生成一个带时间戳的文件夹，里面包含 `migration.sql`。
   - **必须**将 `migrations/` 文件夹提交到 Git。

2. **部署阶段**：
   - 部署脚本会自动执行 `prisma migrate deploy`。
   - 系统会自动检测并应用未执行过的迁移脚本。
   - 部署前会自动备份数据库到 `data/backups/`。

3. **破坏性变更**：
   - 对于字段重命名、类型变更等可能导致数据丢失的操作，必须编写自定义 SQL 迁移脚本。
   - 遵循"向后兼容"原则：先加新字段，同步数据，再删旧字段（分版本发布）。

---