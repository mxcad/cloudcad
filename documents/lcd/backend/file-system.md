# 文件系统模块

## 模块概览

| 模块 | 路径 | 说明 |
|------|------|------|
| file-system | `packages/backend/src/file-system/` | 文件系统核心 |
| storage | `packages/backend/src/storage/` | 存储服务 |
| mxcad | `packages/backend/src/mxcad/` | CAD 编辑器集成 |
| version-control | `packages/backend/src/version-control/` | SVN 版本控制 |

---

## file-system 模块

**路径**: `packages/backend/src/file-system/`

### 核心组件

- `file-system.controller.ts`: 文件操作 API
- `file-system.service.ts`: 文件 CRUD、移动、复制
- `file-system-permission.service.ts`: 文件权限检查

### 数据模型

- `FileSystemNode`: 统一节点模型
  - 类型: 文件夹/文件/项目根目录
  - 树形结构自引用
  - 支持文件哈希去重

### 集成点

- 依赖: StorageModule, DatabaseModule
- 被依赖: MxCadModule, VersionControlModule

---

## storage 模块

**路径**: `packages/backend/src/storage/`

### 核心组件

- `storage.service.ts`: 文件存储抽象
- 支持本地文件系统存储

### 存储位置

- 上传文件: `uploads/`
- 项目数据: `filesData/`

---

## mxcad 模块

**路径**: `packages/backend/src/mxcad/`

### 核心组件

- `mxcad.controller.ts`: CAD 编辑 API
- `dto/`: 请求/响应 DTO

### 功能

- CAD 文件上传
- mxweb 文件保存
- 外部引用管理
- 缩略图处理

---

## version-control 模块

**路径**: `packages/backend/src/version-control/`

### 核心组件

- `version-control.controller.ts`: 版本控制 API
- `version-control.service.ts`: SVN 操作封装

### 功能

- 文件版本历史
- 提交记录查询
- 版本回滚
