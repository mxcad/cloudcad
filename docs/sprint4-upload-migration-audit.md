
# Sprint 4 上传模块迁移审计报告

> **审计时间**: 2026-05-03  
> **审计人**: Trea  
> **审计目标**: 为前端 Uppy 集成做准备，审计现有上传模块和后端 Tus 端点

---

## 目录

1. [后端 Tus 端点审计](#后端-tus-端点审计)
2. [前端现有上传实现审计](#前端现有上传实现审计)
3. [Uppy 迁移方案](#uppy-迁移方案)
4. [实施计划](#实施计划)

---

## 后端 Tus 端点审计

### 1. Tus 模块基本信息

**位置**: `apps/backend/src/mxcad/tus/`

**模块文件**:
- `tus.module.ts` - Tus 模块定义
- `tus.service.ts` - Tus 服务实现
- `tus-event-handler.service.ts` - Tus 事件处理器

**当前状态**: ✅ 模块已创建，但**未挂载到 Express**

### 2. Tus 端点完整 URL 路径

根据 `tus.service.ts` 中的配置：

```typescript
this.server = createServer({
  path: '/api/v1/files',
  store,
  maxFileSize,
  async onUploadFinish(req, res, upload) {
    // ...
  },
});
```

**Tus 端点路径**:

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/files` | 创建上传会话 |
| PATCH | `/api/v1/files/:id` | 上传分片数据 |
| HEAD | `/api/v1/files/:id` | 检查上传状态 |
| DELETE | `/api/v1/files/:id` | 取消上传 |

### 3. 认证要求分析

**重要发现**: ⚠️ **Tus 端点目前没有认证保护**

- `JwtStrategyExecutor` 是应用级 Guard，但 Tus 服务器是直接挂载到 Express 的
- 需要在 Tus 中间件之前添加认证检查
- **建议**: 参考项目现有的 JWT 认证机制，为 Tus 端点添加认证

**参考**: 现有认证实现位于 `apps/backend/src/auth/`

### 4. 上传完成后转换任务触发

**当前状态**: ⚠️ `TusEventHandler` 已创建，但业务逻辑未实现

`tus-event-handler.service.ts` 中的 `handleUploadFinish` 方法：

```typescript
async handleUploadFinish(
  uploadId: string,
  filePath: string,
  metadata: Record<string, string>
): Promise<void> {
  const filename = metadata.filename || 'unknown';
  this.logger.log(`处理上传完成事件: uploadId=${uploadId}, filename=${filename}`);

  try {
    // TODO: 在后续实现中，此处将调用 FileMergeService 和 FileConversionService
    // 进行文件转换、节点创建等业务逻辑
    this.logger.log(`上传文件暂存路径: ${filePath}`);
    this.logger.log(`上传元数据: ${JSON.stringify(metadata)}`);

    // 验证文件是否存在
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) {
      this.logger.error(`上传文件不存在: ${filePath}`);
      return;
    }

    this.logger.log(`上传完成处理成功: uploadId=${uploadId}, filename=${filename}`);
  } catch (error) {
    this.logger.error(
      `处理上传完成事件失败: uploadId=${uploadId}, error=${(error as Error).message}`,
      (error as Error).stack,
    );
  }
}
```

**需要调用的服务**:
1. `FileMergeService` - 文件合并
2. `FileConversionService` - CAD 文件转换（DWG/DXF → MXWeb）
3. 文件系统节点创建服务

### 5. 分片上传元数据要求

**需要通过 Tus metadata 传递的信息**:

| 元数据字段 | 说明 | 是否必需 |
|-----------|------|---------|
| `filename` | 原始文件名 | ✅ 是 |
| `fileHash` | 文件 MD5 哈希（用于秒传） | ✅ 是 |
| `fileSize` | 文件大小（字节） | ✅ 是 |
| `nodeId` | 上传目标节点 ID（项目/文件夹） | ✅ 是 |
| `conflictStrategy` | 文件冲突策略: skip/overwrite/rename | ❌ 否 |
| `fileType` | 文件类型: dwg/dxf/mxweb | ❌ 否 |

**参考现有实现**: 见 `apps/frontend/src/utils/mxcadUploadUtils.ts`

### 6. Tus 模块挂载问题

**当前问题**: Tus 服务器已创建，但**未挂载到 Express 应用**

需要在 `main.ts` 或 `mxcad.module.ts` 中添加挂载逻辑：

```typescript
// 伪代码示例
const tusService = app.get(TusService);
app.use(tusService.getServer().handle.bind(tusService.getServer()));
```

---

## 前端现有上传实现审计

### 1. WebUploader 依赖检查

**重要发现**: ✅ **项目未使用 WebUploader**

代码搜索 `webuploader` 在 `apps/frontend/src/` 中**无匹配结果**。

### 2. 当前上传实现架构

**核心上传流程**:

```
MxCadUploader.tsx (组件层)
    ↓
useMxCadUploadNative.ts (自定义 Hook)
    ↓
mxcadUploadUtils.ts (上传工具函数)
    ↓
mxcadApi.ts (API 调用层)
```

### 3. 相关文件清单

| 文件 | 位置 | 功能 |
|------|------|------|
| `MxCadUploader.tsx` | `apps/frontend/src/components/` | 上传 UI 组件 |
| `useMxCadUploadNative.ts` | `apps/frontend/src/hooks/` | 上传逻辑 Hook |
| `mxcadUploadUtils.ts` | `apps/frontend/src/utils/` | 分片上传工具函数 |
| `hashUtils.ts` | `apps/frontend/src/utils/` | MD5 哈希计算（使用 SparkMD5） |
| `mxcadApi.ts` | `apps/frontend/src/services/` | MxCAD API 封装 |
| `mxcadManager.ts` | `apps/frontend/src/services/` | 上传后文件打开逻辑 |

### 4. MxCadUploader.tsx 完整依赖关系

**依赖分析**:

```typescript
import { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useMxCadUploadNative, LoadFileParam } from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { useUIStore } from '../stores/uiStore';
import { openUploadedFile } from '../services/mxcadManager';
```

**Props 接口**:

```typescript
interface MxCadUploaderProps {
  nodeId?: string | (() => string);        // 上传目标节点 ID
  onSuccess?: (param: LoadFileParam) => void;  // 成功回调
  onError?: (error: string) => void;       // 失败回调
  showProgress?: boolean;                  // 是否显示进度
  buttonText?: string;                     // 按钮文字
  buttonClassName?: string;                // 按钮样式类
  onExternalReferenceSuccess?: () => void; // 外部参照成功回调
  onExternalReferenceSkip?: () => void;    // 外部参照跳过回调
  enableExternalReferenceCheck?: boolean;  // 是否启用外部参照检查
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;  // 触发上传方法
}
```

### 5. 当前分片上传流程分析

**核心逻辑** (来自 `mxcadUploadUtils.ts`):

```
1. calculateFileHash(file) → MD5 哈希
   ↓
2. checkFileExist() → 秒传检查
   ├─ 已存在 → 直接返回
   └─ 不存在 → 继续
   ↓
3. 分片循环 (chunkSize = 5MB)
   ├─ checkChunkExist() → 检查分片是否已上传
   ├─ 已存在 → 跳过，更新进度
   └─ 不存在 → uploadChunk() → 上传分片
   ↓
4. 所有分片完成 → 后端自动合并 (最后一个分片响应包含 nodeId)
```

**关键配置**:
- 分片大小: **5MB**
- 最大文件大小: **100MB** (前端验证)
- 支持的格式: `.dwg`, `.dxf`, `.mxweb`, `.mxwbe`

### 6. 上传进度回调和事件处理

**事件回调**:

| 回调 | 说明 |
|------|------|
| `onFileQueued(file)` | 文件被选中时触发 |
| `onBeginUpload()` | 开始上传前触发 |
| `onProgress(percentage)` | 上传进度更新 (0-100) |
| `onSuccess(param)` | 上传成功 |
| `onError(error)` | 上传失败 |

### 7. 外部参照检查流程

MxCadUploader 集成了外部参照检测功能：

```
上传成功
    ↓
openUploadedFile(nodeId) → 等待转换完成
    ↓
检查 preloading.json → 检测缺失外部参照
    ↓
显示 ExternalReferenceModal → 用户选择跳过或上传外部参照
```

---

## Uppy 迁移方案

### 1. 技术选型建议

**推荐方案**: `@uppy/core` + `@uppy/tus` + `@uppy/dashboard`

**理由**:
- 符合标准 Tus 协议
- 原生支持断点续传
- 丰富的 UI 组件
- 活跃的社区维护

**需要安装的依赖**:

```json
{
  "@uppy/core": "^3.0.0",
  "@uppy/tus": "^3.0.0",
  "@uppy/dashboard": "^3.0.0",
  "@uppy/react": "^3.0.0"
}
```

### 2. Uppy 初始化配置示例

```typescript
// apps/frontend/src/utils/uppyConfig.ts
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

export const createUppyInstance = (options: {
  nodeId: string;
  onSuccess?: (file: any, response: any) => void;
  onError?: (error: any, file: any) => void;
  onProgress?: (percentage: number) => void;
}) => {
  const uppy = new Uppy({
    debug: false,
    autoProceed: false,
    restrictions: {
      maxFileSize: 100 * 1024 * 1024,  // 100MB
      allowedFileTypes: [
        '.dwg',
        '.dxf',
        '.mxweb',
        '.mxwbe',
        'application/octet-stream',
      ],
      maxNumberOfFiles: 1,
    },
  });

  // 使用 SparkMD5 计算文件 hash (用于秒传)
  uppy.on('file-added', async (file) => {
    const hash = await calculateFileHash(file.data as File);
    file.meta = {
      ...file.meta,
      fileHash: hash,
      nodeId: options.nodeId,
      filename: file.name,
      fileSize: file.size,
    };
  });

  uppy.use(Tus, {
    endpoint: `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/files`,
    chunkSize: 5 * 1024 * 1024,  // 5MB，保持与现有一致
    retryDelays: [0, 1000, 3000, 5000],
    headers: {
      // JWT token 从 AuthContext 获取
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    metadata: (file: any) => ({
      filename: file.name,
      fileHash: file.meta.fileHash,
      fileSize: String(file.meta.fileSize),
      nodeId: file.meta.nodeId,
      filetype: file.type,
    }),
  });

  // 事件绑定
  if (options.onSuccess) {
    uppy.on('complete', (result) => {
      if (result.successful.length > 0) {
        options.onSuccess?.(result.successful[0], result);
      }
    });
  }

  if (options.onError) {
    uppy.on('upload-error', (file, error) => {
      options.onError?.(error, file);
    });
  }

  if (options.onProgress) {
    uppy.on('total-progress', (progress) => {
      options.onProgress?.(progress);
    });
  }

  return uppy;
};
```

### 3. WebUploader (当前实现) 与 Uppy 配置映射

| 功能 | 当前实现 | Uppy 对应配置 |
|------|---------|-------------|
| 文件选择器 | `<input type="file">` | `@uppy/dashboard` 或 `@uppy/react` |
| 分片大小 | 5MB | `Tus: { chunkSize: 5 * 1024 * 1024 }` |
| MD5 计算 | SparkMD5 | `file-added` 事件中手动计算 |
| 秒传检查 | `mxcadApi.checkFileExist()` | 需要在添加文件后、上传前手动调用 |
| 分片检查 | `mxcadApi.checkChunkExist()` | Tus 协议自动处理 (HEAD 请求) |
| 进度回调 | `onProgress(percentage)` | `total-progress` 事件 |
| 成功回调 | `onSuccess(param)` | `complete` 事件 |
| 错误处理 | `onError(error)` | `upload-error` 事件 |
| 认证 | Axios Authorization header | `headers` 配置 |

### 4. 需要修改的文件清单

**优先级 P0**:
1. `apps/frontend/src/components/MxCadUploader.tsx` → 替换为 Uppy 版本
2. `apps/frontend/src/hooks/useMxCadUploadNative.ts` → 改为 useUppyUpload Hook

**优先级 P1**:
3. `apps/frontend/src/utils/mxcadUploadUtils.ts` → 保留但标记为 deprecated
4. `apps/frontend/src/utils/uppyConfig.ts` → 新增，Uppy 配置文件
5. `apps/frontend/src/services/mxcadManager.ts` → 调整 openUploadedFile 调用

**优先级 P2**:
6. 更新相关类型定义 (`types/api-client.ts`, `types/filesystem.ts`)

### 5. 可以删除的文件

**注意**: 建议在 Uppy 稳定运行 1-2 周后再删除以下文件：
- `apps/frontend/src/utils/mxcadUploadUtils.ts` (保留作为参考)
- `apps/frontend/src/hooks/useMxCadUploadNative.ts` (保留作为参考)

### 6. 迁移后架构对比

**迁移前**:
```
原生 <input type="file"> 
    ↓
自定义分片逻辑 (mxcadUploadUtils.ts)
    ↓
逐个分片 POST 到 /api/v1/mxcad/files/uploadFiles
```

**迁移后**:
```
Uppy Dashboard
    ↓
@uppy/tus
    ↓
标准 Tus 协议 (POST → PATCH → HEAD)
```

---

## 实施计划

### 阶段 1: 后端 Tus 端点完善 (1-2 天)

**任务清单**:
- [ ] 将 Tus 服务器挂载到 Express 应用
- [ ] 为 Tus 端点添加 JWT 认证保护
- [ ] 完善 TusEventHandler.handleUploadFinish 业务逻辑
  - [ ] 调用 FileMergeService 合并文件
  - [ ] 调用 FileConversionService 转换 CAD 文件
  - [ ] 创建文件系统节点
  - [ ] 清理临时文件
- [ ] 为 Tus 端点添加 Swagger 文档注释
- [ ] 编写 Tus 集成的单元测试和集成测试

### 阶段 2: 前端 Uppy 集成 (2-3 天)

**任务清单**:
- [ ] 安装 Uppy 相关依赖
- [ ] 创建 `uppyConfig.ts` 配置文件
- [ ] 创建 `useUppyUpload.ts` Hook (替换 useMxCadUploadNative)
- [ ] 重写 `MxCadUploader.tsx` 使用 Uppy
- [ ] 保留外部参照检查流程集成
- [ ] 更新相关类型定义

### 阶段 3: 测试与验证 (1-2 天)

**任务清单**:
- [ ] 基础上传功能测试
- [ ] 大文件上传测试 (50MB+)
- [ ] 断点续传测试
- [ ] 秒传功能验证
- [ ] 文件冲突策略测试 (skip/overwrite/rename)
- [ ] 外部参照流程测试
- [ ] 跨浏览器兼容性测试

### 阶段 4: 清理与文档 (0.5 天)

**任务清单**:
- [ ] 标记旧代码为 deprecated
- [ ] 更新项目文档
- [ ] 更新 API 文档
- [ ] 编写迁移指南

---

## 风险与注意事项

### 1. 后端风险
- **风险**: Tus 认证实现可能与现有认证机制冲突
- **缓解**: 先做认证 PoC，验证通过后再继续

### 2. 前端风险
- **风险**: Uppy 的 metadata 格式可能与后端预期不完全匹配
- **缓解**: 前后端联调时仔细核对 metadata 字段

### 3. 功能风险
- **风险**: 秒传功能需要在 Uppy 之外手动实现
- **缓解**: 在 `file-added` 事件中先调用 checkFileExist，已存在则跳过上传

### 4. 数据一致性
- **注意**: 确保迁移后创建的文件系统节点与现有实现完全一致
  - 字段相同
  - 文件状态转换相同
  - 权限检查相同

---

## 总结

✅ **审计完成**: 
- 后端 Tus 模块已创建，但需要完善认证和业务逻辑
- 前端当前未使用 WebUploader，使用的是自定义分片实现
- 已提供详细的 Uppy 迁移方案和配置

📋 **下一步**: 按照实施计划执行，先完善后端 Tus 端点，再进行前端集成

---

> **汇报人**: Trea  
> **完成时间**: 2026-05-03
