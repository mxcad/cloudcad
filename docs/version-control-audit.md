# 版本控制模块完整审计报告

**审计日期:** 2026-05-02
**审计范围:** `apps/backend/src/version-control/` 及所有与 SVN 操作相关的代码

---

## 1. SVN 提交的完整流程

### 1.1 首次保存提交的文件

首次保存时，系统会提交以下文件到 SVN：

**文件结构示例：**
```
filesData/
└── 202602/
    └── {nodeId}/
        ├── {nodeId}.dwg           # CAD 图形文件
        ├── {nodeId}.dwg.mxweb    # MxCAD Web 格式文件
        ├── {nodeId}.dwg.bin      # 分片文件（由 MxCAD 转换生成）
        ├── {nodeId}.dwg.bin.1    # 分片文件片段1（如果有多个分片）
        ├── {nodeId}.dwg.bin.2    # 分片文件片段2
        └── thumbnail.webp        # 缩略图
```

**首次提交流程：**
1. 用户上传/保存 CAD 文件
2. `FileConversionUploadService.handleFileNodeCreation()` 或 `FileMergeService.mergeChunksWithPermission()` 创建节点目录
3. 调用 `VersionControlService.commitNodeDirectory()` 提交整个目录
4. 提交消息格式：
   ```json
   {
     "type": "file_operation",
     "message": "上传/保存说明",
     "userId": "用户ID",
     "userName": "用户名",
     "timestamp": "ISO时间戳"
   }
   ```

**相关代码位置：**
- [version-control.service.ts#L330-443](file:///d:/project/cloudcad/apps/backend/src/version-control/version-control.service.ts#L330-443) - `commitNodeDirectory` 方法
- [file-merge.service.ts#L363-380](file:///d:/project/cloudcad/apps/backend/src/mxcad/upload/file-merge.service.ts#L363-380) - 分片上传后 SVN 提交

### 1.2 后续保存提交的文件

后续保存（覆盖保存）时，同样提交整个节点目录：

**提交流程：**
1. 用户执行保存操作
2. `MxCadService.saveMxwebFile()` 保存 mxweb 文件
3. 调用 `VersionControlService.commitNodeDirectory()` 递归提交目录

**特别说明：**
- 首次保存时会创建初始版本备份 `{basename}_initial.mxweb`
- 后续保存覆盖 `{basename}.mxweb`，不会重新创建 `_initial` 版本
- SVN 提交消息格式与首次保存相同

**相关代码位置：**
- [mxcad.service.ts#L704-864](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.service.ts#L704-864) - `saveMxwebFile` 方法

---

## 2. 分片文件的提交方式

### 2.1 分片文件的生成

CAD 文件（如 DWG）在上传后会被 MxCAD 引擎转换为 `.bin` 分片文件：

**转换流程：**
```
DWG 文件 → MxCAD 引擎 → .bin 分片文件 + .mxweb 文件
```

**分片文件命名规则：**
- 主分片：`{nodeId}.{format}.bin`
- 子分片：`{nodeId}.{format}.bin.1`, `...bin.2`, etc.

### 2.2 分片文件的提交方式

**一次性全部提交**

在 `commitNodeDirectory` 方法中，使用 `svn add` 递归添加整个目录，然后一次 `svn commit` 提交所有文件：

```typescript
// 递归添加目录（svn:global-ignores 自动过滤）
await svnAddAsync([currentPath], true); // true = depth infinity

// 一次提交所有文件
await svnCommitAsync(
  [nodeDirectory],
  fullMessage,
  true, // 递归提交
  null,
  null
);
```

**分片文件与普通文件一起提交：**
- 分片文件 `.bin`, `.bin.1`, `.bin.2` 等都属于同一目录下的文件
- `svn add` 会自动添加所有未版本控制的文件
- `svn commit` 一次性提交整个目录及其内容

**相关代码位置：**
- [version-control.service.ts#L358-426](file:///d:/project/cloudcad/apps/backend/src/version-control/version-control.service.ts#L358-426) - 目录递归提交逻辑

---

## 3. 提交失败后的回滚/恢复机制

### 3.1 当前回滚机制

**SVN 本身不提供自动回滚机制**，但系统有以下处理策略：

#### 3.1.1 锁定重试机制

当遇到 SVN 锁定错误（E155004）时，系统会自动执行 `svn cleanup` 并重试：

```typescript
private async executeWithLockRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (this.isSvnLockedError(error)) {
      this.logger.warn(`${operationName} 遇到锁定错误，尝试 cleanup...`);
      await svnCleanupAsync(this.filesDataPath);
      this.logger.log('SVN cleanup 成功，重试操作...');
      return await operation(); // 重试
    }
    throw error;
  }
}
```

#### 3.1.2 错误捕获与日志

- SVN 提交失败时，错误被捕获并返回失败结果
- 调用方记录错误日志，但不阻塞主流程
- SVN 提交失败不影响数据库事务（数据库提交与 SVN 提交分离）

**示例（saveMxwebFile）：**
```typescript
const commitResult = await this.versionControlService.commitNodeDirectory(...);
if (commitResult.success) {
  this.logger.log(`节点目录已提交到 SVN: ${node.name}`);
} else {
  this.logger.warn(`节点目录 SVN 提交失败: ${node.name}, 原因: ${commitResult.message}`);
}
```

### 3.2 缺失的回滚机制

**当前系统缺少以下回滚机制：**

1. **提交失败后不自动回滚物理文件**
   - 数据库记录已创建，但 SVN 提交失败时，物理文件不会被删除
   - 下次提交会重试这些文件

2. **无法撤销已提交的版本**
   - 系统没有提供回滚到指定 SVN 版本的 API
   - 用户只能通过获取历史版本文件来恢复

3. **SVN 版本与数据库记录不同步风险**
   - 如果 SVN 提交成功但后续操作失败，可能导致不一致

**相关代码位置：**
- [version-control.service.ts#L234-265](file:///d:/project/cloudcad/apps/backend/src/version-control/version-control.service.ts#L234-265) - 锁定重试机制
- [version-control.service.spec.ts#L328-392](file:///d:/project/cloudcad/apps/backend/src/version-control/version-control.service.spec.ts#L328-392) - 失败场景测试

---

## 4. 历史版本文件的缓存命名规则

### 4.1 版本化 mxweb 文件命名

**缓存文件命名规则：**
```
{原始文件名}_v{版本号}.mxweb
```

**示例：**
- 原始文件：`xxx.dwg.mxweb`
- 第 78 版本：`xxx.dwg_v78.mxweb`

### 4.2 初始版本备份

**命名规则：**
```
{原始文件名}_initial.mxweb
```

**示例：**
- 原始文件：`xxx.dwg.mxweb`
- 初始版本：`xxx.dwg_initial.mxweb`

**触发条件：**
- 首次保存文件时，如果目标文件不存在，会创建 `_initial` 备份
- 如果目标文件已存在且没有 `_initial` 备份，会先备份当前文件

### 4.3 临时文件命名

**分片文件临时目录：**
```
{mxcadTempPath}/mxcad-history-{version}-{timestamp}/
```

**示例：**
```
C:\temp\mxcad\mxcad-history-78-1746182400000\
```

### 4.4 ETag 命名

**用于 HTTP 缓存控制：**
```
ETag: "v{version}-{mtime}"
```

**示例：**
```
ETag: "v78-1746182400000"
```

**相关代码位置：**
- [mxcad.controller.ts#L1256-1261](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.controller.ts#L1256-1261) - 历史版本 mxweb 命名
- [mxcad.controller.ts#L1225-1233](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.controller.ts#L1225-1233) - ETag 生成
- [mxcad.service.ts#L773-787](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.service.ts#L773-787) - 初始版本备份

---

## 5. 版本管理相关的所有 API 端点

### 5.1 版本控制 API

**基础路径：** `/v1/version-control`

#### 5.1.1 获取节点的 SVN 提交历史

```
GET /v1/version-control/history
```

**权限：** `VERSION_READ`

**查询参数：**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| projectId | string | 是 | 项目 ID |
| filePath | string | 是 | 节点路径（文件或目录） |
| limit | number | 否 | 限制返回记录数量（默认 50） |

**响应示例：**
```json
{
  "success": true,
  "message": "获取成功",
  "entries": [
    {
      "revision": 78,
      "author": "",
      "date": "2026-05-01T10:30:00.000Z",
      "message": "Save: drawing.dwg",
      "userName": "张三",
      "paths": [
        { "action": "M", "kind": "file", "path": "/202602/nodeId/drawing.dwg.mxweb" }
      ]
    }
  ]
}
```

#### 5.1.2 获取指定版本的文件内容

```
GET /v1/version-control/file/:revision
```

**权限：** `VERSION_READ`

**路径参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| revision | number | 修订版本号 |

**查询参数：**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| projectId | string | 是 | 项目 ID |
| filePath | string | 是 | 文件路径 |

**响应：** 文件二进制内容

### 5.2 历史版本文件访问 API

**基础路径：** `/v1/mxcad/filesData/{*filename}`

#### 5.2.1 访问历史版本文件

```
GET /v1/mxcad/filesData/{filename}?v={version}
```

**权限：** 继承项目文件权限

**路径参数：**
| 参数 | 类型 | 描述 |
|------|------|------|
| filename | string | 文件路径（`/` 替换为 `,`） |

**查询参数：**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| v | string | 是 | 版本号 |

**处理流程：**
1. 检查本地是否有缓存的历史版本文件
2. 如无，从 SVN 获取分片文件并转换
3. 返回文件内容

### 5.3 权限配置

**VERSION_READ 权限角色分配：**

| 角色 | 是否拥有 VERSION_READ |
|------|----------------------|
| OWNER | ✓ |
| ADMIN | ✓ |
| MEMBER | ✓ |
| EDITOR | ✓ |
| VIEWER | ✓ |

**注意：** 目前所有项目角色都拥有 VERSION_READ 权限，没有 VERSION_WRITE 权限定义。

**相关代码位置：**
- [version-control.controller.ts](file:///d:/project/cloudcad/apps/backend/src/version-control/version-control.controller.ts) - API 控制器
- [permissions.enum.ts#L187-237](file:///d:/project/cloudcad/apps/backend/src/common/enums/permissions.enum.ts#L187-237) - 权限配置

---

## 6. 用户切换到指定版本的实际读取流程

### 6.1 读取流程概览

```
用户请求历史版本
       ↓
检查 ?v 参数存在
       ↓
调用 handleHistoricalVersionRequest()
       ↓
判断文件类型（.mxweb 或其他）
       ↓
┌─────────────────────────────────────┐
│  如果是 .mxweb 文件：               │
│  1. 检查本地缓存是否存在             │
│     {name}_v{version}.mxweb         │
│  2. 如存在，直接返回                 │
│  3. 如不存在：                      │
│     a. 从 SVN 获取分片 .bin 文件     │
│     b. 转换 .bin → .mxweb           │
│     c. 保存到本地缓存               │
│     d. 返回文件                     │
│  4. 如果没有分片文件：              │
│     a. 检查 _initial.mxweb          │
│     b. 如无，检查当前 mxweb         │
│     c. 返回找到的文件               │
└─────────────────────────────────────┘
       ↓
返回文件内容
```

### 6.2 详细读取流程

#### 6.2.1 检查本地缓存

```typescript
// 历史版本 mxweb 文件路径
const historyMxwebName = mxwebBaseName.replace(
  /\.mxweb$/,
  `_v${version}.mxweb`
);
const historyMxwebPath = path.join(fileDir, historyMxwebName);

// 检查缓存是否存在
if (fs.existsSync(historyMxwebPath)) {
  buffer = await fsPromises.readFile(historyMxwebPath);
  return;
}
```

#### 6.2.2 并发转换控制

使用 `historyConversionLocks` Map 防止同一版本并发转换：

```typescript
const lockKey = historyMxwebPath;
const existingLock = this.historyConversionLocks.get(lockKey);

if (existingLock) {
  // 等待正在进行的转换完成
  await existingLock;
  // 重新检查缓存
  if (fs.existsSync(historyMxwebPath)) {
    buffer = await fsPromises.readFile(historyMxwebPath);
  }
}
```

#### 6.2.3 从 SVN 获取分片文件

```typescript
// 1. 列出目录中的所有文件
const listResult = await versionControlService.listDirectoryAtRevision(
  fileDir,
  parseInt(version, 10)
);

// 2. 获取所有 .bin 分片文件
for (const binFile of binFiles) {
  const binResult = await versionControlService.getFileContentAtRevision(
    binFilePath,
    parseInt(version, 10)
  );
  // 保存到临时目录
  await fsPromises.writeFile(tempBinFile, binResult.content);
}

// 3. 转换 .bin → .mxweb
const conversionResult = await fileConversionService.convertBinToMxweb(
  binSrcPath,
  fileDir,
  historyMxwebName
);
```

#### 6.2.4 降级处理

当没有分片文件时，按以下顺序尝试：

1. **检查初始版本**：`{name}_initial.mxweb`
2. **检查当前版本**：`{name}.mxweb`

```typescript
if (binFiles.length === 0) {
  // 没有分片，使用初始版本
  const initialMxwebName = mxwebBaseName.replace(
    /\.mxweb$/,
    '_initial.mxweb'
  );
  const initialMxwebPath = path.join(fileDir, initialMxwebName);

  if (fs.existsSync(initialMxwebPath)) {
    buffer = await fsPromises.readFile(initialMxwebPath);
  } else {
    // 使用当前版本
    buffer = await fsPromises.readFile(currentMxwebPath);
  }
}
```

### 6.3 缓存管理

#### 6.3.1 缓存存储位置

历史版本 mxweb 文件缓存在原始文件同一目录：

```
filesData/
└── 202602/
    └── {nodeId}/
        ├── {nodeId}.dwg.mxweb           # 当前版本
        ├── {nodeId}.dwg_v78.mxweb      # 版本 78 缓存
        ├── {nodeId}.dwg_v45.mxweb      # 版本 45 缓存
        └── {nodeId}.dwg_initial.mxweb  # 初始版本备份
```

#### 6.3.2 缓存失效策略

- **无主动清理机制**：缓存文件会持续增长
- **按需生成**：只在请求历史版本时生成缓存
- **永久保留**：生成后不会自动删除

### 6.4 相关代码位置

- [mxcad.controller.ts#L1193-1481](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.controller.ts#L1193-1481) - `handleHistoricalVersionRequest` 方法
- [mxcad.controller.ts#L102-110](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad.controller.ts#L102-110) - 转换锁定义

---

## 7. 审计总结

### 7.1 优点

1. **完整的 SVN 集成**：使用 SVN 作为版本控制系统，支持版本历史查询
2. **分片文件支持**：正确处理 MxCAD 分片文件，支持历史版本转换
3. **并发控制**：使用锁机制防止重复转换
4. **权限控制**：基于角色的权限管理，所有角色都有版本读取权限

### 7.2 风险点

1. **缺少版本回滚 API**：用户无法直接回滚到指定版本
2. **SVN 提交失败无自动回滚**：可能导致数据库与 SVN 不一致
3. **缓存无清理机制**：历史版本缓存文件会持续增长
4. **没有版本比较功能**：无法比较两个版本的差异
5. **初始版本命名不参与版本控制**：`_initial.mxweb` 是本地备份，不在 SVN 中

### 7.3 建议改进

1. **添加版本回滚 API**：支持回滚到指定 SVN 版本
2. **增强提交失败处理**：考虑在 SVN 提交失败时回滚数据库记录
3. **添加缓存管理**：实现缓存大小限制或 LRU 淘汰策略
4. **添加版本比较功能**：支持 diff 查看版本差异
5. **将 `_initial` 文件纳入版本控制**：或使用 SVN 标签功能

---

## 附录：关键文件清单

| 文件路径 | 描述 |
|----------|------|
| `apps/backend/src/version-control/version-control.service.ts` | SVN 版本控制核心服务 |
| `apps/backend/src/version-control/version-control.controller.ts` | 版本控制 API 控制器 |
| `apps/backend/src/version-control/version-control.module.ts` | 版本控制模块定义 |
| `apps/backend/src/mxcad/core/mxcad.controller.ts` | 历史版本文件访问 |
| `apps/backend/src/mxcad/core/mxcad.service.ts` | MxCAD 文件保存服务 |
| `apps/backend/src/mxcad/upload/file-merge.service.ts` | 分片文件合并服务 |
| `apps/backend/src/mxcad/upload/file-conversion-upload.service.ts` | 文件转换上传服务 |
| `apps/backend/src/mxcad/save/save-as.service.ts` | 另存为服务 |
| `apps/backend/src/file-operations/file-operations.service.ts` | 文件操作服务 |
| `packages/svnVersionTool/svncommit.js` | SVN 提交命令封装 |
