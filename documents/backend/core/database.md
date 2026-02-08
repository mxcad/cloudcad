# 数据库架构（Database）

**文件位置**：`packages/backend/prisma/schema.prisma`

## 概述

使用 Prisma ORM 管理 PostgreSQL 数据库，采用统一的 FileSystemNode 模型管理文件系统。

## 核心数据模型

### FileSystemNode（文件系统统一模型）

**设计理念**：统一管理项目、文件夹和文件的树形结构

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| name | String | 节点名称 |
| isFolder | Boolean | 是否为文件夹 |
| isRoot | Boolean | 是否为项目根目录 |
| parentId | String? | 父节点 ID（自引用） |
| path | String? | 存储路径（仅文件） |
| fileHash | String? | SHA-256 哈希值（用于去重） |
| hasMissingExternalReferences | Boolean | 是否有缺失的外部参照 |
| isInGallery | Boolean | 是否在图库中 |
| ownerId | String | 所有者 ID |
| deletedAt | DateTime? | 软删除时间 |
| deletedFromStorage | DateTime? | 从本地存储删除的时间 |
| deletedByCascade | Boolean | 是否因父节点删除而被自动删除 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### AuditLog（审计日志模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| action | String | 操作类型 |
| resourceType | String | 资源类型 |
| userId | String | 操作用户 ID |
| details | String? | 详细信息（JSON） |
| success | Boolean | 操作是否成功 |
| createdAt | DateTime | 创建时间 |

### Role（角色模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| name | String | 角色名称 |
| category | String | 角色类别（SYSTEM/PROJECT/CUSTOM） |
| level | Int | 角色级别（用于权限继承） |
| isSystem | Boolean | 是否为系统角色（不可删除） |

### ProjectMember（项目成员模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| projectId | String | 项目 ID |
| userId | String | 用户 ID |
| projectRoleId | String | 项目角色 ID |

### ProjectRole（项目角色模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| name | String | 角色名称（全局唯一） |
| description | String | 角色描述 |
| ownerId | String | 创建者 ID |
| isSystem | Boolean | 是否为系统默认角色 |

### ProjectRolePermission（项目角色权限关联）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| projectRoleId | String | 项目角色 ID |
| permission | ProjectPermission | 项目权限 |

### UploadSession（上传会话模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | String | 主键（CUID） |
| uploadId | String | 上传 ID |
| storageKey | String | 存储键名 |
| fileName | String | 原始文件名 |
| fileSize | Int | 文件总大小 |
| status | String | 上传状态 |
| totalParts | Int | 总分片数 |
| uploadedParts | Int | 已上传分片数 |

### GalleryType（图库分类模型）

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| id | Int | 主键（自增） |
| pid | Int | 父分类 ID |
| name | String | 分类名称 |
| galleryType | String | 图库类型（drawings/blocks） |
| ownerId | String | 分类所有者 ID |

## 节点类型

| 类型 | isRoot | isFolder | 特点 |
|------|--------|----------|------|
| 项目根目录 | true | true | 包含 projectStatus, description |
| 文件夹 | false | true | 仅包含基础字段 |
| 文件 | false | false | 包含存储和状态相关字段 |

## 数据库操作规范

- 所有数据库操作必须通过 Prisma Client
- 多表操作使用 `$transaction`
- 软删除使用 `deletedAt` 字段标记删除
- 级联删除使用 `onDelete: Cascade` 确保数据一致性

## 数据库命令

```powershell
pnpm db:generate    # 生成 Prisma Client
pnpm db:push        # 推送数据库架构
pnpm db:migrate     # 运行数据库迁移
pnpm db:studio      # 打开 Prisma Studio
pnpm db:seed        # 执行种子数据
```