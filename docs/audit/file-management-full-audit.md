# 文件管理核心模块完整审计报告

**审计时间**：2026-05-02
**审计范围**：`apps/backend/src/` 下所有文件管理相关模块

---

## 一、上传链路

### 1.1 相关 Controller 和 Service

| 模块 | Controller | Service |
|------|-------------|---------|
| MxCAD 文件 | `mxcad/core/mxcad.controller.ts` | `mxcad/core/mxcad.service.ts` |
| 公共文件 | `public-file/public-file.controller.ts` | `public-file/public-file.service.ts` |
| 文件系统 | `file-system/file-system.controller.ts` | `file-system/file-system.service.ts` |

### 1.2 分片上传流程

**前端分片上传的完整流程**：

1. **检查分片存在**：`POST /v1/mxcad/files/chunkisExist`
   - 验证分片索引 `chunk`，文件哈希 `fileHash`
   - 使用缓存避免重复检查

2. **分片上传**：`POST /v1/mxcad/files/uploadFiles`
   - 参数：`chunk`, `chunks`, `hash`, `name`, `size`
   - Multer 拦截器处理文件存储
   - 临时路径：`temp/chunk_{hash}/{chunk}_{hash}`

3. **合并分片**：`POST /v1/mxcad/files/uploadFiles`（无文件时）
   - 参数：`hash`, `name`, `size`, `chunks`
   - 使用 `ConcurrencyManager` 的 `acquireLock` 防止并发合并
   - 合并后清理临时目录

**分片大小和并发数**：
- 分片大小由前端控制，后端无固定限制
- 并发控制通过 `RateLimiter` 实现（文件转换并发数）
- `concurrencyMaxConcurrent` 配置控制

### 1.3 秒传检测

**接口**：`POST /v1/mxcad/files/fileisExist`

**检测逻辑**（`file-conversion-upload.service.ts:452-494`）：
```typescript
// 1. 检查转换后的文件是否存在于上传目录
const fileExists = await this.uploadUtilityService.checkFileExistsInStorage(hash, name);

// 2. 如果存在，检查数据库中是否已有相同文件
// 3. 如果数据库中没有记录，创建新的文件节点（秒传成功）
// 4. 如果数据库中已有记录，返回已存在
```

**秒传条件**：
- 文件哈希（MD5）匹配
- 上传目录中存在转换后的文件

### 1.4 权限验证机制

| 接口 | 权限要求 | Guard |
|------|---------|-------|
| `POST /v1/mxcad/files/uploadFiles` | `ProjectPermission.FILE_UPLOAD` | `JwtAuthGuard + RequireProjectPermissionGuard` |
| `POST /v1/mxcad/files/chunkisExist` | `ProjectPermission.FILE_OPEN` | `JwtAuthGuard + RequireProjectPermissionGuard` |
| `POST /v1/mxcad/files/fileisExist` | `ProjectPermission.FILE_OPEN` | `JwtAuthGuard + RequireProjectPermissionGuard` |

**权限验证流程**：
1. `RequireProjectPermissionGuard` 从请求中获取 `nodeId`
2. 通过 `nodeId` 查询数据库获取 `projectId`
3. 调用 `FileSystemPermissionService.getNodeAccessRole()` 检查权限
4. 权限缓存：5分钟（`CACHE_TTL.SYSTEM_PERMISSION`）

### 1.5 上传限制

| 限制类型 | 配置位置 | 默认值 |
|---------|---------|-------|
| 文件大小 | `StorageQuotaInterceptor` | 100MB（代码硬编码） |
| 配额检查 | `quota-enforcement.service.ts` | 启用 |
| 文件类型 | `validateFileType()` | `.dwg`, `.dxf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp` |

**配额检查流程**：
1. `StorageQuotaInterceptor` 在上传前拦截
2. 调用 `QuotaEnforcementService.checkUploadQuota()`
3. 检查用户已用空间 + 新文件大小 <= 配额

### 1.6 上传成功后的存储

**存储位置**：`filesData/YYYYMM[/N]/nodeId/`

**文件命名规则**：
- 原始 CAD 文件：`<nodeId>.<ext>`（如 `node_xxx.dwg`）
- MXWeb 文件：`<nodeId>.<ext>.mxweb`（如 `node_xxx.dwg.mxweb`）
- 临时文件：`<hash>.<ext>.mxweb` → 上传后替换为 `<nodeId>.<ext>.mxweb`

### 1.7 所有上传相关 API 端点

| 端点 | 方法 | Controller 方法 | 权限 |
|------|------|----------------|------|
| `/v1/mxcad/files/chunkisExist` | POST | `checkChunkExist` | `FILE_OPEN` |
| `/v1/mxcad/files/fileisExist` | POST | `checkFileExist` | `FILE_OPEN` |
| `/v1/mxcad/files/checkDuplicate` | POST | `checkDuplicateFile` | `FILE_OPEN` |
| `/v1/mxcad/files/uploadFiles` | POST | `uploadFile` | `FILE_UPLOAD` |
| `/v1/mxcad/savemxweb/:nodeId` | POST | `saveMxwebToNode` | `CAD_SAVE` |
| `/v1/mxcad/save-as` | POST | `saveMxwebAs` | JWT 认证 |
| `/v1/mxcad/up_ext_reference_dwg/:nodeId` | POST | `uploadExtReferenceDwg` | `CAD_EXTERNAL_REFERENCE` |
| `/v1/mxcad/up_ext_reference_image` | POST | `uploadExtReferenceImage` | `CAD_EXTERNAL_REFERENCE` |
| `/public-file/chunk/check` | POST | `checkChunk` | 公开 |
| `/public-file/file/check` | POST | `checkFile` | 公开 |
| `/public-file/chunk/upload` | POST | `uploadChunk` | 公开 |
| `/public-file/chunk/merge` | POST | `mergeChunks` | 公开 |

---

## 二、转换链路

### 2.1 相关模块

| 模块 | 文件 | 功能 |
|------|------|------|
| 转换服务 | `mxcad/conversion/file-conversion.service.ts` | 调用 mxcadassembly 转换程序 |
| 缩略图生成 | `mxcad/infra/thumbnail-generation.service.ts` | 生成预览缩略图 |

### 2.2 转换触发时机

**自动触发**：
- 文件上传完成后立即触发（`uploadAndConvertFileWithPermission`）
- 分片合并后自动转换（`mergeConvertFile`）
- `saveMxwebFile` 保存后调用 `generateBinFiles()`

**手动触发**：
- `POST /v1/mxcad/file/:nodeId/refresh-external-references` - 刷新外部参照

### 2.3 支持的文件格式

| 源格式 | 目标格式 | 转换程序 |
|--------|---------|---------|
| DWG | MXWeb | `mxcadassembly` |
| DXF | MXWeb | `mxcadassembly` |
| MXWeb | MXWeb | 直接复制 |
| BIN | MXWeb | `mxcadassembly`（历史版本恢复） |
| MXWeb | DWG | `mxcadassembly`（Save As） |
| MXWeb | PDF | `mxcadassembly` |

### 2.4 转换程序调用方式

**调用方式**：命令行进程（`child_process.exec`）

**关键代码**（`file-conversion.service.ts:218-229`）：
```typescript
const cmd = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
const execResult = await execAsync(cmd, {
  encoding: 'utf8',
  timeout: options.timeout || 60000,
  maxBuffer: 50 * 1024 * 1024,
});
```

**参数**：
```json
{
  "srcpath": "/absolute/path/to/file.dwg",
  "src_file_md5": "md5hash",
  "create_preloading_data": true,
  "compression": 0,
  "outname": "filename.bin"
}
```

### 2.5 并发控制机制

**实现方式**：`RateLimiter`（基于信号量的令牌桶）

**配置**（`file-conversion.service.ts:46-54`）：
```typescript
const cpuCount = os.cpus().length;
const configMaxConcurrent = uploadConfig?.maxConcurrent;
const maxConversionConcurrent = uploadConfig?.conversionMaxConcurrent || 4;
const maxConcurrent = Math.min(configMaxConcurrent, cpuCount, maxConversionConcurrent);
this.conversionRateLimiter = new RateLimiter(maxConcurrent);
```

**默认并发数**：CPU 核心数 vs 4 的较小值

### 2.6 超时处理和失败重试

| 配置项 | 默认值 |
|--------|--------|
| 超时时间 | 60秒（`timeout: 60000`） |
| 转换失败 | 返回 `{ isOk: false, error: message }` |
| 重试机制 | 无自动重试（调用方负责） |

### 2.7 转换完成后的存储位置

**存储位置**：`filesData/YYYYMM[/N]/nodeId/`

**生成的文件**：
1. `*.mxweb` - 转换后的 Web 文件
2. `*.bin` - 二进制分片文件（用于历史版本）
3. `*_preloading.json` - 预加载数据
4. `thumbnail.webp/jpg/png` - 缩略图

### 2.8 转换状态

**转换状态枚举**（`mxcad-return.enum.ts`）：
```typescript
export enum MxUploadReturn {
  kOk = 'ok',
  kChunkNoExist = 'chunkNoExist',
  kFileNoExist = 'fileNoExist',
  kFileAlreadyExist = 'fileAlreadyExist',
  kConvertFileError = 'convertFileError',
}
```

**状态流转**：
```
上传 → 检查文件存在 → 已存在 → 秒传（创建节点）
                    → 不存在 → 转换 → 成功（kOk）
                              → 失败（kConvertFileError）
```

---

## 三、存储链路

### 3.1 存储目录结构

```
data/filesData/
├── 202604/           # 年月主目录（YYYYMM）
│   ├── nodeId1/       # 节点目录
│   │   ├── nodeId1.dwg
│   │   ├── nodeId1.dwg.mxweb
│   │   ├── nodeId1.dwg.bin
│   │   ├── nodeId1.dwg_preloading.json
│   │   └── thumbnail.webp
│   └── nodeId2/
├── 202604_1/         # 年月子目录（节点数超限时）
└── ...

data/temp/
└── chunk_{fileHash}/ # 分片临时目录
    ├── 0_hash
    ├── 1_hash
    └── ...

uploads/              # 上传临时目录
├── abc123.dwg.mxweb
└── thumbnail_xxx.webp
```

### 3.2 存储后端

**当前实现**：本地磁盘（`LocalStorageProvider`）

**存储服务**（`storage/storage.service.ts`）：
```typescript
class StorageService {
  async fileExists(key: string): Promise<boolean>;
  async getFileStream(key: string): Promise<NodeJS.ReadableStream>;
  async getFileInfo(key): Promise<{ contentType, contentLength }>;
}
```

**MinIO 切换方式**：代码中已定义接口 `StorageProvider`，但实际只有 `LocalStorageProvider` 实现。

### 3.3 存储路径命名规则

| 组件 | 规则 | 示例 |
|------|------|------|
| 年月目录 | `YYYYMM` | `202604` |
| 年月子目录 | `YYYYMM_N`（N=1-100） | `202604_1` |
| 节点目录 | `{nodeId}` | `node_xxx123` |
| MXWeb 文件 | `{nodeId}.{ext}.mxweb` | `node_xxx.dwg.mxweb` |
| 原始文件 | `{nodeId}.{ext}` | `node_xxx.dwg` |
| 缩略图 | `thumbnail.{webp\|jpg\|png}` | `thumbnail.webp` |
| 分片 | `{chunkIndex}_{hash}` | `0_abc123` |

### 3.4 临时文件和永久文件区分

| 类型 | 位置 | 清理机制 |
|------|------|---------|
| 分片临时文件 | `temp/chunk_{hash}/` | 合并成功后立即清理 |
| 上传临时文件 | `uploads/` | 转换成功后立即清理 |
| 历史版本 | SVN 仓库 | 通过 `svn:global-ignores` 管理 |
| 缩略图缓存 | `uploads/*.jpg` | 定期清理（通过缓存机制） |

### 3.5 存储空间管理和配额

**配额检查**：`StorageQuotaInterceptor`

**清理机制**：
- `StorageCleanupService.cleanupExpiredStorage()` - 清理超过 30 天的过期存储
- 软删除机制：`deletedFromStorage` 字段标记，延迟清理

---

## 四、下载与预览链路

### 4.1 下载端点

| 端点 | 方法 | 功能 | 权限 |
|------|------|------|------|
| `/v1/file-system/nodes/:nodeId/download` | GET | 下载节点文件 | `FILE_DOWNLOAD` |
| `/v1/file-system/nodes/:nodeId/download-with-format` | GET | 多格式下载 | `FILE_DOWNLOAD` |
| `/v1/mxcad/filesData/*path` | GET | 访问 filesData 文件 | `MixedAuthGuard` |
| `/v1/mxcad/file/*path` | GET | 访问转换后文件 | `MixedAuthGuard` |

### 4.2 认证方式

| 端点 | 认证方式 |
|------|---------|
| `/v1/file-system/nodes/:nodeId/download` | JWT Token |
| `/v1/mxcad/filesData/*path` | `MixedAuthGuard`（Session 优先，回退到 JWT） |
| `/v1/mxcad/file/*path` | `MixedAuthGuard` |

**MixedAuthGuard 逻辑**（`mxcad.controller.ts:1647-1673`）：
1. 优先从 Session 获取 `userId`
2. Session 不存在则从 JWT Token 获取
3. 验证用户状态（`status === 'ACTIVE'`）

### 4.3 预览（缩略图）

**端点**：`GET /v1/file-system/nodes/:nodeId/thumbnail`

**访问权限**：
- 公开资源库：需要系统权限（`LIBRARY_DRAWING_MANAGE` 或 `LIBRARY_BLOCK_MANAGE`）
- 项目文件：需要项目访问权限

**缩略图查找**（`file-system.controller.ts:499-502`）：
```typescript
const nodeDir = path.dirname(nodeFullPath);
const thumbnail = findThumbnailSync(nodeDir);
```

**缩略图格式优先级**：webp > jpg > png

### 4.4 安全文件下载

**下载处理**（`file-download-handler.service.ts`）：
1. 获取文件流
2. 设置 `Content-Type`
3. 设置 `Content-Disposition`（支持中文文件名）
4. 设置 ETag 缓存头
5. 流式传输

**历史版本下载**（`mxcad.controller.ts:1193-1488`）：
1. 从 SVN 获取指定版本的文件内容
2. 如果是 MXWeb 文件且无缓存，需要转换
3. 支持 `v` 参数指定版本号

### 4.5 下载权限验证

| 端点 | 权限检查 |
|------|---------|
| `/v1/file-system/nodes/:nodeId/download` | `RequireProjectPermission(FILE_DOWNLOAD)` |
| `/v1/mxcad/filesData/*path` | `MixedAuthGuard` + 节点权限检查 |

---

## 五、文件访问权限控制

### 5.1 权限检查在文件访问中的应用

**文件访问权限检查流程**（`mxcad.controller.ts:1706-1723`）：
```typescript
const permission = await this.checkFileAccessPermission(node.id, userId, userId);
if (!hasPermission) {
  return res.status(401).json({ code: -1, message: 'Unauthorized' });
}
```

**权限服务**（`file-permission/file-system-permission.service.ts`）：
- `getNodeAccessRole(userId, nodeId)` - 获取用户在节点的角色
- `checkNodePermission(userId, nodeId, permission)` - 检查具体权限

### 5.2 端点权限分类

| 端点类型 | 权限要求 | 说明 |
|---------|---------|------|
| 项目文件操作 | `ProjectPermission` | 需要项目角色权限 |
| 公共资源库 | `SystemPermission` | 需要系统权限 |
| 公开接口 | 无 | 外部参照等公开访问 |

**项目权限列表**（`permissions.enum.ts`）：
```typescript
export enum ProjectPermission {
  FILE_OPEN = 'FILE_OPEN',
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  FILE_DELETE = 'FILE_DELETE',
  FILE_MOVE = 'FILE_MOVE',
  FILE_COPY = 'FILE_COPY',
  FILE_EDIT = 'FILE_EDIT',
  CAD_SAVE = 'CAD_SAVE',
  CAD_EXTERNAL_REFERENCE = 'CAD_EXTERNAL_REFERENCE',
  PROJECT_MEMBER_MANAGE = 'PROJECT_MEMBER_MANAGE',
  PROJECT_MEMBER_ASSIGN = 'PROJECT_MEMBER_ASSIGN',
}
```

### 5.3 权限收敛确认

**当前实现与设计一致性**：
- ✅ 使用 `RequireProjectPermissionGuard` 进行项目权限检查
- ✅ 通过 `nodeId → projectId` 查询解析项目 ID
- ✅ 权限缓存 5 分钟
- ⚠️ `MixedAuthGuard` 使用 Session 优先，兼容性设计

---

## 六、关键问题确认

### 6.1 文件被多个项目引用时的引用计数

**当前实现**：**无引用计数机制**

**实际情况**：
- `FileSystemNode` 表中 `projectId` 是单一字段，不支持多项目引用
- 删除文件时，直接设置 `deletedAt` 时间戳（软删除）
- `deletedFromStorage` 字段用于标记存储是否已删除

**潜在问题**：
- 文件被多个项目引用时，删除一个项目中的文件可能影响其他项目
- 没有 `referenceCount` 字段或类似机制

### 6.2 SVN 分片提交失败的回滚机制

**当前实现**：**无事务性回滚**

**实际情况**：
- SVN 提交失败时，仅记录错误日志
- 不执行物理文件删除或数据库回滚
- 代码示例（`file-merge.service.ts:375-379`）：
```typescript
try {
  await this.versionControlService.commitNodeDirectory(...);
} catch (svnError) {
  this.logger.error(`SVN 提交异常`, svnError.stack);
  // 不执行回滚，继续流程
}
```

**风险**：
- SVN 提交失败后，文件已上传并转换，但 SVN 版本历史不完整
- 分片合并后 SVN 提交失败，不会自动删除已合并的文件

### 6.3 并发上传/修改同一文件的锁机制

**当前实现**：**部分锁机制**

**分片合并锁**（`chunk-upload.service.ts:172-177`）：
```typescript
const success = await this.concurrencyManager.acquireLock(
  `merge:${hash}`,
  async () => {
    return await this.performMerge(chunkDir, targetPath, hash, chunks);
  }
);
```

**文件锁服务**（`file-lock.service.ts`）：
- 基于文件系统的锁（`.lock` 文件）
- 锁超时可配置
- 支持 `withLock()` 语法

**当前未加锁的场景**：
- ⚠️ 并发上传相同文件到同一目录
- ⚠️ 并发修改同一文件（`saveMxwebFile`）
- ⚠️ 并发创建同名文件

### 6.4 latest.mxweb 命名规则

**当前实现**：**无 latest.mxweb 命名**

**实际情况**：
- 当前使用的是 `{nodeId}.{ext}.mxweb` 格式
- 没有专门的 `latest.mxweb` 文件
- 版本历史通过 SVN 管理，而非文件系统

**历史版本访问**：
- 路径格式：`mxcad/filesData/YYYYMM/nodeId/nodeId.ext.mxweb?v=revision`
- 版本号通过查询参数 `v` 传递
- 首次访问历史版本时，从 SVN 获取 bin 文件并转换

---

## 七、总结与建议

### 7.1 实现良好的部分

1. **分片上传**：完整支持断点续传
2. **秒传机制**：通过哈希检测避免重复上传
3. **并发控制**：使用 `RateLimiter` 限制转换并发
4. **权限分层**：项目权限 + 系统权限 + 公开接口
5. **软删除机制**：`deletedAt` + `deletedFromStorage` 延迟删除
6. **版本历史**：通过 SVN 管理完整版本历史

### 7.2 需要改进的部分

1. **引用计数**：无多项目引用计数，可能导致过早删除
2. **回滚机制**：SVN 提交失败无自动回滚
3. **并发锁**：关键操作缺少全局锁
4. **latest.mxweb**：未实现专门的最新版本文件

### 7.3 建议实施

1. **添加引用计数机制**：
   - 创建 `FileReference` 表记录引用关系
   - 删除前检查引用计数 > 0

2. **增强回滚机制**：
   - SVN 提交使用事务
   - 失败时回滚物理文件和数据库记录

3. **完善并发控制**：
   - 在 `saveMxwebFile` 添加文件锁
   - 在 `createFileNode` 添加唯一性检查

4. **版本管理增强**：
   - 考虑添加 `latest.mxweb` 作为符号链接指向最新版本
   - 或使用数据库记录当前版本号

---

**审计完成**
