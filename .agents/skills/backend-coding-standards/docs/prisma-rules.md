# Prisma 规范

修改 `schema.prisma` 或编写数据库相关代码时必须遵守的规则。

## Migration 工作流

### ❌ 禁止的操作

```
# 禁止：修改 schema.prisma 后只执行 db push
pnpm prisma db push
```

`db push` 不生成 migration 脚本，生产环境无法追踪变更历史。**仅限本地实验性开发使用。**

### ✅ 正确的流程

```bash
# 1. 修改 schema.prisma
# 2. 生成 migration 脚本
pnpm prisma migrate dev --name <用下划线描述你的变更>
# 示例：pnpm prisma migrate dev --name add_user_phone_field

# 3. 检查生成的 migration SQL
# 位于 packages/backend/prisma/migrations/<timestamp>_<name>/migration.sql

# 4. 提交 migration 文件夹到 Git
git add packages/backend/prisma/migrations/

# 5. 部署时 CI 自动执行
# pnpm prisma migrate deploy
```

## 枚举使用规则

### ❌ 错误：Prisma 枚举用在 @ApiProperty

```typescript
import { $Enums } from '@prisma/client';

export class FileDto {
  @ApiProperty({ enum: $Enums.FileStatus })  // ❌ 禁止
  fileStatus: $Enums.FileStatus;
}
```

### ✅ 正确：使用本地枚举 + 显式转换

```typescript
import { FileStatus } from '../common/enums/file-status.enum';

export class FileDto {
  @ApiProperty({ enum: FileStatus })  // ✅ 使用本地枚举
  fileStatus: FileStatus;
}

// 在 Service 中显式转换
fileStatus: node.fileStatus as FileStatus,
```

自定义 ESLint 规则 `no-prisma-enum-in-api-property` 已强制执行此规则。

## Prisma v7 类型重命名

Prisma v7 可能将模型类型从 `FileSystemNode` 重命名为 `FileSystemNodeOmit`（当模型有特定关系时）。

```bash
# 每次生成 Prisma client 后必须验证
pnpm prisma generate
pnpm type-check  # 检查是否有类型错误
```

## 事务要求

关联写操作必须包裹在 Prisma 事务中：

```typescript
// ✅ 正确
await this.prisma.$transaction(async (tx) => {
  const node = await tx.fileSystemNode.create({ data: {...} });
  await tx.versionRecord.create({ data: { nodeId: node.id, ... } });
});
```

```typescript
// ❌ 错误 — 两个操作不在同一事务中
const node = await this.prisma.fileSystemNode.create({ data: {...} });
await this.prisma.versionRecord.create({ data: { nodeId: node.id, ... } });
// 如果第二个操作失败，第一个已写入，数据不一致
```

## 破坏性变更

对于可能导致数据丢失的变更（字段重命名、类型变更等）：
- 先加新字段，同步数据，再删旧字段（分版本发布）
- 编写自定义 SQL 迁移脚本处理数据迁移
- 遵循向后兼容原则

## 部署备份

部署时会自动备份数据库到 `data/backups/`。但手动操作前也应备份：

```bash
pg_dump ... > data/backups/manual_$(date +%Y%m%d_%H%M%S).sql
```

## 快速检查

修改 schema.prisma 后：
- [ ] 运行了 `pnpm prisma migrate dev --name <description>`
- [ ] Migration SQL 内容正确
- [ ] Migration 文件夹已提交到 Git
- [ ] 运行了 `pnpm type-check`（检查 Prisma v7 类型重命名）
- [ ] 如有枚举字段，使用的是本地枚举而非 Prisma 枚举
- [ ] 关联写操作包裹在事务中
