# 数据库迁移策略分析

## 1. 迁移历史分析

### 1.1 迁移文件清单

| 迁移文件名 | 时间 | 变更类型 | 主要变更内容 |
|-----------|------|----------|-------------|
| `20260330025027_init` | 2026-03-30 | 初始创建 | 创建所有基础表和枚举类型 |
| `20260330025133_baseline` | 2026-03-30 | 基线标记 | 空迁移，用于标记基线 |
| `20260330030233_add_gallery_add_permission` | 2026-03-30 | 枚举扩展 | 向 ProjectPermission 枚举添加 `GALLERY_ADD` |
| `20260407_add_user_phone_wechat_fields` | 2026-04-07 | 表结构变更 | 用户表添加手机号、微信ID等字段，支持第三方登录 |
| `20260413_add_project_id_and_cleanup_library_key` | 2026-04-13 | 表结构变更 | 添加 projectId 字段并回填数据，清理非根节点的 libraryKey |
| `20260414100000_sync_enum_changes` | 2026-04-14 | 枚举同步 | 同步 db push 的枚举变更到正式迁移 |
| `20260422_add_username_change_fields` | 2026-04-22 | 表结构变更 | 添加用户名修改历史字段 |

### 1.2 各迁移详细分析

#### 1.2.1 初始迁移 (init)

**涉及的表：**
- `users` - 用户表（含 email、username、password、roleId 等核心字段）
- `roles` - 角色表（含层级关系）
- `role_permissions` - 角色权限关联表
- `file_system_nodes` - 文件系统节点表（核心业务表）
- `project_roles` - 项目角色表
- `project_role_permissions` - 项目角色权限表
- `project_members` - 项目成员表
- `assets` - 资源表
- `fonts` - 字体表
- `refresh_tokens` - 刷新令牌表
- `audit_logs` - 审计日志表
- `upload_sessions` - 上传会话表
- `cache_entries` - 缓存条目表
- `permission_policies` - 权限策略表
- `policy_permissions` - 策略权限表
- `runtime_configs` - 运行时配置表
- `runtime_config_logs` - 运行时配置日志表

**创建的枚举：**
- `UserStatus` (ACTIVE, INACTIVE, SUSPENDED)
- `Permission` - 系统权限枚举
- `ProjectPermission` - 项目权限枚举
- `ProjectStatus` (ACTIVE, ARCHIVED, DELETED)
- `FileStatus` (UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED)
- `AssetStatus`, `FontStatus`
- `AuditAction`, `ResourceType`, `RoleCategory`, `PolicyType`

#### 1.2.2 用户表扩展迁移 (add_user_phone_wechat_fields)

**变更内容：**
- 添加 `phone` 字段（唯一索引）
- 添加 `phoneVerified` 字段（默认 false）
- 添加 `phoneVerifiedAt` 字段
- 添加 `wechatId` 字段（唯一索引）
- 添加 `provider` 字段（默认 'LOCAL'）
- 添加 `deletedAt` 字段（软删除支持）
- 将 `password` 字段改为可空（支持第三方登录用户）

**影响分析：** 支持手机号登录、微信登录等第三方认证方式

#### 1.2.3 文件系统表扩展迁移 (add_project_id_and_cleanup_library_key)

**变更内容：**
- 添加 `projectId` 字段到 `file_system_nodes`
- 创建索引 `file_system_nodes_projectId_idx`
- 添加外键约束（自引用到 file_system_nodes.id）
- **数据回填**：通过递归 CTE 填充所有节点的 projectId
- **数据清理**：清除非根节点的 libraryKey

**风险评估：** 包含数据迁移操作，执行时间取决于数据量

#### 1.2.4 枚举同步迁移 (sync_enum_changes)

**变更内容：**
- 添加 `STORAGE_QUOTA` 权限到 Permission 枚举
- 添加 `PROJECT_CREATE` 权限到 Permission 枚举
- 为 ADMIN、USER_MANAGER 角色添加 STORAGE_QUOTA 权限
- 为 USER 角色添加 PROJECT_CREATE 权限

**注意事项：**
```sql
-- PostgreSQL 不支持直接删除枚举值
-- SYSTEM_TEMPLATE_READ 和 GALLERY_ADD 的移除仅记录但未实际执行
```

## 2. Seed 脚本分析

### 2.1 脚本位置
`apps/backend/prisma/seed.ts`

### 2.2 功能概述

**创建的系统角色：**

| 角色名 | 级别 | 权限描述 |
|--------|------|----------|
| ADMIN | 100 | 所有系统权限 |
| USER_MANAGER | 50 | 用户和角色管理权限 |
| FONT_MANAGER | 50 | 字体库管理权限 |
| USER | 0 | 基础用户权限（无系统权限） |

**创建的默认管理员：**
- 用户名：`admin`
- 邮箱：`admin@cloudcad.com`（可通过环境变量配置）
- 密码：`Admin@123`（可通过环境变量配置）

### 2.3 执行机制

脚本使用 `@prisma/adapter-pg` 直接连接数据库，支持幂等操作（检查是否已存在后再创建）。

### 2.4 环境变量配置

| 变量名 | 默认值 | 用途 |
|--------|--------|------|
| `ADMIN_EMAIL` | admin@cloudcad.com | 管理员邮箱 |
| `ADMIN_PASSWORD` | Admin@123 | 管理员密码 |
| `DB_HOST` | localhost | 数据库主机 |
| `DB_PORT` | 5432 | 数据库端口 |
| `DB_USERNAME` | postgres | 数据库用户名 |
| `DB_PASSWORD` | password | 数据库密码 |
| `DB_DATABASE` | cloudcad | 数据库名称 |

## 3. 测试环境数据库配置

### 3.1 全局测试设置

**文件位置：** `apps/backend/src/test/global-setup.ts`

**执行流程：**
1. 连接测试数据库
2. **清空所有表**（使用 `TRUNCATE TABLE ... CASCADE`）
3. 创建测试数据

**创建的测试用户：**

| 用户ID | 用户名 | 邮箱 | 角色 |
|--------|--------|------|------|
| 00000000-0000-0000-0000-000000000001 | admin | admin@test.com | ADMIN |
| 00000000-0000-0000-0000-000000000002 | user | user@test.com | USER |

### 3.2 Jest 配置

**文件位置：** `apps/backend/jest.config.ts`

**关键配置：**
- `setupFiles: ['dotenv/config']` - 加载环境变量
- `testTimeout: 30000` - 测试超时时间 30 秒
- `maxWorkers: '50%'` - 使用 50% CPU 核心
- `forceExit: true` - 强制退出

### 3.3 测试数据库连接

测试数据库通过 `DATABASE_URL` 环境变量配置，建议使用独立的测试数据库。

## 4. Schema 变更检查

### 4.1 当前 Schema 状态

通过 `prisma/schema.prisma` 与迁移历史对比，当前 Schema 已包含所有迁移的变更：

**当前 Schema 中的关键字段：**

| 表 | 字段 | 类型 | 说明 |
|----|------|------|------|
| users | phone | String? | 手机号（唯一） |
| users | wechatId | String? | 微信ID（唯一） |
| users | password | String? | 密码（可空） |
| users | lastUsernameChangeAt | DateTime? | 最后修改用户名时间 |
| users | usernameChangeCount | Int | 用户名修改次数 |
| file_system_nodes | projectId | String? | 所属项目ID |
| file_system_nodes | storageQuota | Int? | 存储配额 |

### 4.2 未生成迁移的变更

**检查结果：** ✅ 当前 Schema 与最新迁移保持一致，无未生成的迁移变更。

## 5. 数据修复脚本分析

### 5.1 现有脚本清单

| 脚本 | 位置 | 功能 |
|------|------|------|
| `ensure-libraries.ts` | scripts/ | 确保公共资源库存在（图纸库、图块库） |
| `audit-permissions.ts` | scripts/ | 审计系统角色和项目角色的权限配置 |

### 5.2 ensure-libraries.ts 分析

**功能：**
- 检查并创建公共图纸库（drawing）
- 检查并创建公共图块库（block）
- 支持恢复被软删除的库

**执行时机：** 系统初始化时或数据修复时

### 5.3 audit-permissions.ts 分析

**功能：**
- 检查系统角色权限与代码定义是否一致
- 检查项目角色权限与代码定义是否一致
- 输出详细审计报告和修复建议

**输出内容：**
- 每个角色的实际权限数
- 缺少的权限列表
- 多余的权限列表
- 自动生成修复 SQL

### 5.4 需要的数据修复脚本

根据迁移历史分析，以下场景需要数据修复脚本：

| 场景 | 描述 | 建议操作 |
|------|------|----------|
| 枚举值清理 | `SYSTEM_TEMPLATE_READ` 和 `GALLERY_ADD` 枚举值已从代码中移除但数据库中仍存在 | 创建清理脚本移除废弃枚举值引用 |
| 数据一致性检查 | `projectId` 字段依赖递归 CTE 回填，可能存在数据不一致 | 定期运行一致性检查脚本 |
| 权限同步 | 权限枚举变更后需要同步到相关角色 | 使用 audit-permissions 脚本定期审计 |

### 5.5 建议新增的数据修复脚本

#### 5.5.1 枚举值清理脚本

**目的：** 清理 PostgreSQL 中已废弃的枚举值引用

**风险评估：** PostgreSQL 不支持直接删除枚举值，需要：
1. 创建新枚举类型
2. 更新表使用新枚举
3. 删除旧枚举

#### 5.5.2 数据一致性检查脚本

**目的：** 定期检查 `projectId`、`libraryKey` 等字段的数据一致性

## 6. 迁移策略建议

### 6.1 迁移执行流程

```
开发环境:
  1. 修改 schema.prisma
  2. 运行 pnpm prisma migrate dev --name <migration-name>
  3. 运行 pnpm prisma generate
  4. 运行 seed 脚本（如需）

测试环境:
  1. 运行 pnpm prisma migrate deploy
  2. 运行全局测试设置（自动清理并创建测试数据）

生产环境:
  1. 备份数据库
  2. 运行 pnpm prisma migrate deploy
  3. 运行必要的数据修复脚本
  4. 运行 seed 脚本（如需更新系统角色）
```

### 6.2 数据迁移注意事项

**对于包含数据操作的迁移（如 add_project_id_and_cleanup_library_key）：**

1. **执行前备份**：确保在执行迁移前备份数据库
2. **测试环境验证**：先在测试环境执行验证
3. **监控执行时间**：大数据量时可能耗时较长
4. **考虑分批处理**：对于超大表考虑分批更新

### 6.3 权限同步策略

**建议执行频率：**
- 每次发布后执行 `audit-permissions.ts`
- 定期（如每周）执行权限审计
- 在权限枚举变更后立即执行

### 6.4 公共资源库初始化

**执行时机：**
- 系统首次部署后
- 数据库重建后
- 资源库意外删除后

## 7. 潜在风险点

### 7.1 枚举值删除限制

**问题：** PostgreSQL 不支持直接删除枚举值

**影响：** 
- `SYSTEM_TEMPLATE_READ` 和 `GALLERY_ADD` 在数据库中仍存在
- 可能导致代码与数据库不一致

**建议：** 创建专门的枚举清理迁移脚本

### 7.2 数据迁移的幂等性

**检查结果：** ✅ 现有迁移使用 `IF NOT EXISTS` 和 `ON CONFLICT DO NOTHING` 保证幂等性

### 7.3 测试数据隔离

**检查结果：** ✅ 测试环境使用独立的 global-setup 清理并创建测试数据

### 7.4 数据库连接配置

**问题：** Schema 中 `datasource db` 未配置 URL，依赖环境变量

**建议：** 在生产环境确保 `DATABASE_URL` 环境变量正确配置

## 8. 总结

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 迁移历史完整性 | ✅ | 7 个迁移文件，变更记录完整 |
| Seed 脚本完整性 | ✅ | 包含系统角色和默认管理员创建 |
| 测试环境配置 | ✅ | 有独立的全局测试设置 |
| Schema 一致性 | ✅ | 当前 Schema 与最新迁移一致 |
| 数据修复脚本 | ⚠️ | 缺少枚举值清理脚本 |
| 权限审计机制 | ✅ | 有完善的权限审计脚本 |

**后续建议：**
1. 创建枚举值清理脚本处理废弃的枚举值
2. 定期执行权限审计确保权限配置正确
3. 在生产环境部署前进行完整的迁移测试