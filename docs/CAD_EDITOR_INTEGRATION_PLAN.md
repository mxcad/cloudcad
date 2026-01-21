# CAD 编辑器集成方案

## 1. 方案概述

本方案旨在将现有的 CAD 前端编辑器无缝集成到 CloudCAD 后台系统中，保持 CAD 编辑器的所有 API 接口不变，通过适配层将其与现有的用户体系、文件系统和云盘权限体系对接。

### 核心原则

1. **零改动前端**: CAD 编辑器的所有 API 调用保持不变
2. **完全兼容**: 适配层完全兼容原有的 API 接口定义
3. **权限集成**: 接入现有的 RBAC 权限体系
4. **文件统一**: 与现有文件系统模型无缝集成
5. **透明转换**: 内部实现自动转换，对外接口保持一致

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     CAD 前端编辑器                           │
│  (保持原有 API 调用，无需任何修改)                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP 请求
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  MxCAD 适配层 (新增)                         │
│  - 路由: /mxcad/*                                            │
│  - 接口兼容: 保持原有 API 格式                                │
│  - 权限验证: JWT + 项目权限检查                               │
│  - 参数转换: 原始格式 → 内部格式                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 CloudCAD 核心服务层                          │
│  - FileSystemService: 文件系统管理                           │
│  - StorageService: MinIO 存储                                │
│  - AuthService: 用户认证                                     │
│  - PermissionService: 权限管理                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据层                                  │
│  - PostgreSQL: 文件元数据、用户、权限                        │
│  - MinIO: 文件存储 (DWG, MXWEB, PDF)                        │
│  - Redis: 会话、缓存、上传状态                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

```
packages/backend/src/
├── mxcad/                          # MxCAD 适配层模块（新增）
│   ├── mxcad.module.ts             # 模块定义
│   ├── mxcad.controller.ts         # 路由控制器
│   ├── mxcad-adapter.service.ts    # 适配服务
│   ├── mxcad-upload.service.ts     # 上传服务
│   ├── mxcad-convert.service.ts    # 转换服务
│   ├── guards/
│   │   └── mxcad-auth.guard.ts     # MxCAD 专用认证守卫
│   ├── dto/
│   │   ├── chunk-exist.dto.ts      # 分片检查 DTO
│   │   ├── file-exist.dto.ts       # 文件检查 DTO
│   │   ├── upload-chunk.dto.ts     # 分片上传 DTO
│   │   └── convert.dto.ts          # 转换 DTO
│   └── interfaces/
│       └── mxcad-response.interface.ts  # 响应格式接口
```

---

## 3. API 适配映射

### 3.1 文件检查接口

#### 3.1.1 检查分片是否存在

**原始接口**: `POST /mxcad/files/chunkisExist`

**适配实现**:

```typescript
// 请求参数（保持不变）
{
  chunk: number,          // 分片索引
  fileHash: string,       // 文件 MD5
  size: number,           // 分片大小
  chunks: number,         // 总分片数
  fileName: string        // 文件名
}

// 响应格式（保持不变）
{
  ret: "chunkAlreadyExist" | "chunkNoExist"
}

// 内部实现
1. 从 Redis 获取上传会话: `upload:session:${fileHash}`
2. 检查分片记录: `upload:chunk:${fileHash}:${chunk}`
3. 如果存在且大小匹配，返回 "chunkAlreadyExist"
4. 否则返回 "chunkNoExist"
```

#### 3.1.2 检查文件是否存在

**原始接口**: `POST /mxcad/files/fileisExist`

**适配实现**:

```typescript
// 请求参数（保持不变）
{
  filename: string,       // 文件名
  fileHash: string        // 文件 MD5
}

// 响应格式（保持不变）
{
  ret: "fileAlreadyExist" | "fileNoExist"
}

// 内部实现
1. 查询 FileSystemNode 表: WHERE fileHash = ? AND fileStatus = 'COMPLETED'
2. 如果找到记录，返回 "fileAlreadyExist"（秒传）
3. 否则返回 "fileNoExist"
```

### 3.2 文件上传接口

#### 3.2.1 分片上传

**原始接口**: `POST /mxcad/files/uploadFiles`

**适配实现**:

```typescript
// 请求参数（保持不变）
Content-Type: multipart/form-data
{
  file: File,             // 文件分片
  hash: string,           // 文件 MD5
  name: string,           // 文件名
  size: number,           // 文件总大小
  chunk: number,          // 分片索引（可选）
  chunks: number          // 总分片数（可选）
}

// 响应格式（保持不变）
{
  ret: "ok" | "errorparam" | "convertFileError",
  tz?: boolean            // 可选，是否包含 tz 处理
}

// 内部实现流程
1. 权限验证
   - JWT 认证获取 userId
   - 从会话获取当前工作目录 (parentId)
   - 验证用户对 parentId 的写权限

2. 分片上传处理
   if (chunk !== undefined) {
     a. 创建/更新 UploadSession 记录
     b. 上传分片到 MinIO: `temp/${fileHash}/chunk_${chunk}`
     c. 更新 Redis: `upload:chunk:${fileHash}:${chunk}` = size
     d. 更新上传进度: uploadedParts++

     if (uploadedParts === chunks) {
       // 所有分片上传完成，触发合并
       e. 调用 MinIO ComposeObject API 合并分片
       f. 生成最终存储路径: `${projectId}/${Date.now()}-${filename}`
       g. 调用转换服务转换为 MXWEB 格式
       h. 创建 FileSystemNode 记录
       i. 清理临时分片和 Redis 记录
       j. 删除 UploadSession 记录
     }
   }

3. 完整文件上传处理
   else {
     a. 直接上传到 MinIO: `${projectId}/${Date.now()}-${filename}`
     b. 调用转换服务转换为 MXWEB 格式
     c. 创建 FileSystemNode 记录
   }

4. 返回响应
   return { ret: "ok", tz: convertResult.tz }
```

### 3.3 文件转换接口

#### 3.3.1 转换服务器文件

**原始接口**: `POST /mxcad/convert`

**适配实现**:

```typescript
// 请求参数（保持不变）
{
  param: {
    srcpath: string,          // 源文件路径
    outjpg?: string,          // 输出 JPG 参数
    async?: "true" | "false", // 是否异步
    resultposturl?: string,   // 异步回调 URL
    traceid?: string          // 追踪 ID
  }
}

// 响应格式（保持不变）
// 同步
{
  code: number,
  message: string,
  ... // 其他转换结果
}

// 异步
{
  code: 0,
  message: "aysnc calling"
}

// 内部实现
1. 权限验证
   - 从 srcpath 解析 fileId 或 fileHash
   - 验证用户对该文件的读权限

2. 调用转换服务
   if (async === "true") {
     a. 创建后台任务
     b. 立即返回 { code: 0, message: "aysnc calling" }
     c. 转换完成后 POST 到 resultposturl
   } else {
     a. 同步调用转换服务
     b. 返回转换结果
   }
```

### 3.4 其他接口

#### 3.4.1 上传外部参照

**原始接口**:

- `POST /mxcad/up_ext_reference_dwg`
- `POST /mxcad/up_ext_reference_image`

**适配实现**:

```typescript
// 请求参数（保持不变）
{
  file: File,
  src_dwgfile_hash: string,
  ext_ref_file: string
}

// 内部实现
1. 验证源文件权限
2. 创建外部参照目录: `${projectId}/${src_dwgfile_hash}/`
3. 上传文件到 MinIO
4. 创建 FileSystemNode 记录（关联到源文件）
5. 返回 { code: 0, message: "ok" }
```

#### 3.4.2 保存文件

**原始接口**:

- `POST /mxcad/savemxweb`
- `POST /mxcad/savedwg`
- `POST /mxcad/savepdf`

**适配实现**:

```typescript
// 内部实现
1. 权限验证
2. 上传文件到 MinIO
3. 必要时调用转换服务
4. 创建/更新 FileSystemNode 记录
5. 返回 { code: 0, file: filename, ret: "ok" }
```

---

## 4. 数据模型映射

### 4.1 文件存储映射

```typescript
// 原始文件存储结构
uploadPath/
├── {fileHash}.dwg              // 原始文件
├── {fileHash}.dwg.mxweb        // 转换后的 MXWEB 文件
├── {fileHash}/                 // 外部参照目录
│   ├── reference.dwg.mxweb
│   └── image.png
├── {fileHash}.json             // 状态文件
└── chunk_{fileHash}/           // 分片临时目录
    ├── 0_{fileHash}
    ├── 1_{fileHash}
    └── ...

// 映射到 CloudCAD 存储结构
MinIO Bucket: cloudcad
├── projects/
│   └── {projectId}/
│       ├── {timestamp}-{filename}.dwg
│       ├── {timestamp}-{filename}.dwg.mxweb
│       └── {fileHash}/         // 外部参照（共享）
│           ├── reference.dwg.mxweb
│           └── image.png
└── temp/
    └── {fileHash}/             // 分片临时目录
        ├── chunk_0
        ├── chunk_1
        └── ...

// FileSystemNode 记录
{
  id: "cuid",
  name: "drawing.dwg",
  originalName: "drawing.dwg",
  path: "projects/{projectId}/{timestamp}-drawing.dwg",
  fileHash: "{md5}",
  size: 1024000,
  mimeType: "application/acad",
  extension: "dwg",
  fileStatus: "COMPLETED",
  isFolder: false,
  parentId: "{folderId}",
  ownerId: "{userId}"
}
```

### 4.2 上传会话映射

```typescript
// Redis 存储结构
upload:session:{fileHash} = {
  uploadId: "minio-upload-id",
  fileName: "drawing.dwg",
  fileSize: 10485760,
  chunks: 10,
  uploadedParts: 5,
  projectId: "project-id",
  parentId: "folder-id",
  ownerId: "user-id",
  status: "UPLOADING",
  createdAt: "2025-12-18T10:00:00Z"
}

upload:chunk:{fileHash}:{chunk} = {
  size: 1048576,
  uploadedAt: "2025-12-18T10:00:00Z"
}

// PostgreSQL UploadSession 表（持久化）
{
  id: "cuid",
  uploadId: "minio-upload-id",
  storageKey: "temp/{fileHash}",
  fileName: "drawing.dwg",
  fileSize: 10485760,
  projectId: "project-id",
  parentId: "folder-id",
  ownerId: "user-id",
  status: "UPLOADING",
  totalParts: 10,
  uploadedParts: 5
}
```

---

## 5. 权限集成方案

### 5.1 权限检查流程

```typescript
// 1. JWT 认证（所有接口）
@UseGuards(JwtAuthGuard)
async uploadFile(@Request() req) {
  const userId = req.user.id;  // 从 JWT 获取用户 ID
  // ...
}

// 2. 项目权限检查
async checkProjectPermission(projectId: string, userId: string) {
  // 查询 ProjectMember 表
  const member = await prisma.projectMember.findFirst({
    where: { nodeId: projectId, userId }
  });

  if (!member) {
    throw new ForbiddenException('没有项目访问权限');
  }

  return member.role; // OWNER, ADMIN, MEMBER, VIEWER
}

// 3. 文件权限检查
async checkFilePermission(fileId: string, userId: string, action: string) {
  const file = await prisma.fileSystemNode.findUnique({
    where: { id: fileId },
    include: { parent: true }
  });

  // 文件所有者拥有所有权限
  if (file.ownerId === userId) {
    return true;
  }

  // 查找根节点（项目）
  const rootNode = await this.getRootNode(fileId);

  // 检查项目成员权限
  const member = await prisma.projectMember.findFirst({
    where: { nodeId: rootNode.id, userId }
  });

  if (!member) {
    return false;
  }

  // 权限映射
  const permissions = {
    OWNER: ['read', 'write', 'delete', 'share'],
    ADMIN: ['read', 'write', 'delete', 'share'],
    MEMBER: ['read', 'write'],
    VIEWER: ['read']
  };

  return permissions[member.role].includes(action);
}
```

### 5.2 权限矩阵

| 操作     | OWNER | ADMIN | MEMBER | VIEWER |
| -------- | ----- | ----- | ------ | ------ |
| 上传文件 | ✅    | ✅    | ✅     | ❌     |
| 下载文件 | ✅    | ✅    | ✅     | ✅     |
| 删除文件 | ✅    | ✅    | ❌     | ❌     |
| 转换文件 | ✅    | ✅    | ✅     | ✅     |
| 分享文件 | ✅    | ✅    | ❌     | ❌     |
| 修改项目 | ✅    | ✅    | ❌     | ❌     |
| 删除项目 | ✅    | ❌    | ❌     | ❌     |

---

## 6. 实现步骤

### 6.1 Phase 1: 基础适配层（第1周）

**目标**: 创建 MxCAD 适配层模块，实现基础路由和认证

**任务清单**:

1. **创建模块结构**

   ```bash
   mkdir -p packages/backend/src/mxcad/{guards,dto,interfaces}
   touch packages/backend/src/mxcad/mxcad.module.ts
   touch packages/backend/src/mxcad/mxcad.controller.ts
   touch packages/backend/src/mxcad/mxcad-adapter.service.ts
   ```

2. **实现认证守卫**
   - 创建 `mxcad-auth.guard.ts`
   - 支持 JWT 认证
   - 支持会话管理

3. **实现基础接口**
   - `POST /mxcad/files/fileisExist`
   - `POST /mxcad/files/chunkisExist`
   - `POST /mxcad/files/tz`

4. **集成到主模块**
   - 在 `app.module.ts` 中导入 `MxcadModule`
   - 配置路由前缀 `/mxcad`

### 6.2 Phase 2: 上传功能（第2周）

**目标**: 实现完整的分片上传和文件去重功能

**任务清单**:

1. **实现上传服务**
   - 创建 `mxcad-upload.service.ts`
   - 实现分片上传逻辑
   - 实现文件合并逻辑
   - 实现文件去重（基于 fileHash）

2. **实现上传接口**
   - `POST /mxcad/files/uploadFiles`（分片上传）
   - `POST /mxcad/upfile`（完整上传）

3. **Redis 会话管理**
   - 上传会话存储
   - 分片状态跟踪
   - 自动清理过期会话

4. **MinIO 集成**
   - 分片上传到临时目录
   - 合并分片（ComposeObject）
   - 移动到正式目录

### 6.3 Phase 3: 转换功能（第3周）

**目标**: 实现文件格式转换和外部参照支持

**任务清单**:

1. **实现转换服务**
   - 创建 `mxcad-convert.service.ts`
   - 集成 MxCAD 转换工具
   - 支持同步/异步转换

2. **实现转换接口**
   - `POST /mxcad/convert`
   - `POST /mxcad/savemxweb`
   - `POST /mxcad/savedwg`
   - `POST /mxcad/savepdf`
   - `POST /mxcad/print_to_pdf`

3. **外部参照支持**
   - `POST /mxcad/up_ext_reference_dwg`
   - `POST /mxcad/up_ext_reference_image`

4. **异步任务队列**
   - 使用 Bull Queue 处理异步转换
   - 回调通知机制

### 6.4 Phase 4: 高级功能（第4周）

**目标**: 实现裁剪、打印和其他高级功能

**任务清单**:

1. **实现裁剪功能**
   - `POST /mxcad/cut_dwg`
   - `POST /mxcad/cut_mxweb`

2. **实现图片上传**
   - `POST /mxcad/up_image`

3. **性能优化**
   - 文件上传限流
   - 大文件分片优化
   - 缓存策略

4. **监控和日志**
   - 上传成功率监控
   - 转换失败告警
   - 详细日志记录

### 6.5 Phase 5: 测试和文档（第5周）

**目标**: 完整测试和文档编写

**任务清单**:

1. **单元测试**
   - MxcadAdapterService 测试
   - MxcadUploadService 测试
   - MxcadConvertService 测试

2. **集成测试**
   - 完整上传流程测试
   - 权限验证测试
   - 错误处理测试

3. **E2E 测试**
   - 模拟 CAD 编辑器调用
   - 验证接口兼容性

4. **文档编写**
   - API 适配文档
   - 部署文档
   - 故障排查文档

---

## 7. 核心代码示例

### 7.1 MxCAD 适配器服务

```typescript
// packages/backend/src/mxcad/mxcad-adapter.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionService } from '../common/services/session.service';
import { FileSystemService } from '../file-system/file-system.service';
import { MxcadUploadService } from './mxcad-upload.service';
import { MxcadConvertService } from './mxcad-convert.service';

@Injectable()
export class MxcadAdapterService {
  private readonly logger = new Logger(MxcadAdapterService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly sessionService: SessionService,
    private readonly fileSystemService: FileSystemService,
    private readonly uploadService: MxcadUploadService,
    private readonly convertService: MxcadConvertService
  ) {}

  /**
   * 检查文件是否存在（秒传检查）
   */
  async checkFileExists(
    fileHash: string,
    filename: string
  ): Promise<{ ret: string }> {
    try {
      const existingFile = await this.prisma.fileSystemNode.findFirst({
        where: {
          fileHash,
          isFolder: false,
          fileStatus: 'COMPLETED',
        },
      });

      if (existingFile) {
        this.logger.log(`文件已存在（秒传）: ${filename}, hash: ${fileHash}`);
        return { ret: 'fileAlreadyExist' };
      }

      return { ret: 'fileNoExist' };
    } catch (error) {
      this.logger.error(`检查文件失败: ${error.message}`, error.stack);
      return { ret: 'fileNoExist' };
    }
  }

  /**
   * 检查分片是否存在
   */
  async checkChunkExists(
    chunk: number,
    fileHash: string,
    size: number,
    chunks: number,
    fileName: string,
    userId: string
  ): Promise<{ ret: string }> {
    try {
      // 从 Redis 检查分片状态
      const chunkKey = `upload:chunk:${fileHash}:${chunk}`;
      const chunkData = await this.sessionService.get(userId, chunkKey);

      if (chunkData) {
        const parsedData = JSON.parse(chunkData);
        if (parsedData.size === size) {
          this.logger.log(`分片已存在: ${fileName}, chunk: ${chunk}`);

          // 检查是否所有分片都已上传完成
          const uploadedChunks = await this.getUploadedChunksCount(
            fileHash,
            userId
          );
          if (uploadedChunks === chunks) {
            // 触发合并
            await this.uploadService.mergeChunks(
              fileHash,
              fileName,
              chunks,
              userId
            );
          }

          return { ret: 'chunkAlreadyExist' };
        }
      }

      return { ret: 'chunkNoExist' };
    } catch (error) {
      this.logger.error(`检查分片失败: ${error.message}`, error.stack);
      return { ret: 'chunkNoExist' };
    }
  }

  /**
   * 获取已上传分片数量
   */
  private async getUploadedChunksCount(
    fileHash: string,
    userId: string
  ): Promise<number> {
    const sessionKey = `upload:session:${fileHash}`;
    const sessionData = await this.sessionService.get(userId, sessionKey);

    if (!sessionData) {
      return 0;
    }

    const session = JSON.parse(sessionData);
    return session.uploadedParts || 0;
  }

  /**
   * 验证用户对父节点的写权限
   */
  async validateUploadPermission(
    userId: string,
    parentId?: string
  ): Promise<string> {
    // 如果没有提供 parentId，从会话获取
    let actualParentId = parentId;
    if (!actualParentId) {
      actualParentId =
        await this.sessionService.getCurrentWorkingDirectory(userId);
    }

    if (!actualParentId) {
      throw new ForbiddenException('请先选择上传目录');
    }

    // 检查节点是否存在
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: actualParentId },
      select: { id: true, isFolder: true },
    });

    if (!node) {
      throw new NotFoundException('目标目录不存在');
    }

    if (!node.isFolder) {
      throw new ForbiddenException('只能上传到文件夹');
    }

    // 检查写权限
    const hasPermission = await this.fileSystemService.checkNodeAccess(
      actualParentId,
      userId
    );

    if (!hasPermission) {
      throw new ForbiddenException('没有权限上传到此目录');
    }

    return actualParentId;
  }
}
```

### 7.2 MxCAD 上传服务

```typescript
// packages/backend/src/mxcad/mxcad-upload.service.ts

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MinioStorageProvider } from '../storage/minio-storage.provider';
import { SessionService } from '../common/services/session.service';
import { FileHashService } from '../file-system/file-hash.service';
import { MxcadConvertService } from './mxcad-convert.service';

@Injectable()
export class MxcadUploadService {
  private readonly logger = new Logger(MxcadUploadService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storage: MinioStorageProvider,
    private readonly sessionService: SessionService,
    private readonly fileHashService: FileHashService,
    private readonly convertService: MxcadConvertService
  ) {}

  /**
   * 处理分片上传
   */
  async uploadChunk(
    file: Express.Multer.File,
    chunk: number,
    chunks: number,
    fileHash: string,
    fileName: string,
    fileSize: number,
    userId: string,
    parentId: string
  ): Promise<{ ret: string; tz?: boolean }> {
    try {
      // 1. 上传分片到 MinIO 临时目录
      const chunkKey = `temp/${fileHash}/chunk_${chunk}`;
      await this.storage.uploadFile(chunkKey, file.buffer);

      // 2. 记录分片状态到 Redis
      const chunkDataKey = `upload:chunk:${fileHash}:${chunk}`;
      await this.sessionService.set(
        userId,
        chunkDataKey,
        JSON.stringify({ size: file.size, uploadedAt: new Date() }),
        3600 * 24 // 24小时过期
      );

      // 3. 更新上传会话
      await this.updateUploadSession(
        fileHash,
        fileName,
        fileSize,
        chunks,
        userId,
        parentId
      );

      // 4. 检查是否所有分片都已上传
      const session = await this.getUploadSession(fileHash, userId);
      if (session.uploadedParts === chunks) {
        // 所有分片上传完成，触发合并和转换
        return await this.mergeChunks(fileHash, fileName, chunks, userId);
      }

      return { ret: 'ok' };
    } catch (error) {
      this.logger.error(`分片上传失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 合并分片
   */
  async mergeChunks(
    fileHash: string,
    fileName: string,
    chunks: number,
    userId: string
  ): Promise<{ ret: string; tz?: boolean }> {
    try {
      this.logger.log(`开始合并分片: ${fileName}, 总分片数: ${chunks}`);

      // 1. 获取上传会话
      const session = await this.getUploadSession(fileHash, userId);

      // 2. 构建分片列表
      const chunkKeys: string[] = [];
      for (let i = 0; i < chunks; i++) {
        chunkKeys.push(`temp/${fileHash}/chunk_${i}`);
      }

      // 3. 使用 MinIO ComposeObject 合并分片
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      const finalKey = `projects/${session.parentId}/${Date.now()}-${fileName}`;

      await this.storage.composeObjects(chunkKeys, finalKey);
      this.logger.log(`分片合并成功: ${finalKey}`);

      // 4. 调用转换服务
      const convertResult = await this.convertService.convertFile(
        finalKey,
        fileHash,
        fileName
      );

      // 5. 创建 FileSystemNode 记录
      await this.prisma.fileSystemNode.create({
        data: {
          name: fileName,
          originalName: fileName,
          isFolder: false,
          isRoot: false,
          parentId: session.parentId,
          extension,
          mimeType: this.getMimeType(extension),
          size: session.fileSize,
          path: finalKey,
          fileHash,
          fileStatus: 'COMPLETED',
          ownerId: userId,
        },
      });

      // 6. 清理临时文件和会话
      await this.cleanupUpload(fileHash, chunkKeys, userId);

      this.logger.log(`文件上传完成: ${fileName}`);
      return { ret: 'ok', tz: convertResult.tz };
    } catch (error) {
      this.logger.error(`合并分片失败: ${error.message}`, error.stack);
      return { ret: 'convertFileError' };
    }
  }

  /**
   * 更新上传会话
   */
  private async updateUploadSession(
    fileHash: string,
    fileName: string,
    fileSize: number,
    chunks: number,
    userId: string,
    parentId: string
  ): Promise<void> {
    const sessionKey = `upload:session:${fileHash}`;
    const existingSession = await this.sessionService.get(userId, sessionKey);

    let session: any;
    if (existingSession) {
      session = JSON.parse(existingSession);
      session.uploadedParts++;
    } else {
      session = {
        fileName,
        fileSize,
        chunks,
        uploadedParts: 1,
        parentId,
        ownerId: userId,
        status: 'UPLOADING',
        createdAt: new Date(),
      };
    }

    await this.sessionService.set(
      userId,
      sessionKey,
      JSON.stringify(session),
      3600 * 24 // 24小时过期
    );

    // 同时更新数据库记录（持久化）
    await this.prisma.uploadSession.upsert({
      where: { uploadId: fileHash },
      create: {
        uploadId: fileHash,
        storageKey: `temp/${fileHash}`,
        fileName,
        fileSize,
        parentId,
        ownerId: userId,
        status: 'UPLOADING',
        totalParts: chunks,
        uploadedParts: session.uploadedParts,
      },
      update: {
        uploadedParts: session.uploadedParts,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 获取上传会话
   */
  private async getUploadSession(
    fileHash: string,
    userId: string
  ): Promise<any> {
    const sessionKey = `upload:session:${fileHash}`;
    const sessionData = await this.sessionService.get(userId, sessionKey);

    if (!sessionData) {
      throw new BadRequestException('上传会话不存在');
    }

    return JSON.parse(sessionData);
  }

  /**
   * 清理上传临时文件
   */
  private async cleanupUpload(
    fileHash: string,
    chunkKeys: string[],
    userId: string
  ): Promise<void> {
    try {
      // 1. 删除 MinIO 临时分片
      for (const key of chunkKeys) {
        try {
          await this.storage.deleteFile(key);
        } catch (error) {
          this.logger.warn(`删除临时分片失败: ${key}`);
        }
      }

      // 2. 清理 Redis 会话
      const sessionKey = `upload:session:${fileHash}`;
      await this.sessionService.delete(userId, sessionKey);

      // 清理分片记录
      for (let i = 0; i < chunkKeys.length; i++) {
        const chunkKey = `upload:chunk:${fileHash}:${i}`;
        await this.sessionService.delete(userId, chunkKey);
      }

      // 3. 删除数据库上传会话记录
      await this.prisma.uploadSession.delete({
        where: { uploadId: fileHash },
      });

      this.logger.log(`清理上传临时文件完成: ${fileHash}`);
    } catch (error) {
      this.logger.error(`清理上传临时文件失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      dwg: 'application/acad',
      dxf: 'application/dxf',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }
}
```

### 7.3 MxCAD 控制器

```typescript
// packages/backend/src/mxcad/mxcad.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MxcadAdapterService } from './mxcad-adapter.service';
import { MxcadUploadService } from './mxcad-upload.service';
import { MxcadConvertService } from './mxcad-convert.service';
import { ChunkExistDto } from './dto/chunk-exist.dto';
import { FileExistDto } from './dto/file-exist.dto';

@Controller('mxcad')
@UseGuards(JwtAuthGuard)
@ApiTags('MxCAD 适配层')
@ApiBearerAuth()
export class MxcadController {
  private readonly logger = new Logger(MxcadController.name);

  constructor(
    private readonly adapterService: MxcadAdapterService,
    private readonly uploadService: MxcadUploadService,
    private readonly convertService: MxcadConvertService
  ) {}

  /**
   * 检查文件是否存在（秒传）
   */
  @Post('files/fileisExist')
  async checkFileExists(@Body() dto: FileExistDto) {
    return this.adapterService.checkFileExists(dto.fileHash, dto.filename);
  }

  /**
   * 检查分片是否存在
   */
  @Post('files/chunkisExist')
  async checkChunkExists(@Body() dto: ChunkExistDto, @Request() req) {
    return this.adapterService.checkChunkExists(
      dto.chunk,
      dto.fileHash,
      dto.size,
      dto.chunks,
      dto.fileName,
      req.user.id
    );
  }

  /**
   * 上传文件（支持分片）
   */
  @Post('files/uploadFiles')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    const userId = req.user.id;

    // 验证上传权限并获取父节点 ID
    const parentId = await this.adapterService.validateUploadPermission(
      userId,
      body.parentId
    );

    // 分片上传
    if (body.chunk !== undefined) {
      return this.uploadService.uploadChunk(
        file,
        parseInt(body.chunk),
        parseInt(body.chunks),
        body.hash,
        body.name,
        parseInt(body.size),
        userId,
        parentId
      );
    }

    // 完整文件上传
    return this.uploadService.uploadCompleteFile(
      file,
      body.hash,
      body.name,
      parseInt(body.size),
      userId,
      parentId
    );
  }

  /**
   * 转换服务器文件
   */
  @Post('convert')
  async convertFile(@Body() body: any, @Request() req) {
    const param =
      typeof body.param === 'string' ? JSON.parse(body.param) : body.param;

    return this.convertService.convertServerFile(param, req.user.id);
  }

  /**
   * 上传并转换文件
   */
  @Post('upfile')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAndConvert(
    @UploadedFile() file: Express.Multer.File,
    @Request() req
  ) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    return this.uploadService.uploadAndConvert(file, userId, parentId);
  }

  /**
   * 上传外部参照 DWG
   */
  @Post('up_ext_reference_dwg')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExtReferenceDwg(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    return this.uploadService.uploadExtReference(
      file,
      body.src_dwgfile_hash,
      body.ext_ref_file,
      'dwg',
      req.user.id
    );
  }

  /**
   * 上传外部参照图片
   */
  @Post('up_ext_reference_image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExtReferenceImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    return this.uploadService.uploadExtReference(
      file,
      body.src_dwgfile_hash,
      body.ext_ref_file,
      'image',
      req.user.id
    );
  }

  /**
   * 保存 MXWEB
   */
  @Post('savemxweb')
  @UseInterceptors(FileInterceptor('file'))
  async saveMxweb(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    return this.uploadService.saveFile(file, 'mxweb', userId, parentId);
  }

  /**
   * 保存 DWG
   */
  @Post('savedwg')
  @UseInterceptors(FileInterceptor('file'))
  async saveDwg(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    return this.uploadService.saveDwg(file, userId, parentId);
  }

  /**
   * 保存 PDF
   */
  @Post('savepdf')
  @UseInterceptors(FileInterceptor('file'))
  async savePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    const param =
      typeof body.param === 'string'
        ? JSON.parse(body.param)
        : body.param || { width: '2000', height: '2000', colorPolicy: 'mono' };

    return this.uploadService.savePdf(file, param, userId, parentId);
  }

  /**
   * 打印为 PDF
   */
  @Post('print_to_pdf')
  @UseInterceptors(FileInterceptor('file'))
  async printToPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    const param =
      typeof body.param === 'string' ? JSON.parse(body.param) : body.param;

    if (!param) {
      return { ret: 'failed', code: -1, message: 'param error' };
    }

    return this.convertService.printToPdf(file, param, userId, parentId);
  }

  /**
   * 裁剪 DWG
   */
  @Post('cut_dwg')
  @UseInterceptors(FileInterceptor('file'))
  async cutDwg(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    const param =
      typeof body.param === 'string' ? JSON.parse(body.param) : body.param;

    if (!param) {
      return { ret: 'failed', code: -1, message: 'param error' };
    }

    return this.convertService.cutDwg(file, param, userId, parentId);
  }

  /**
   * 裁剪 MXWEB
   */
  @Post('cut_mxweb')
  @UseInterceptors(FileInterceptor('file'))
  async cutMxweb(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req
  ) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    const param =
      typeof body.param === 'string' ? JSON.parse(body.param) : body.param;

    if (!param) {
      return { ret: 'failed', code: -1, message: 'param error' };
    }

    return this.convertService.cutMxweb(file, param, userId, parentId);
  }

  /**
   * 上传图片
   */
  @Post('up_image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const userId = req.user.id;
    const parentId = await this.adapterService.validateUploadPermission(userId);

    return this.uploadService.uploadImage(file, userId, parentId);
  }
}
```

---

## 8. 配置和部署

### 8.1 环境变量配置

```bash
# packages/backend/.env

# MxCAD 配置
MXCAD_APP_PATH=/path/to/mxcad/app
MXCAD_BIN_PATH=/path/to/mxcad/bin
MXCAD_UPLOAD_PATH=/path/to/upload
MXCAD_STATIC_RES_DIR=/static/mxcad

# 文件上传限制
MAX_FILE_SIZE=524288000  # 500MB
MAX_CHUNK_SIZE=5242880   # 5MB
UPLOAD_SESSION_TTL=86400 # 24小时

# 转换服务
CONVERT_TIMEOUT=300000   # 5分钟
ASYNC_CONVERT_QUEUE=mxcad-convert

```

### 8.2 Nginx 配置

```nginx
# 上传文件大小限制
client_max_body_size 500M;

# MxCAD 路由
location /mxcad/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;

    # 超时设置
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
}
```

---

## 9. 监控和维护

### 9.1 关键指标监控

```typescript
// 上传成功率
const uploadSuccessRate = (successCount / totalCount) * 100;

// 平均上传时间
const avgUploadTime = totalUploadTime / successCount;

// 转换成功率
const convertSuccessRate = (convertSuccessCount / totalConvertCount) * 100;

// 存储使用率
const storageUsage = (usedSpace / totalSpace) * 100;
```

### 9.2 定时清理任务

```typescript
// packages/backend/src/mxcad/mxcad-cleanup.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { MinioStorageProvider } from '../storage/minio-storage.provider';

@Injectable()
export class MxcadCleanupService {
  private readonly logger = new Logger(MxcadCleanupService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storage: MinioStorageProvider
  ) {}

  /**
   * 清理过期的上传会话（每小时执行）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions() {
    try {
      const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前

      // 查找过期的上传会话
      const expiredSessions = await this.prisma.uploadSession.findMany({
        where: {
          status: { in: ['INITIATED', 'UPLOADING'] },
          createdAt: { lt: expiredTime },
        },
      });

      this.logger.log(`发现 ${expiredSessions.length} 个过期上传会话`);

      // 清理临时文件和数据库记录
      for (const session of expiredSessions) {
        try {
          // 删除临时分片
          const prefix = `temp/${session.uploadId}/`;
          await this.storage.deleteFolder(prefix);

          // 删除数据库记录
          await this.prisma.uploadSession.delete({
            where: { id: session.id },
          });

          this.logger.log(`清理过期会话: ${session.uploadId}`);
        } catch (error) {
          this.logger.error(
            `清理会话失败: ${session.uploadId}, ${error.message}`
          );
        }
      }
    } catch (error) {
      this.logger.error(`清理过期会话任务失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 清理孤立的临时文件（每天执行）
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOrphanedTempFiles() {
    try {
      this.logger.log('开始清理孤立的临时文件');

      // 列出所有临时目录
      const tempFolders = await this.storage.listFolders('temp/');

      for (const folder of tempFolders) {
        // 检查是否有对应的上传会话
        const fileHash = folder.replace('temp/', '').replace('/', '');
        const session = await this.prisma.uploadSession.findFirst({
          where: { uploadId: fileHash },
        });

        if (!session) {
          // 孤立文件，删除
          await this.storage.deleteFolder(folder);
          this.logger.log(`清理孤立临时文件: ${folder}`);
        }
      }

      this.logger.log('孤立临时文件清理完成');
    } catch (error) {
      this.logger.error(`清理孤立文件失败: ${error.message}`, error.stack);
    }
  }
}
```

---

## 10. 测试策略

### 10.1 单元测试示例

```typescript
// packages/backend/src/mxcad/mxcad-adapter.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { MxcadAdapterService } from './mxcad-adapter.service';
import { DatabaseService } from '../database/database.service';
import { SessionService } from '../common/services/session.service';

describe('MxcadAdapterService', () => {
  let service: MxcadAdapterService;
  let prisma: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxcadAdapterService,
        {
          provide: DatabaseService,
          useValue: {
            fileSystemNode: {
              findFirst: jest.fn(),
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MxcadAdapterService>(MxcadAdapterService);
    prisma = module.get<DatabaseService>(DatabaseService);
  });

  describe('checkFileExists', () => {
    it('应该返回文件已存在', async () => {
      jest.spyOn(prisma.fileSystemNode, 'findFirst').mockResolvedValue({
        id: '1',
        fileHash: 'abc123',
        fileStatus: 'COMPLETED',
      } as any);

      const result = await service.checkFileExists('abc123', 'test.dwg');
      expect(result.ret).toBe('fileAlreadyExist');
    });

    it('应该返回文件不存在', async () => {
      jest.spyOn(prisma.fileSystemNode, 'findFirst').mockResolvedValue(null);

      const result = await service.checkFileExists('abc123', 'test.dwg');
      expect(result.ret).toBe('fileNoExist');
    });
  });
});
```

### 10.2 E2E 测试示例

```typescript
// packages/backend/test/mxcad.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MxCAD API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // 登录获取 token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/mxcad/files/fileisExist (POST)', () => {
    it('应该检查文件是否存在', () => {
      return request(app.getHttpServer())
        .post('/mxcad/files/fileisExist')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'test.dwg',
          fileHash: 'abc123',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('ret');
          expect(['fileAlreadyExist', 'fileNoExist']).toContain(res.body.ret);
        });
    });
  });

  describe('/mxcad/files/uploadFiles (POST)', () => {
    it('应该上传文件', () => {
      return request(app.getHttpServer())
        .post('/mxcad/files/uploadFiles')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test content'), 'test.dwg')
        .field('hash', 'abc123')
        .field('name', 'test.dwg')
        .field('size', '12')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('ret');
          expect(res.body.ret).toBe('ok');
        });
    });
  });
});
```

---

## 11. 故障排查

### 11.1 常见问题

| 问题           | 原因                | 解决方案                                    |
| -------------- | ------------------- | ------------------------------------------- |
| 分片上传失败   | Redis 会话丢失      | 增加 Redis 持久化，使用 PostgreSQL 备份会话 |
| 文件转换超时   | 大文件转换时间过长  | 增加超时时间，使用异步转换                  |
| 权限验证失败   | JWT 过期或无效      | 刷新 token，检查认证配置                    |
| MinIO 连接失败 | 网络问题或配置错误  | 检查 MinIO 服务状态和配置                   |
| 文件去重失败   | fileHash 计算不一致 | 统一使用 SHA-256 算法                       |

### 11.2 日志级别

```typescript
// 开发环境
LOG_LEVEL = debug;

// 生产环境
LOG_LEVEL = info;

// 关键操作日志
this.logger.log(`[uploadChunk] 用户 ${userId} 上传分片 ${chunk}/${chunks}`);
this.logger.error(`[mergeChunks] 合并失败: ${error.message}`, error.stack);
this.logger.warn(`[cleanupUpload] 清理临时文件失败: ${key}`);
```

---

## 12. 总结

本集成方案的核心优势：

1. **零改动前端**: CAD 编辑器无需任何修改
2. **完全兼容**: 所有原有 API 接口保持不变
3. **权限集成**: 完整接入现有 RBAC 权限体系
4. **文件统一**: 与 FileSystemNode 模型无缝集成
5. **性能优化**: 分片上传、文件去重、异步转换
6. **易于维护**: 清晰的模块划分和完善的日志

### 下一步行动

1. **第1周**: 创建基础适配层模块
2. **第2周**: 实现上传功能
3. **第3周**: 实现转换功能
4. **第4周**: 实现高级功能
5. **第5周**: 测试和文档

预计 **5周** 完成完整集成，确保 CAD 编辑器与 CloudCAD 后台无缝对接。
