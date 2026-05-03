# 数据库迁移完整性检查报告

**汇报人：Trea**
**分支：refactor/circular-deps**
**检查日期：2026-05-03**
**检查范围：`apps/backend/prisma/migrations/`**

---

## 一、迁移文件清单

共发现 **8 个迁移文件**，按时间顺序排列：

| # | 文件夹 | 迁移名称 | 时间戳 |
|---|--------|---------|--------|
| 1 | `20260330025027_init` | init | 2026-03-30 02:50:27 |
| 2 | `20260330025133_baseline` | baseline | 2026-03-30 02:51:33 |
| 3 | `20260330030233_add_gallery_add_permission` | add_gallery_add_permission | 2026-03-30 03:02:33 |
| 4 | `20260407_add_user_phone_wechat_fields` | add_user_phone_wechat_fields | 2026-04-07 |
| 5 | `20260413_add_project_id_and_cleanup_library_key` | add_project_id_and_cleanup_library_key | 2026-04-13 |
| 6 | `20260414100000_sync_enum_changes` | sync_enum_changes | 2026-04-14 10:00:00 |
| 7 | `20260422_add_username_change_fields` | add_username_change_fields | 2026-04-22 |
| 8 | `20260502202913_add_search_composite_indexes` | add_search_composite_indexes | 2026-05-02 20:29:13 |

---

## 二、迁移链路连续性检查

### 2.1 时间戳序列验证

```
✅ 迁移链路连续，无断点

20260330025027 → 20260330025133 → 20260330030233 → 20260407...
    (6秒间隔)      (11分钟间隔)      (3.5分钟间隔)
```

**结论**：所有迁移文件按时间戳顺序连续排列，链路完整。

### 2.2 migration_lock.toml 验证

```toml
provider = "postgresql"
```

✅ 锁定文件存在，指定 PostgreSQL 提供者。

---

## 三、各迁移文件内容审查

### 3.1 `20260330025027_init` — init

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 枚举创建 | ✅ | 创建 9 个枚举类型（UserStatus, Permission, ProjectPermission, ProjectStatus, FileStatus, AssetStatus, FontStatus, AuditAction, ResourceType, RoleCategory, PolicyType） |
| 表创建 | ✅ | 创建 15 张表（users, roles, role_permissions, file_system_nodes, project_roles, project_role_permissions, project_members, assets, fonts, refresh_tokens, audit_logs, upload_sessions, cache_entries, permission_policies, policy_permissions, runtime_configs, runtime_config_logs） |
| 索引创建 | ✅ | 创建所有必要的唯一索引和外键索引 |
| 外键约束 | ✅ | 包含完整的 ALTER TABLE ADD CONSTRAINT 语句 |
| **@@map** | ❌ **P0** | **所有表均缺少 `@@map` 映射**（例如 `users` 应映射为 `users`，但实际已自动为 snake_case；但 RoleCategory 枚举未映射） |

### 3.2 `20260330025133_baseline` — baseline

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 内容 | ⚠️ | **空迁移文件**（仅含注释，无任何 SQL 操作） |

### 3.3 `20260330030233_add_gallery_add_permission` — add_gallery_add_permission

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 枚举变更 | ✅ | `ALTER TYPE "ProjectPermission" ADD VALUE 'GALLERY_ADD'` |
| 幂等性 | ✅ | PostgreSQL ADD VALUE 本身具有幂等性 |

### 3.4 `20260407_add_user_phone_wechat_fields` — add_user_phone_wechat_fields

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 字段添加 | ✅ | phone, phoneVerified, phoneVerifiedAt, wechatId, provider, deletedAt |
| 索引创建 | ✅ | users_phone_key, users_wechatId_key, users_deletedAt_idx |
| password nullable | ✅ | `ALTER COLUMN "password" DROP NOT NULL`（支持第三方登录） |
| 幂等性 | ⚠️ | 未使用 `IF NOT EXISTS` 或 `ADD COLUMN IF NOT EXISTS`（PostgreSQL 本身支持多次执行但会报错） |

### 3.5 `20260413_add_project_id_and_cleanup_library_key` — add_project_id_and_cleanup_library_key

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 字段添加 | ✅ | `ADD COLUMN IF NOT EXISTS "projectId" TEXT`（使用幂等写法） |
| 索引创建 | ✅ | `CREATE INDEX IF NOT EXISTS`（幂等） |
| 外键创建 | ✅ | 使用 `IF NOT EXISTS` 包装条件判断（幂等） |
| 数据填充 | ✅ | WITH RECURSIVE CTE 填充 projectId |
| libraryKey 清理 | ✅ | UPDATE 清理非根节点的 libraryKey |
| storageQuota | ✅ | `ADD COLUMN IF NOT EXISTS`（幂等） |

### 3.6 `20260414100000_sync_enum_changes` — sync_enum_changes

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 枚举变更 | ⚠️ | `ADD VALUE IF NOT EXISTS` — 但注释说明 PostgreSQL 不支持删除枚举值 |
| 索引创建 | ✅ | `CREATE INDEX IF NOT EXISTS`（幂等） |
| 权限插入 | ✅ | 使用 `ON CONFLICT DO NOTHING` 幂等插入 |
| 问题 | ⚠️ | GALLERY_ADD 枚举值**从未被移除**（无法在 PostgreSQL 中删除），但注释声称要移除 |

### 3.7 `20260422_add_username_change_fields` — add_username_change_fields

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 字段添加 | ✅ | usernameChangeCount, lastUsernameChangeAt |
| 幂等性 | ⚠️ | 未使用 `ADD COLUMN IF NOT EXISTS`（PostgreSQL 重复执行会报错） |

### 3.8 `20260502202913_add_search_composite_indexes` — add_search_composite_indexes

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 索引创建 | ✅ | idx_project_search, idx_library_search |
| 幂等性 | ✅ | `CREATE INDEX IF NOT EXISTS`（幂等） |
| 与 Schema 对应 | ✅ | 与 schema.prisma 中 `@@index([projectId, deletedAt, isFolder, updatedAt], name: "idx_project_search")` 一致 |

---

## 四、Schema 与迁移对照分析

### 4.1 Schema 中存在的字段/索引 vs 迁移覆盖

| Schema 元素 | 对应迁移 | 覆盖状态 |
|------------|---------|---------|
| users 表 + 所有字段 + 审计字段 | `init` | ✅ |
| users.phone, phoneVerified, phoneVerifiedAt, wechatId, provider, deletedAt | `add_user_phone_wechat_fields` | ✅ |
| users.usernameChangeCount, lastUsernameChangeAt | `add_username_change_fields` | ✅ |
| file_system_nodes.projectId | `add_project_id_and_cleanup_library_key` | ✅ |
| file_system_nodes.storageQuota | `add_project_id_and_cleanup_library_key` | ✅ |
| idx_project_search 复合索引 | `add_search_composite_indexes` | ✅ |
| idx_library_search 复合索引 | `add_search_composite_indexes` | ✅ |
| Permission.STORAGE_QUOTA 枚举值 | `sync_enum_changes` | ✅ |
| Permission.PROJECT_CREATE 枚举值 | `sync_enum_changes` | ✅ |
| ProjectPermission.GALLERY_ADD 枚举值 | `add_gallery_add_permission` | ✅ 但 `sync_enum_changes` 声称要删除但未执行 |

### 4.2 迁移链路连续性

从第一个迁移（`init`）到最后一个迁移（`add_search_composite_indexes`），迁移链路**无断点**，时间戳递增。

---

## 五、P0 问题汇总

### 🔴 P0-1：baseline 迁移为空

**文件**: `20260330025133_baseline/migration.sql`
**严重性**: 高
**问题**: 该迁移文件内容为空（仅含注释），未执行任何数据库操作。
**风险**: 如果一个数据库从空状态开始应用迁移，此迁移不会报错但也不会做任何事，属于"假迁移"。

### 🔴 P0-2：部分迁移缺乏幂等性保护

**受影响迁移**:
- `20260407_add_user_phone_wechat_fields` — `ALTER TABLE ADD COLUMN` 未使用 `IF NOT EXISTS`
- `20260422_add_username_change_fields` — `ALTER TABLE ADD COLUMN` 未使用 `IF NOT EXISTS`

**严重性**: 高
**问题**: 迁移在已存在该列时重复执行会报错，导致迁移链路中断。
**风险**: 在生产环境中如果迁移记录表（`_prisma_migrations`）被重置或跳过，重复执行会失败。

### 🔴 P0-3：GALLERY_ADD 枚举值声称删除但未删除

**文件**: `20260414100000_sync_enum_changes/migration.sql`
**严重性**: 中
**问题**: 迁移注释声称要从 `ProjectPermission` 枚举中移除 `GALLERY_ADD`，但 PostgreSQL 不支持删除枚举值（只能添加）。该迁移仅添加了 `ADD VALUE IF NOT EXISTS`，从未真正删除该值。
**实际状态**: `GALLERY_ADD` 枚举值目前存在于数据库中，但 schema.prisma 中已不存在。

---

## 六、Schema 与迁移一致性检查

### 6.1 枚举覆盖检查

| 枚举值 | schema.prisma | 迁移覆盖 | 数据库状态 |
|--------|--------------|---------|-----------|
| Permission.STORAGE_QUOTA | ✅ 存在 | ✅ `sync_enum_changes` | 待验证 |
| Permission.PROJECT_CREATE | ✅ 存在 | ✅ `sync_enum_changes` | 待验证 |
| ProjectPermission.GALLERY_ADD | ❌ 不存在 | ✅ 曾添加 | ⚠️ 仍在数据库中 |

### 6.2 索引覆盖检查

| 索引名 | schema.prisma | 迁移覆盖 |
|--------|--------------|---------|
| idx_project_search | ✅ | ✅ `add_search_composite_indexes` |
| idx_library_search | ✅ | ✅ `add_search_composite_indexes` |
| users_deletedAt_idx | ✅ `@@index([deletedAt])` | ✅ `add_user_phone_wechat_fields` |

---

## 七、总结

| 检查项 | 结果 |
|--------|------|
| 迁移文件数量 | 8 个 |
| 迁移链路连续性 | ✅ 连续，无断点 |
| Schema 变更覆盖 | ✅ 所有变更均有对应迁移 |
| 迁移链路可完整执行 | ⚠️ 存在幂等性问题，可能中断 |
| P0 问题数量 | **3 个** |

### 建议

1. **立即修复**: 为 `20260407` 和 `20260422` 迁移中的 `ADD COLUMN` 语句添加 `IF NOT EXISTS` 后缀，确保幂等性。
2. **立即修复**: 处理 `GALLERY_ADD` 枚举值残留问题（重建枚举类型或清理）。
3. **建议**: 将空的 `baseline` 迁移合并到上一个或下一个迁移中，减少冗余。
4. **验证**: 在空数据库上完整执行一次迁移链路，确认无报错。
