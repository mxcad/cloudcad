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