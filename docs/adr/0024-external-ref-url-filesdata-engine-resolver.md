# ADR-0024: 外部参照文件存储与路径的 mxcad 引擎耦合约束

## 状态

2026-07-29 通过

## 背景

外部参照（XRef）管理功能需要在新标签页中打开图纸类型的外部参照文件。设计过程中发现：**存储路径、URL 路由、路由前缀三者全部受 MXCAD 引擎内部机制约束**，不能自由选择。

## 问题

以下三个问题看似独立，实则同一根源：

1. **存储** — 外部参照文件为什么必须放在 `filesDataPath/YYYYMM/nodeId/` 下？
2. **路由** — `filesData` URL 格式为什么必须是 `filesData/YYYYMM/nodeId/...`？
3. **设计** — 为什么不能直接复用 `filesData` 端点，而要新增 `external-ref-view`？

## 根源：文件存储结构与 resolver 的匹配关系

### 文件存储结构

图纸文件及其外部参照按以下目录结构存储：

```
{filesDataPath}/{YYYYMM}/{nodeId}/{fileHash}.dwg.mxweb          ← 主图纸 mxweb
{filesDataPath}/{YYYYMM}/{nodeId}/{extRefDirName}/{xref}.mxweb   ← 外部参照文件
```

- `YYYYMM` — 按年月分片，避免单目录文件过多
- `nodeId` — 文件系统节点的 UUID
- `extRefDirName` — 由 `getExtRefDirName()` 从 nodeId 计算出的定值目录名
- `{xref}.mxweb` — 外部参照原文件名 + `.mxweb`（如 `A1.dwg.mxweb` 或 `A1.mxweb`）

### 外部参照请求流程

当 `mxcad-app` npm 包打开一个 mxweb 文件时，其内部使用的 `mxcad` 包（闭源，运行在 WebAssembly 层）会自动解析外部参照：

1. `mxcad` 读取该文件对应的 `_preloading.json`
2. 从 `externalReference` / `images` 数组中获得外部参照文件名列表
3. 对每个文件名，调用前端注册的 `extReferenceUrlResolver(fileName)` 回调
4. `resolver` 根据主文件 URL 构造外部参照的完整请求 URL
5. `mxcad` 内部通过 WebAssembly 层 HTTP 请求该 URL，获取外部参照文件内容并渲染

### Resolver 实现

`extReferenceUrlResolver` 位于 `mxcadManagerCore.ts:294-314`，是前端代码（非闭源）：

```typescript
const resolveExtReferenceUrl = (fileName: string) => {
  // 模式 A: public-file/access → 提取 hash，构造 /access/{hash}/{fileName}
  if (openFile.includes('/public-file/access/')) {
    const hash = extractHash(openFile);
    return `/api/v1/public-file/access/${hash}/${fileName}`;
  }
  // 模式 B: filesData/YYYYMM/{nodeId} → 提取基目录
  const mxcadMatch = openFile.match(/\/api\/v1\/mxcad\/filesData\/([^/]+\/[^/]+)\//);
  if (mxcadMatch) {
    const baseDir = mxcadMatch[1]; // "YYYYMM/nodeId"
    return `/api/v1/mxcad/filesData/${baseDir}/${fileName}`;
  }
  // 模式 C: 不认识的 URL 模式 → 返回原文件名（引擎无法加载）
  return fileName;
};
```

### 目录结构的设计逻辑

关键关系：**resolver 是从主文件 URL 推导外部参照 URL 的**。

模式 B 中，resolver 从主文件 URL 提取 `YYYYMM/nodeId` 作为基目录，然后拼接 `/{fileName}`。这意味着引擎发起的请求 URL 为：

```
/api/v1/mxcad/filesData/{YYYYMM}/{nodeId}/{xrefFileName}
```

要让这个请求成功，文件必须存储在对应的路径下。所以**目录结构是为适配这个推导逻辑而设计的**：

```
存储路径: {filesDataPath}/{YYYYMM}/{nodeId}/{extRefDirName}/{xref}
请求 URL: /api/v1/mxcad/filesData/{YYYYMM}/{nodeId}/{extRefDirName}/{xref}
```

`extRefDirName` 是额外的一层子目录，resolver 不感知它——`filesData/{YYYYMM}/{nodeId}/{xrefFileName}` 会被 `serveFile` 处理，其 fallback 逻辑 `findExternalReferencePath` 在 `{YYYYMM}/{nodeId}/` 的子目录中遍历查找 xrefFileName，从而找到 `extRefDirName/{xref}`。

### 对路由的影响

`filesData` 端点的通配路由是：

```
@Controller('mxcad')
@Get('filesData/*path')    // 匹配 /api/v1/mxcad/filesData/YYYYMM/nodeId/xxx/xxx
```

任何在 `file/` 路径空间下添加子路由的尝试（如 `file/:nodeId/external-ref/xxx`）都会与这个通配路由冲突——`*path` 匹配 `file/` 之后的一切路径。

## 决策

### 存储结构

保持不变：`filesDataPath/{YYYYMM}/{nodeId}/{extRefDirName}/{fileName}.mxweb`

### 查看外部参照的方案

新标签页中 `mxcadManager.openFile` 直接传入任意 URL 即可加载 mxweb 文件（不经过 `extReferenceUrlResolver`，因为这是"打开文件"而非"解析嵌套引用"）。查看场景下外部参照图纸通常不包含子引用，嵌套解析并非必需。

因此选择**新增独立端点**：

```
GET /api/v1/mxcad/external-ref-view/{nodeId}/{fileName}.mxweb
```

- 避开了 `filesData/*path` 通配路由冲突
- 使用 `@OptionalAuth()`（引擎 fetch 自动带 JWT token）
- 通过 `getExternalRefDownloadPath()` 定位文件

### `filesData` 端点的角色

`filesData` 端点保留了完整的引擎解析能力，仅在以下场景使用：

- **打开主图纸** — `mxcadManager.openFile({ url: filesDataUrl })`
- **引擎自动加载外部参照** — resolver 解析后再请求
- **正常文件下载** — 通过权限守卫保护

## 相关文件

| 文件 | 职责 |
|------|------|
| `mxcadManagerCore.ts` | `extReferenceUrlResolver` + `buildViewOptions` |
| `mxcad-file-access.controller.ts` | `viewExternalRef()` + `getFilesDataFile()` |
| `external-reference-update.service.ts` | `getExternalRefDownloadPath()` |
| `external-ref.service.ts` | `handleExternalReferenceFile()` |
| `external-ref-preloading.service.ts` | `getExtRefDirName()` |
| `mxcad-file-handler.service.ts` | `serveFile()` + `findExternalReferencePath()` |
| `ExternalReferencePanel.tsx` | 外部参照管理 UI |
| `CADEditorDirect.tsx` | `fileUrl` URL 参数 + `mxcadManager.openFile` |
| `MxCadUploader.tsx` / `FileItem.tsx` | 文件管理场景的查看/下载 |

## 后果

- 正向：`external-ref-view` 不与 `filesData` 路由冲突
- 正向：不改变 resolver 的基目录推导逻辑，现有图纸的嵌套外部参照不受影响
- 负面：新增一个端点的维护成本
- 负面：有限制——`external-ref-view` 打开的文件不能触发嵌套外部参照自动加载（查看场景不需要）
