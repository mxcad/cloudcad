# 图库管理（Gallery）

**文件位置**：`packages/backend/src/gallery/`

## 概述

图库管理功能，允许用户将 CAD 图纸和图块添加到图库中，支持分类浏览、筛选和搜索。图库是基于用户的收藏管理功能，每个用户拥有独立的图库。

## 核心组件

- **GalleryService**: 图库服务
- **GalleryController**: 图库控制器
- **GalleryModule**: 图库模块

## 核心功能

- 图纸库：管理和浏览 CAD 图纸文件
- 图块库：管理和浏览 CAD 图块文件（.mxweb）
- 分类管理：三级分类体系（一级、二级、三级）
- 文件浏览：支持按分类、关键字筛选文件
- 添加到图库：从文件系统右键添加文件到图库
- 从图库移除：将文件从图库中移除（不删除原文件）
- 浏览统计：记录文件的浏览次数
- 权限控制：使用 `GALLERY_ADD` 权限控制添加到图库

**注意**：图库是收藏管理功能，不提供文件下载功能。如需下载文件，请前往项目文件管理系统。

## 图库类型

| 类型 | 说明 |
|------|------|
| drawings | 图纸库（DWG/DXF） |
| blocks | 图块库（.mxweb） |

## 数据模型

### GalleryType（图库分类）

图库分类模型，支持三级分类体系。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int | 主键（自增） |
| pid | Int | 父分类 ID，0 表示一级分类 |
| name | String | 分类名称 |
| status | Int | 状态：1=启用，0=禁用 |
| galleryType | String | 图库类型（drawings/blocks） |
| ownerId | String | 分类所有者 ID |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### GalleryItem（图库收藏）

图库收藏关系表，记录用户将文件添加到图库的行为。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键（CUID） |
| userId | String | 用户 ID |
| nodeId | String | 文件节点 ID |
| galleryType | String | 图库类型（drawings/blocks） |
| firstType | Int | 一级分类 ID |
| secondType | Int | 二级分类 ID |
| thirdType | Int? | 三级分类 ID（可选） |
| lookNum | Int | 浏览次数 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

**唯一约束**：`[userId, nodeId, galleryType, secondType]` - 防止用户重复添加同一个文件到相同分类

**关联关系**：
- `userId` → `User`（级联删除）
- `nodeId` → `FileSystemNode`（级联删除）

## 设计理念

### 用户图库

图库是用户的收藏管理功能，不是文件的分类标签。同一个文件可以被多个用户添加到各自的图库中，互不影响。

### 数据分离

图库数据与文件系统数据完全分离：
- **FileSystemNode**：存储文件本身的信息（名称、路径、哈希等）
- **GalleryItem**：存储用户的收藏关系（用户、文件、分类、浏览次数等）

### 权限控制

添加文件到图库需要 `GALLERY_ADD` 权限：
- 项目所有者：自动拥有权限
- 项目成员：根据角色权限判断

## API 端点

### 分类管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/gallery/{galleryType}/types` | POST | 获取分类列表 |
| `/api/gallery/{galleryType}/types/create` | POST | 创建分类 |
| `/api/gallery/{galleryType}/types/{typeId}` | PUT | 更新分类 |
| `/api/gallery/{galleryType}/types/{typeId}` | DELETE | 删除分类 |

### 文件管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/gallery/{galleryType}/filelist` | POST | 获取文件列表 |
| `/api/gallery/{galleryType}/items` | POST | 添加文件到图库 |
| `/api/gallery/{galleryType}/items/{nodeId}` | DELETE | 从图库移除文件 |
| `/api/gallery/{galleryType}/items/{nodeId}` | PUT | 更新图库文件的分类 |

### 文件访问

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/gallery/{galleryType}/*path` | GET | 访问图库文件（.mxweb） |
| `/api/gallery/{galleryType}/*path` | HEAD | 获取文件元信息 |

## 前端组件

- **Gallery**: `packages/frontend/pages/Gallery.tsx` - 图库页面
- **AddToGalleryModal**: `packages/frontend/components/modals/AddToGalleryModal.tsx` - 添加到图库模态框
- **galleryApi**: `packages/frontend/services/galleryApi.ts` - 图库 API 接口

## 权限要求

| 操作 | 所需权限 | 说明 |
|------|----------|------|
| 添加文件到图库 | `GALLERY_ADD` | 项目所有者或拥有 `GALLERY_ADD` 权限的项目成员 |
| 查看图库 | 无需特殊权限 | 用户只能查看自己的图库 |
| 从图库移除 | 无需特殊权限 | 用户只能移除自己图库中的文件 |
| 更新分类 | 无需特殊权限 | 用户只能更新自己图库中文件的分类 |

## 浏览统计

每次访问图库文件时，`GalleryItem.lookNum` 会自动增加，用于统计用户的浏览行为。

## 数据迁移

如果从旧版本升级，需要执行以下迁移：

1. **创建 GalleryItem 表**：自动通过 Prisma 迁移完成
2. **迁移历史数据**：如果有历史图库数据，需要使用迁移脚本将数据从 `FileSystemNode` 迁移到 `GalleryItem`
3. **删除旧字段**：自动通过 Prisma 迁移完成