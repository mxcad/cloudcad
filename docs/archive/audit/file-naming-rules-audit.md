# 文件命名规则审计报告

## 一、概述

本报告对 CloudCAD 后端系统中文件存储、文件读取相关的 Service 进行了全面扫描，梳理了文件命名规则和路径拼接逻辑。

## 二、扫描范围

扫描的核心模块包括：

| 模块路径 | 功能描述 |
|---------|---------|
| `packages/backend/src/mxcad/` | MxCAD 文件处理核心模块 |
| `packages/backend/src/file-system/` | 文件系统管理模块 |
| `packages/backend/src/storage/` | 存储服务模块 |
| `packages/backend/src/common/services/` | 通用服务（存储管理器等） |
| `packages/backend/src/version-control/` | 版本控制服务 |

## 三、文件存储路径结构

### 3.1 目录分配机制

文件存储采用**年月分级目录**结构，由 `DirectoryAllocator` 服务负责分配：

```
data/filesData/
├── 202604/           # 主目录（YYYYMM格式）
│   ├── node_xxx1/     # 节点目录
│   ├── node_xxx2/
│   └── ...
├── 202604_1/         # 子目录（当主目录节点数达到限制时）
│   └── node_xxx3/
└── 202605/
    └── ...
```

**关键代码位置**：
- `common/services/directory-allocator.service.ts` - 目录分配逻辑
- `common/services/storage-manager.service.ts` - 存储分配接口

### 3.2 目录命名规则

| 目录类型 | 命名格式 | 说明 |
|---------|---------|------|
| 年月主目录 | `YYYYMM` | 如 `202604` |
| 年月子目录 | `YYYYMM_N` | N 从 1 开始递增，最多支持 100 个子目录 |
| 节点目录 | `node_{timestamp}_{random}` | 如 `node_1712540800_abc123def` |

---

## 四、文件命名规则详解

### 4.1 原始 CAD 文件（DWG/DXF）

**上传阶段**：原始文件临时存储在 `mxcadUploadPath`（默认 `../../uploads`）目录

**转换后**：原始 CAD 文件（`.dwg`/`.dxf`）存储在节点目录中，文件名格式为：

```
{nodeId}.{originalExtension}
示例：node_xxx123.dwg
```

**相关代码**：
- `mxcad/upload/file-conversion-upload.service.ts:561-565` - 文件复制时的命名转换
- `mxcad/upload/upload-utility.service.ts:153-158` - 获取转换后文件名

### 4.2 转换后的 MXWeb 文件

**主文件命名规则**：

```
{nodeId}.{originalExtension}.mxweb
示例：node_xxx123.dwg.mxweb
```

**关键代码位置**：

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `mxcad/upload/file-conversion-upload.service.ts` | 563 | `targetFileName = file.replace(fileHash, newNode.id)` |
| `mxcad/upload/file-conversion-upload.service.ts` | 579-580 | 预期文件名格式定义 |
| `mxcad/save/save-as.service.ts` | 145 | SaveAs 场景的 mxweb 命名 |
| `mxcad/upload/upload-utility.service.ts` | 153-158 | `getConvertedFileName()` 方法 |

**转换过程中的临时命名**（上传目录中）：
```
{fileHash}.{originalExtension}.mxweb
示例：abc123def456.dwg.mxweb
```

### 4.3 历史版本文件

历史版本通过 **SVN 版本控制**管理：

- **存储位置**：SVN 仓库位于 `svnRepoPath` 配置路径
- **工作副本**：`data/filesData/` 作为 SVN 工作副本
- **版本访问**：通过 `VersionControlService.getFileContentAtRevision()` 获取指定版本

**相关代码**：
- `version-control/version-control.service.ts` - SVN 操作封装
- `mxcad/conversion/file-conversion.service.ts:381-524` - `convertBinToMxweb()` - 从历史版本恢复 mxweb

### 4.4 缩略图文件

**命名规则**：

```
thumbnail.{format}
示例：thumbnail.webp
```

**支持格式及优先级**（从高到低）：
1. `thumbnail.webp`（首选）
2. `thumbnail.jpg`
3. `thumbnail.png`

**相关代码**：

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `mxcad/infra/thumbnail-utils.ts` | 9 | `THUMBNAIL_FORMATS` 常量定义 |
| `mxcad/infra/thumbnail-utils.ts` | 22-24 | `getThumbnailFileName()` 方法 |
| `mxcad/infra/thumbnail-generation.service.ts` | 182-184 | 缩略图生成目标路径 |

### 4.5 分片文件

**临时存储目录**：
```
data/temp/chunk_{fileHash}/
```

**分片文件命名规则**：
```
{chunkIndex}_{fileHash}
示例：0_abc123def456
```

**相关代码**：
- `mxcad/chunk/chunk-upload.service.ts:74-80` - 分片存在性检查
- `mxcad/chunk/chunk-upload.service.ts:145-510` - 分片合并逻辑

---

## 五、涉及文件命名/路径拼接的代码位置汇总

### 5.1 文件名生成

| 文件路径 | 方法/函数 | 功能说明 |
|---------|-----------|---------|
| `mxcad/upload/upload-utility.service.ts` | `getConvertedFileName()` | 生成转换后文件名 |
| `mxcad/upload/upload-utility.service.ts` | `generateUniqueFileName()` | 生成唯一文件名 |
| `mxcad/save/save-as.service.ts` | `generateUniqueFileName()` | SaveAs 场景唯一文件名 |
| `mxcad/infra/thumbnail-utils.ts` | `getThumbnailFileName()` | 生成缩略图文件名 |

### 5.2 路径拼接

| 文件路径 | 方法/函数 | 功能说明 |
|---------|-----------|---------|
| `common/services/storage-manager.service.ts` | `allocateNodeStorage()` | 分配节点存储并构建路径 |
| `common/services/storage-manager.service.ts` | `getNodeStorageInfo()` | 获取节点存储信息 |
| `common/services/storage-manager.service.ts` | `getFullPath()` | 将相对路径转换为完整路径 |
| `common/services/storage-manager.service.ts` | `getNodeDirectoryPath()` | 从数据库路径提取目录路径 |
| `storage/local-storage.provider.ts` | `getAbsolutePath()` | 获取文件绝对路径 |

### 5.3 文件转换与存储

| 文件路径 | 方法/函数 | 功能说明 |
|---------|-----------|---------|
| `mxcad/upload/file-conversion-upload.service.ts` | `handleFileNodeCreation()` | 文件节点创建与路径处理 |
| `mxcad/upload/file-conversion-upload.service.ts` | `uploadAndConvertFileWithPermission()` | 带权限的文件上传转换 |
| `mxcad/conversion/file-conversion.service.ts` | `convertFile()` | DWG 转 MXWeb |
| `mxcad/conversion/file-conversion.service.ts` | `convertBinToMxweb()` | BIN 转 MXWeb（历史版本） |

---

## 六、路径处理流程图

```
用户上传文件
    │
    ▼
┌─────────────────┐
│  分片上传/直传   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  临时存储        │  路径: {mxcadUploadPath}/{fileHash}.{ext}.mxweb
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  文件转换        │  DWG/DXF → MXWeb
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  目录分配        │  DirectoryAllocator.allocateDirectory()
│                 │  返回: YYYYMM[/N]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  节点目录创建    │  StorageManager.allocateNodeStorage()
│                 │  路径: {filesDataPath}/YYYYMM[/N]/nodeId/
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  文件复制并重命名 │  {fileHash}.{ext}.mxweb → {nodeId}.{ext}.mxweb
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  缩略图生成      │  thumbnail.webp/jpg/png
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SVN 提交        │  VersionControlService.commitNodeDirectory()
└─────────────────┘
```

---

## 七、关键常量定义

### 7.1 存储路径常量

```typescript
// mxcad/constants/storage.constants.ts
STORAGE_PATH_PREFIX = 'filesData';      // 存储路径前缀
DATE_FORMAT = 'YYYYMM';                  // 目录日期格式
MXWEB_EXTENSION = '.mxweb';              // MXWeb 文件扩展名
FILE_HASH_LENGTH = 32;                   // 文件哈希长度（MD5）
```

### 7.2 目录节点限制

```typescript
// 配置文件中定义
storage.nodeLimit = 10000;               // 每个年月目录最大节点数
```

---

## 八、总结

### 文件命名规则总览

| 文件类型 | 命名格式 | 存储位置 |
|---------|---------|---------|
| 原始 CAD 文件 | `{nodeId}.{ext}` | `YYYYMM[/N]/nodeId/` |
| MXWeb 文件 | `{nodeId}.{ext}.mxweb` | `YYYYMM[/N]/nodeId/` |
| 缩略图 | `thumbnail.webp/jpg/png` | `YYYYMM[/N]/nodeId/` |
| 分片文件（临时） | `{chunkIndex}_{hash}` | `temp/chunk_{hash}/` |
| 历史版本 | 通过 SVN 版本控制管理 | SVN 仓库 |

### 代码关注点

1. **路径安全**：所有路径拼接应使用 `path.join()` 避免路径遍历攻击
2. **文件名转换**：`fileHash` → `nodeId` 的替换逻辑在多处出现，需保持一致
3. **SVN 忽略模式**：`svn:global-ignores` 配置决定哪些文件不纳入版本控制
4. **缩略图格式优先级**：webp > jpg > png，代码检查顺序需严格遵循

---

**审计时间**：2026-05-02  
**扫描范围**：`packages/backend/src/` 下所有文件存储相关模块