# 上传模块替换方案：@tus/server + Uppy

## 概述

本方案将现有的自定义分片上传模块（MxcadChunkModule + MxcadUploadModule）替换为基于 **tus 协议** 的标准方案：
- **后端**: `@tus/server` - 符合 tus 协议标准的文件上传服务器
- **前端**: `Uppy` - 强大的文件上传库，原生支持 tus 协议

## 当前模块架构分析

### 现有模块结构

```
MxcadChunkModule (apps/backend/src/mxcad/chunk/)
├── mxcad-chunk.module.ts       # 模块定义
├── chunk-upload.service.ts     # 分片上传核心服务
└── file-check.service.ts       # 文件存在性检查

MxcadUploadModule (apps/backend/src/mxcad/upload/)
├── mxcad-upload.module.ts              # 模块定义
├── file-merge.service.ts               # 分片合并+最终存储
├── file-conversion-upload.service.ts   # 上传+转换一体化
├── upload-utility.service.ts           # 上传辅助工具
└── chunk-upload-manager.service.ts     # 分片上传状态管理

UploadOrchestrator (apps/backend/src/mxcad/facade/)
└── upload.orchestrator.ts              # 上传流程编排
```

### 现有功能映射

| 功能 | 当前实现 | tus 替代方案 |
|------|----------|-------------|
| 分片上传 | ChunkUploadService.uploadChunk() | @tus/server 自动处理 |
| 分片存在检查 | ChunkUploadService.checkChunkExists() | tus HEAD 请求 |
| 分片合并 | ChunkUploadService.mergeChunks() | @tus/server finish 事件 |
| 断点续传 | 自定义实现 | tus 协议原生支持 |
| 并发控制 | ChunkUploadManagerService | Uppy 配置 |
| 文件存在性检查 | FileCheckService | tus 协议 + 自定义检查 |

---

## 迁移方案详细清单

### 一、需要删除的文件

#### 1. MxcadChunkModule 相关
```
apps/backend/src/mxcad/chunk/mxcad-chunk.module.ts
apps/backend/src/mxcad/chunk/chunk-upload.service.ts
apps/backend/src/mxcad/chunk/file-check.service.ts
```

#### 2. MxcadUploadModule 相关
```
apps/backend/src/mxcad/upload/mxcad-upload.module.ts
apps/backend/src/mxcad/upload/chunk-upload-manager.service.ts
```

#### 3. 相关 DTO 和类型
```
apps/backend/src/mxcad/dto/chunk-exist-response.dto.ts
apps/backend/src/mxcad/dto/check-chunk-exist.dto.ts
apps/backend/src/mxcad/services/file-upload-manager.types.ts
```

#### 4. 上传控制器（需重构）
```
apps/backend/src/mxcad/mxcad.controller.ts  # 需移除分片上传相关端点
```

---

### 二、需要修改的文件

#### 1. 主模块配置

**文件**: `apps/backend/src/mxcad/mxcad.module.ts`

**修改内容**:
- 移除 `MxcadChunkModule` 和 `MxcadUploadModule` 的导入
- 添加 `TusModule`（新建）的导入

#### 2. 核心模块配置

**文件**: `apps/backend/src/mxcad/core/mxcad-core.module.ts`

**修改内容**:
- 移除与分片上传相关的模块依赖

#### 3. Facade 模块配置

**文件**: `apps/backend/src/mxcad/facade/mxcad-facade.module.ts`

**修改内容**:
- 移除 `UploadOrchestrator` 的导入和注册（或将其重构为 tus 事件处理器）

#### 4. 上传控制器

**文件**: `apps/backend/src/mxcad/mxcad.controller.ts`

**修改内容**:
- 删除以下端点：
  - `POST /api/v1/mxcad/upload/check-chunk-exist`
  - `POST /api/v1/mxcad/upload/chunk`
  - `POST /api/v1/mxcad/upload/merge`
- 保留/修改以下端点：
  - `POST /api/v1/mxcad/upload/check-file-exist` - 保留，用于秒传检查
  - `POST /api/v1/mxcad/upload/file` - 重构为处理上传完成后的业务逻辑

#### 5. FileMergeService

**文件**: `apps/backend/src/mxcad/upload/file-merge.service.ts`

**修改内容**:
- 删除 `mergeChunksWithPermission` 方法（分片合并由 tus 处理）
- 保留 `mergeConvertFile` 方法，改为在 tus finish 事件中调用
- 保留 `performFileExistenceCheck` 方法（用于秒传）

#### 6. FileConversionUploadService

**文件**: `apps/backend/src/mxcad/upload/file-conversion-upload.service.ts`

**修改内容**:
- 删除 `uploadAndConvertFile` 方法（由 tus 事件触发）
- 保留 `uploadAndConvertFileWithPermission` 和 `checkFileExist` 方法
- 重构为 tus 事件处理器

#### 7. UploadUtilityService

**文件**: `apps/backend/src/mxcad/upload/upload-utility.service.ts`

**修改内容**:
- 保留现有辅助方法，无重大变化

---

### 三、需要新增的文件

#### 1. TusModule - tus 服务器模块

**文件**: `apps/backend/src/mxcad/tus/tus.module.ts`

```typescript
@Module({
  imports: [ConfigModule, StorageModule],
  providers: [TusService, TusEventHandler],
  exports: [TusService],
})
export class TusModule {}
```

#### 2. TusService - tus 服务器服务

**文件**: `apps/backend/src/mxcad/tus/tus.service.ts`

**职责**:
- 配置和启动 @tus/server
- 处理 tus 协议的各种事件（create、upload、finish 等）

#### 3. TusEventHandler - tus 事件处理器

**文件**: `apps/backend/src/mxcad/tus/tus-event-handler.service.ts`

**职责**:
- 监听 tus 的 `finish` 事件
- 调用 FileMergeService 进行文件转换和节点创建
- 处理上传完成后的业务逻辑

#### 4. TusController - tus API 控制器

**文件**: `apps/backend/src/mxcad/tus/tus.controller.ts`

**职责**:
- 暴露 tus 协议端点（POST /files, PATCH /files/:id, HEAD /files/:id, DELETE /files/:id）
- 处理 CORS 和权限验证

#### 5. TusConfig - tus 配置

**文件**: `apps/backend/src/mxcad/tus/tus.config.ts`

**职责**:
- tus 服务器配置（存储位置、最大文件大小、超时时间等）

---

### 四、新代码接入点

#### 1. 后端接入点

| 接入点 | 文件路径 | 描述 |
|--------|----------|------|
| TusModule 注册 | `apps/backend/src/mxcad/mxcad.module.ts` | 添加 TusModule 到 imports |
| TusController 路由 | `apps/backend/src/mxcad/tus/tus.controller.ts` | 注册 tus 协议端点 |
| Finish 事件处理 | `apps/backend/src/mxcad/tus/tus-event-handler.service.ts` | 处理上传完成后的业务逻辑 |
| 秒传检查 | `apps/backend/src/mxcad/mxcad.controller.ts` | 保留现有检查接口 |

#### 2. 前端接入点

| 接入点 | 描述 |
|--------|------|
| Uppy 初始化 | 配置 Uppy 实例，指定 tus 端点 |
| 文件选择 | 使用 Uppy Dashboard 组件 |
| 上传进度 | Uppy 自动处理进度显示 |
| 错误处理 | Uppy 事件监听 |
| 秒传检测 | 前端先调用检查接口 |

---

## 迁移步骤

### 阶段 1：准备阶段

1. 安装依赖：
   ```bash
   pnpm add @tus/server @tus/s3-store @tus/file-store
   ```

2. 创建 TusModule 相关文件（参考三、需要新增的文件）

### 阶段 2：后端集成

1. 注册 TusModule 到 MxcadModule
2. 配置 TusController 路由
3. 实现 TusEventHandler，关联现有业务逻辑（文件转换、节点创建）

### 阶段 3：前端集成

1. 安装 Uppy 依赖：
   ```bash
   pnpm add @uppy/core @uppy/dashboard @uppy/tus @uppy/react
   ```

2. 替换现有上传组件为 Uppy Dashboard

### 阶段 4：逐步替换

1. 保留旧上传端点，新增 tus 端点（双轨运行）
2. 前端逐步迁移到 Uppy
3. 验证功能正确性

### 阶段 5：清理阶段

1. 删除旧的分片上传相关文件
2. 移除旧上传端点
3. 更新文档和测试

---

## API 端点变更

### 旧端点（待删除）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/mxcad/upload/check-chunk-exist` | 检查分片是否存在 |
| POST | `/api/v1/mxcad/upload/chunk` | 上传分片 |
| POST | `/api/v1/mxcad/upload/merge` | 合并分片 |

### 新端点（tus 协议）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/files` | 创建上传会话（tus） |
| PATCH | `/api/v1/files/:id` | 上传分片数据（tus） |
| HEAD | `/api/v1/files/:id` | 检查上传状态（tus） |
| DELETE | `/api/v1/files/:id` | 取消上传（tus） |

### 保留端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/mxcad/upload/check-file-exist` | 秒传检查 |

---

## 注意事项

### 1. 文件存储路径

tus 上传的文件需要存储到临时目录，finish 事件触发后再移动到最终位置。

### 2. 并发控制

tus 协议原生支持断点续传，无需额外的并发控制逻辑。

### 3. 权限验证

需要在 TusController 中添加权限验证中间件，确保只有授权用户可以上传文件。

### 4. 文件大小限制

在 tus 配置中设置 `maxFileSize`，同时在前端 Uppy 中也设置相同限制。

### 5. 兼容性

tus 协议与现有自定义协议不兼容，需要前端同步升级。

---

## 代码示例

### TusService 核心逻辑

```typescript
import { createServer } from '@tus/server';
import { FileStore } from '@tus/file-store';

@Injectable()
export class TusService {
  private server: any;

  constructor(private readonly configService: ConfigService) {}

  async init() {
    const store = new FileStore({
      directory: this.configService.get('mxcadTempPath'),
    });

    this.server = createServer({
      path: '/api/v1/files',
      store,
      async onUploadFinish(req, res, upload) {
        // 调用 TusEventHandler 处理完成后的业务逻辑
      },
    });
  }

  getServer() {
    return this.server;
  }
}
```

### Uppy 前端配置

```typescript
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import Tus from '@uppy/tus';

const uppy = new Uppy({
  debug: true,
  autoProceed: false,
  restrictions: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
})
  .use(Dashboard, {
    inline: true,
    target: '#uppy-dashboard',
  })
  .use(Tus, {
    endpoint: '/api/v1/files',
    retryDelays: [0, 1000, 3000, 5000],
  });

uppy.on('upload-success', (file, response) => {
  console.log('Upload successful:', file.name);
  // 处理上传成功后的逻辑
});
```

---

## 测试要点

1. **分片上传测试**：验证大文件分片上传功能
2. **断点续传测试**：中断上传后重新上传
3. **秒传测试**：上传已存在的文件
4. **并发上传测试**：多个文件同时上传
5. **权限测试**：未授权用户无法上传
6. **文件转换测试**：CAD 文件上传后自动转换