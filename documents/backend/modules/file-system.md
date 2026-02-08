# 文件系统（File System）

**文件位置**：`packages/backend/src/file-system/`

## 概述

统一的文件系统管理模块，基于 FileSystemNode 树形结构管理项目、文件夹和文件。

## 核心组件

- **FileSystemService**: 文件系统服务，提供 CRUD 操作
- **FileSystemController**: 文件系统控制器，提供 API 接口
- **FileSystemModule**: 文件系统模块

## 核心特性

- 统一的树形结构（项目、文件夹、文件使用同一个模型）
- 灵活的层级管理（支持无限嵌套文件夹）
- 简化的权限控制（统一的权限管理逻辑）
- 高效的查询性能（通过自引用实现递归查询）
- 文件去重（基于 SHA-256 哈希值检测重复文件）
- 安全防护（多层文件验证机制）
- 智能重命名（同名文件自动添加序号）
- 外部参照跟踪（自动检测和管理 CAD 图纸的外部参照依赖）
- 回收站功能（软删除支持）
- 图库集成（文件可添加到图库）

## 文件上传架构

**上传服务**：
- **FileUploadManagerService**: 文件上传管理器，协调上传流程
- **ChunkUploadService**: 分片上传服务，处理分片数据
- **FileCheckService**: 文件检查服务，验证文件存在性
- **NodeCreationService**: 节点创建服务，创建文件系统节点
- **FileConversionService**: 文件转换服务，转换 CAD 图纸
- **UploadOrchestrator**: 上传编排器，统一上传接口

**分片上传流程**：
1. 检查分片存在 → 2. 上传分片 → 3. 合并请求 → 4. 分配存储 → 5. 合并文件 → 6. 创建节点 → 7. 转换文件 → 8. 更新状态

**并发控制**：
- 最大并发上传数：5
- 使用 RateLimiter 控制并发
- 防止同一文件同时多次转换
- 使用 FileLockService 防止并发冲突

## 文件验证配置

```typescript
FILE_UPLOAD_CONFIG = {
  allowedExtensions: ['.dwg', '.dxf', '.pdf', '.png', '.jpg', '.jpeg'],
  maxFileSize: 104857600, // 100MB
  maxFilesPerUpload: 10,
  blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.ps1', '.scr', '.vbs'],
}
```

## 文件重复处理逻辑

| 场景 | 行为 |
|------|------|
| 同名+同内容+同目录+同用户 | 跳过，不重复添加 |
| 同名+不同内容 | 自动加序号 `文件名 (1).扩展名` |
| 不同名+同内容 | 正常添加（共享存储，节省空间） |

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/file-system/*` | CRUD | 项目、文件夹、文件的 CRUD 操作 |

## 相关组件

- StorageManagerService: 存储管理
- DirectoryAllocatorService: 目录分配
- PermissionService: 权限检查