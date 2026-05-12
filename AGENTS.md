# AGENTS.md — 项目规范和技能索引

所有 agent 在处理本项目时必须遵守以下规范。

---

## 项目技能

以下三个是**主技能**（入口）。AI 在对应领域工作时必须加载，Skill 内部按需引导到具体文档/示例/原技能。原有 8 个技能已作为子文档整合进这三个主技能中。

| 技能 | 触发条件 | 核心理念 |
|------|----------|----------|
| **project-coding-standards** | 任何代码生成、新建文件、重构、提交前检查 | 全栈公共规范：复用优先、文件组织、反模式清单、工作流约束 |
| **frontend-coding-standards** | 编写 React 组件、样式、前端页面、API 调用、或任何 `packages/frontend` 代码变更 | 前端专属：主题系统、Z-Index 层级、组件复用、API 契约。自动引用公共规范 |
| **backend-coding-standards** | 编写 NestJS service/controller、Prisma 变更、权限逻辑、或任何 `packages/backend` 代码变更 | 后端专属：NestJS DI、Prisma 迁移/枚举、Façade 模式、审计日志。自动引用公共规范 |

### 整合说明

原有 8 个技能（`api-contracts`、`permission-system`、`nestjs-circular-dependency`、`prisma-database`、`config-management`、`decompose`、`verify`、`issue`）已作为**子文档**按领域归属整合。AI 加载主技能后根据具体场景自主选择阅读相关文档：

- 前端主技能内包含：`api-contracts`、`permission-system`、`verify` 的前端子集
- 后端主技能内包含：`nestjs-circular-dependency`、`prisma-database`、`config-management`、`verify` 的后端子集
- 公共主技能内包含：`decompose`、跨领域规则

## 规范速查

| 规范 | 位置 |
|------|------|
| 全栈编码规范 | `.agents/skills/project-coding-standards/SKILL.md` — 复用优先、文件组织、反模式 |
| 前端编码规范 | `.agents/skills/frontend-coding-standards/SKILL.md` — 主题、Z-Index、组件复用、API 契约 |
| 后端编码规范 | `.agents/skills/backend-coding-standards/SKILL.md` — NestJS DI、Prisma、Façade、审计日志 |
| 领域术语 | `CONTEXT.md` |
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

<!-- lean-ctx -->
## lean-ctx

Prefer lean-ctx MCP tools over native equivalents for token savings.
Full rules: @LEAN-CTX.md
<!-- /lean-ctx -->
