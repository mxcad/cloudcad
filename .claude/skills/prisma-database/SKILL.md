---
name: prisma-database
description: '涉及数据库结构变更时必须触发此技能——修改 schema.prisma、添加/删除模型或字段、编写迁移脚本、处理 Prisma Client 错误等。确保数据库变更安全且可回滚。'
---

# Prisma 数据库技能

> **触发条件**：当涉及数据库结构变更时，必须触发此技能

## 触发场景清单

| 场景 | 示例 |
|------|------|
| 修改 `schema.prisma` | 添加/删除模型、字段、关系 |
| 生成迁移脚本 | 运行 `prisma migrate dev` |
| 编写自定义 SQL | 数据迁移、字段重命名 |
| 处理 Prisma 错误 | P2002 (唯一约束)、P2025 (记录不存在) |
| 优化查询性能 | 添加索引、修改关联查询 |
| 数据库部署 | 覆盖部署时的数据库升级 |

---

## 核心原则

### 1. 生产环境必须使用 Migration 脚本

**为什么？**
- `db push` 是开发工具，通过"猜测"同步数据库结构，无法区分"字段重命名"和"删除旧字段+创建新字段"，**极易导致数据丢失**。
- `migrate deploy` 是生产工具，严格按照开发者编写的 SQL 脚本执行，**精准可控**。

**开发工作流**：

```
Step 1: 修改 schema.prisma
   ↓
Step 2: 生成迁移文件 (必须!)
   ↓
Step 3: 检查并编辑 migration.sql
   ↓
Step 4: 提交代码 (包含 migrations/ 目录)
   ↓
Step 5: 部署时自动执行 migrate deploy
```

**具体命令**：

```bash
# ✅ 正确 - 修改 schema.prisma 后生成迁移文件
pnpm prisma migrate dev --name add_user_wechat_id

# ❌ 错误 - 仅使用 db push (只允许本地快速原型测试)
pnpm prisma db push
```

**生成的文件位置**：
```
packages/backend/prisma/migrations/
└── 20260403120000_add_user_wechat_id/
    └── migration.sql  ← 必须检查此文件!
```

**Git 提交要求**：
- ✅ **必须**将 `migrations/` 文件夹提交到 Git
- ✅ **必须**检查生成的 `migration.sql` 是否符合预期
- ❌ **禁止**忽略或删除迁移文件

---

### 2. 部署流程自动化

项目已实现数据库迁移自动化，部署脚本会：

1. **自动备份数据库** → `data/backups/db_backup_时间戳.sql`
2. **自动执行迁移** → `prisma migrate deploy`
3. **自动记录版本** → `_prisma_migrations` 表

**用户无需手动运行任何命令**，只需解压新部署包并运行 `start.bat`。

**备份恢复方法**（如果出问题）：
```bash
# Windows
.\runtime\windows\postgresql\pgsql\bin\psql.exe -U postgres -d cloudcad -f data\backups\db_backup_xxx.sql

# Linux
./runtime/linux/postgres/bin/psql -U postgres -d cloudcad -f data/backups/db_backup_xxx.sql
```

---

### 3. 破坏性变更的安全策略

**什么是破坏性变更？**
- 字段重命名（`name` → `fullName`）
- 字段类型变更（`String` → `Int`）
- 删除字段或表
- 修改唯一约束

**为什么危险？**
Prisma 无法理解你的"意图"，它只会机械地执行结构同步。例如重命名字段，Prisma 会：
1. 删除旧列（**数据丢失!**）
2. 创建新列（**空的!**）

**安全策略：分版本发布**

以"字段重命名"为例（`name` → `fullName`）：

#### 版本 A（过渡版）

```prisma
model User {
  name     String?  // 保留旧字段，标记为废弃
  fullName String?  // 新增字段
}
```

**代码兼容**：
```typescript
// 写入时同时写两个字段
await prisma.user.create({
  data: {
    name: '张三',      // 旧字段，兼容旧代码
    fullName: '张三',  // 新字段
  }
});

// 读取时优先用新字段，降级到旧字段
const user = await prisma.user.findUnique({ where: { id } });
const displayName = user.fullName || user.name;
```

**发布版本 A**，用户覆盖部署。此时数据库两个字段都有数据。

#### 版本 B（清理版）

**第一步：数据迁移**（编写自定义 SQL）

```sql
-- migration.sql
-- 将旧字段的剩余数据复制到新字段
UPDATE "users" SET "fullName" = "name" WHERE "fullName" IS NULL AND "name" IS NOT NULL;
```

**第二步：删除旧字段**

```prisma
model User {
  fullName String  // 只保留新字段
}
```

**发布版本 B**，用户覆盖部署。

---

## 开发工作流详解

### 场景 1：添加新字段

```bash
# 1. 修改 schema.prisma
model User {
  wechatId String? @unique  // 新增字段
}

# 2. 生成迁移文件
pnpm prisma migrate dev --name add_user_wechat_id

# 3. 检查生成的 migration.sql
cat packages/backend/prisma/migrations/*/migration.sql
# 应该看到: ALTER TABLE "users" ADD COLUMN "wechatId" TEXT;

# 4. 提交代码
git add packages/backend/prisma/migrations/
git commit -m "feat(user): add wechatId field for WeChat login"
```

**部署时**：脚本自动执行，无需干预。

---

### 场景 2：添加新表

```bash
# 1. 修改 schema.prisma
model AuditLog {
  id        String   @id @default(cuid())
  action    String
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}

# 2. 生成迁移文件
pnpm prisma migrate dev --name add_audit_log_table

# 3. 检查 migration.sql
# 应该看到: CREATE TABLE "audit_logs" (...)
# 以及: CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
```

---

### 场景 3：添加索引

```bash
# 1. 修改 schema.prisma
model User {
  email String? @unique

  @@index([email])  // 新增索引
}

# 2. 生成迁移文件
pnpm prisma migrate dev --name add_user_email_index
```

---

### 场景 4：字段重命名（破坏性变更）

**参考"核心原则 3"的分版本发布策略**。

**如果需要一次性完成（不推荐，仅限开发环境）**：

```bash
# 1. 修改 schema.prisma（直接改名）
model User {
  fullName String  # 原来是 name
}

# 2. 生成迁移文件
pnpm prisma migrate dev --name rename_user_name_to_fullName

# 3. ⚠️ 手动编辑 migration.sql，添加数据迁移
# 在 ALTER TABLE 之前添加:
# UPDATE "users" SET "fullName" = "name" WHERE "name" IS NOT NULL;
```

**注意**：这种方式在生产环境有风险，仅在确认数据量小、影响范围可控时使用。

---

## Prisma Client 使用规范

### 4.1 基本 CRUD

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 创建
const user = await prisma.user.create({
  data: {
    username: 'admin',
    email: 'admin@example.com',
    password: hashedPassword,
    roleId: 'role-123',
  },
});

// 查询
const user = await prisma.user.findUnique({
  where: { id: 'user-123' },
  include: { role: true },  // 关联查询
});

// 更新
await prisma.user.update({
  where: { id: 'user-123' },
  data: { email: 'new@example.com' },
});

// 删除
await prisma.user.delete({
  where: { id: 'user-123' },
});
```

### 4.2 批量操作

```typescript
// 批量创建
await prisma.user.createMany({
  data: [
    { username: 'user1', email: 'user1@example.com' },
    { username: 'user2', email: 'user2@example.com' },
  ],
  skipDuplicates: true,  // 跳过重复（唯一约束冲突）
});

// 批量更新
await prisma.user.updateMany({
  where: { status: 'INACTIVE' },
  data: { status: 'ACTIVE' },
});
```

### 4.3 事务

```typescript
// 隐式事务（自动）
await prisma.$transaction([
  prisma.user.create({ data: {...} }),
  prisma.auditLog.create({ data: {...} }),
]);

// 显式事务（需要手动控制）
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: {...} });
  await tx.auditLog.create({
    data: { action: 'CREATE_USER', userId: user.id },
  });
  return user;
});
```

---

## 常见 Prisma 错误及解决方案

### 错误 1：P2002 - 唯一约束冲突

**错误信息**：
```
Unique constraint failed on the fields: (`email`)
```

**原因**：尝试插入或更新重复的唯一值。

**解决方案**：
```typescript
// ✅ 使用 upsert（存在则更新，不存在则创建）
await prisma.user.upsert({
  where: { email: 'user@example.com' },
  update: { username: 'newname' },
  create: { username: 'newname', email: 'user@example.com' },
});

// ✅ 捕获异常并友好提示
try {
  await prisma.user.create({ data: { email } });
} catch (error) {
  if (error.code === 'P2002') {
    throw new BadRequestException('邮箱已被注册');
  }
  throw error;
}
```

---

### 错误 2：P2025 - 记录不存在

**错误信息**：
```
Record to update not found.
```

**原因**：尝试更新或删除不存在的记录。

**解决方案**：
```typescript
// ✅ 先检查是否存在
const user = await prisma.user.findUnique({ where: { id } });
if (!user) {
  throw new NotFoundException('用户不存在');
}
await prisma.user.update({ where: { id }, data: {...} });

// ✅ 使用 findFirstOrThrow 自动抛出异常
const user = await prisma.user.findFirstOrThrow({
  where: { id },
  rejectOnNotFound: true,
});
```

---

### 错误 3：N+1 查询问题

**问题**：循环中执行数据库查询，导致性能极差。

```typescript
// ❌ 错误 - N+1 查询
const users = await prisma.user.findMany();
for (const user of users) {
  const role = await prisma.role.findUnique({ where: { id: user.roleId } });
  console.log(role.name);
}

// ✅ 正确 - 使用 include 一次性加载关联数据
const users = await prisma.user.findMany({
  include: { role: true },
});
for (const user of users) {
  console.log(user.role.name);
}
```

---

## 检查清单

### 修改 schema.prisma 后

- [ ] 运行 `pnpm prisma migrate dev --name <描述>`
- [ ] 检查生成的 `migration.sql` 是否符合预期
- [ ] 对于破坏性变更，是否编写了自定义 SQL 迁移脚本
- [ ] 是否遵循"向后兼容"原则（先加新，再删旧）
- [ ] 将 `migrations/` 文件夹提交到 Git

### 部署前

- [ ] 确认迁移脚本已包含在部署包中
- [ ] 确认 `data/backups/` 目录存在（用于自动备份）
- [ ] 对于重大变更，是否准备了回滚方案

### 代码审查

- [ ] 是否使用 `include` 或 `select` 优化关联查询
- [ ] 是否使用 `createMany` / `updateMany` 优化批量操作
- [ ] 是否正确处理了 Prisma 错误（P2002、P2025 等）
- [ ] 是否避免了 N+1 查询问题

---

## 快速参考

| 操作 | 命令 |
|------|------|
| 生成迁移文件 | `pnpm prisma migrate dev --name <描述>` |
| 应用迁移（部署） | `pnpm prisma migrate deploy`（自动执行） |
| 重置数据库 | `pnpm prisma migrate reset`（仅开发环境） |
| 生成 Prisma Client | `pnpm prisma generate` |
| 打开数据库 GUI | `pnpm prisma studio` |
| 查看迁移状态 | `pnpm prisma migrate status` |

| 错误代码 | 含义 | 解决方案 |
|----------|------|----------|
| P2002 | 唯一约束冲突 | 使用 upsert 或捕获异常 |
| P2025 | 记录不存在 | 先检查是否存在，或使用 findFirstOrThrow |
| P1001 | 无法连接数据库 | 检查 .env 中的 DATABASE_URL |
| P1003 | 数据库不存在 | 先创建数据库 |

---

## 强制执行

**只要涉及数据库结构变更，AI 必须遵循此规范，不得例外。**

违反此规范的行为包括但不限于：
- 修改 `schema.prisma` 后未生成迁移文件
- 使用 `db push` 进行生产部署
- 未将 `migrations/` 文件夹提交到 Git
- 破坏性变更未编写自定义 SQL 迁移脚本
- 未遵循"向后兼容"原则导致数据丢失
