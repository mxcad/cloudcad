# 后端缓存头现状审计

> 对应 ticket: [#155](https://github.com/mxcad/cloudcad/issues/155)

审计时间：2026-07-29

## 方法端点概览

| 端点 | Cache-Control | ETag | Last-Modified | 来源文件 | 备注 |
|---|---|---|---|---|---|
| **GET /api/v1/mxcad/filesData/\*path** (v=无) | `no-cache, no-store, must-revalidate` | ❌ | ❌ | `mxcad-file-handler.service.ts:159-161` | 委托 `serveFile()` → `streamFile()`，含 Pragma: no-cache + Expires: 0 |
| **GET /api/v1/mxcad/filesData/\*path** (v=有) | `no-cache, no-store, must-revalidate` | ✅ v=整数时 HEAD 返回含 ETag | ❌ | `mxcad-version-history.service.ts:62,71,99,394` | HEAD（version=-1 和 version 版本）及 GET 末尾均设 no-cache |
| **HEAD /api/v1/mxcad/filesData/\*path** | `public, max-age=3600` | ❌ | ❌ | `mxcad-file-access.controller.ts:271` | 走 `handleFilesDataFileRequest` 分支（无 v 参数时为 1h 缓存） |
| **GET /api/v1/mxcad/file/\*path** | `public, max-age=3600` | ❌ | ❌ | `mxcad-file-access.controller.ts:317,329` | 走 `handleFileRequest`，从存储服务获取流 |
| **HEAD /api/v1/mxcad/file/\*path** | `public, max-age=3600` | ❌ | ❌ | `mxcad-file-access.controller.ts:317` | 同上，HEAD 请求 |
| **GET /api/v1/mxcad/files/:storageKey** | ❌ | ❌ | ❌ | `mxcad-file-access.controller.ts:230-233` | 仅 Content-Type + Content-Disposition |
| **GET /api/v1/mxcad/file/:nodeId/download-external-ref/:fileName** | ❌ | ❌ | ❌ | `mxcad-file-access.controller.ts:140-178` | 直接流式传输，无缓存头 |
| **GET /api/v1/mxcad/thumbnail/:nodeId** | ❌ | ❌ | ❌ | `thumbnail.controller.ts:84` | 返回 JSON，不含缓存头 |
| **POST /api/v1/mxcad/thumbnail/:nodeId** | ❌ | ❌ | ❌ | `thumbnail.controller.ts:155-158` | 返回 JSON，不含缓存头 |
| **GET /api/v1/file-system/nodes/:nodeId/thumbnail** (默认缩略图) | `public, max-age=31536000, immutable` | ✅ `"{mtimeMs}-{size}"` | ✅ UTCString | `download.controller.ts:112,121` | 支持 `if-none-match` → 304 |
| **GET /api/v1/file-system/nodes/:nodeId/thumbnail** (实际缩略图) | `no-cache` | ✅ `"{mtimeMs}-{size}"` | ✅ UTCString | `download.controller.ts:149,159` | 支持 `if-none-match` → 304 |
| **GET /api/v1/file-system/nodes/:nodeId/download** | `public, max-age=3600` 或 `no-cache` | ✅ `"{fileHash\|nodeId}"` | ❌ | `file-download-handler.service.ts:77,97,100` | ZIP 动态生成时 no-cache |
| **GET /api/v1/file-system/nodes/:nodeId/download-with-format** | `public, max-age=3600` 或 `no-cache` | ✅ `"{fileHash\|nodeId}_{format}"` | ❌ | `download.controller.ts:330,345,347` | 同上，ETag 含 format 后缀 |
| **GET /api/v1/file-system/batch-download/:taskId/progress** (SSE) | `no-cache` | ❌ | ❌ | `sse-manager.ts:104` + `batch-download.controller.ts:32` | SSE 必需 no-cache |
| **GET /api/v1/file-system/batch-download/:taskId/progress** (JSON) | `no-cache` (`@Header`) | ❌ | ❌ | `batch-download.controller.ts:32` | NestJS `@Header` 装饰器 |
| **GET /api/v1/file-system/batch-download/:taskId/download** | ❌ | ❌ | ❌ | `batch-download.controller.ts:62-64` | 仅 Content-Type + Content-Disposition + Content-Length |
| **GET /api/v1/public-file/access/:hash/:filename** | `public, max-age=3600` | ❌ | ❌ | `public-file.controller.ts:115` | — |
| **GET /api/v1/public-file/access/:filename** | `public, max-age=3600` | ❌ | ❌ | `public-file.controller.ts:174` | — |
| **POST /api/v1/public-file/convert** | ❌ | ❌ | ❌ | `public-file.controller.ts:375-383` | 仅 Content-Type + Content-Length + Content-Disposition |
| **外部参照文件服务** (由 MxCAD 内部请求) | `public, max-age=3600` | ❌ | ❌ | `external-reference-handler.service.ts:234` | 1h 缓存，无 ETag/Last-Modified |
| **GET /api/v1/library/drawing/thumbnail** | `public, max-age=31536000, immutable` 或 `no-cache` | ✅ 存在 | ✅ 存在 | `library.service.ts:248,266,275` | 默认缩略图 immutable；实际缩略图 no-cache |
| **GET /api/v1/library/drawing/filesData/\*path** | `no-cache, no-store, must-revalidate` | ❌ | ❌ | `library.service.ts:299 → mxcad-file-handler.service.ts:159` | 委托 `serveFile()` |
| **GET /api/v1/library/block/filesData/\*path** | `no-cache, no-store, must-revalidate` | ❌ | ❌ | 同上 | 同上 |
| **GET /api/v1/library/drawing/nodes/:nodeId/download** | `public, max-age=3600` 或 `no-cache` | ✅ `"{fileHash\|nodeId}"` | ❌ | `library.service.ts:303 → file-download-handler.service.ts` | 委托 downloadHandler |
| **GET /api/v1/library/block/nodes/:nodeId/download** | 同上 | ✅ 同上 | ❌ | 同上 | 同上 |
| **GET /api/v1/library/*/nodes/:nodeId/thumbnail** | 同 drawing thumbnail | ✅ 同 | ✅ 同 | `library.service.ts:222` | — |
| **GET /api/fonts/:fileName/download** | ❌ | ❌ | ❌ | `fonts.controller.ts:192-205` | 仅 Content-Type (通过 `@Header` + `StreamableFile`) |
| **GET /metrics** | ❌ | ❌ | ❌ | `metrics.controller.ts:13` | 仅 Content-Type |
| **中间件：/api/cooperate 代理** | ❌ | ❌ | ❌ | `main.ts:278-295` | 全局设置安全头 (CORP, CSP, HSTS等)，不涉及缓存头 |

## 总结

### 分类统计

| 缓存策略 | 端点/分支数 |
|---|---|
| 无任何缓存头 | 10 |
| `Cache-Control: no-cache / no-store` 类 | 7 |
| `Cache-Control: public, max-age=3600`（1小时） | 9 |
| `Cache-Control: public, max-age=31536000, immutable`（1年+不可变） | 3 |
| ETag 支持 | 5 |
| Last-Modified 支持 | 3 |
| `if-none-match` → 304 条件请求 | 3 |

### 已正确设置缓存的端点

- **`/file-system/nodes/:nodeId/thumbnail`** — 配合 ETag + Last-Modified + 304 条件响应，最优实践
- **`/file-system/nodes/:nodeId/download`** — ETag + Cache-Control 区分文件/动态 ZIP
- **`/file-system/nodes/:nodeId/download-with-format`** — ETag 含 format 后缀，粒度更细
- **`/library/*/nodes/:nodeId/thumbnail`** — 同缩略图最佳实践
- **`/library/*/nodes/:nodeId/download`** — 同一 ETag + Cache-Control

### 明显缺失缓存头的端点

| 端点 | 风险 |
|---|---|
| `/mxcad/files/:storageKey` | 无缓存头，浏览器将每次请求 |
| `/mxcad/file/:nodeId/download-external-ref/:fileName` | 同上 |
| `/mxcad/thumbnail/:nodeId` (check) | JSON 响应无缓存，频繁查询 |
| `/file-system/batch-download/:taskId/download` | ZIP 下载无缓存头 |
| `/public-file/convert` | POST 转换结果无缓存，但本身合理 |
| `/fonts/:fileName/download` | 字体文件适合强缓存 |
| `/metrics` | 无缓存头，但 metrics 频繁变化 |

### 不一致问题

1. **`filesData` 双路径缓存策略冲突**：同一路由 `GET /api/v1/mxcad/filesData/*path` 根据有无 `v` 参数走不同实现：
   - 无 v 参数 → `MxcadFileHandlerService.serveFile()` → `Cache-Control: no-cache, no-store, must-revalidate`
   - 有 v 参数 → `MxcadVersionHistoryService.handleHistoricalVersionRequest()` → 同样 `no-cache, no-store, must-revalidate`
   - HEAD 请求则走 `handleFilesDataFileRequest` → `public, max-age=3600`
   - **GET（无 v）和 HEAD 返回不同的 Cache-Control 策略。**

2. **`mxcad-file-access.controller.ts` 同时包含两种缓存策略**：
   - `handleFilesDataFileRequest` → `public, max-age=3600`（第 271 行）
   - 委托 `mxcadFileHandler.serveFile()` → `no-cache, no-store, must-revalidate`（第 159 行）
   - 同一个路由因有无 versionParam 而分派到不同实现，缓存策略不统一。

3. **缩略图缓存策略不一致**：
   - `DownloadController`：实际缩略图 → `no-cache`，默认缩略图 → `immutable`（正确）
   - `LibraryService.serveLibraryThumbnail`：实际缩略图 → `no-cache`，默认缩略图 → `immutable`（正确），但 `serveDefaultThumbnail` 方法省略了 ETag 和 Last-Modified
   - `ThumbnailController.checkThumbnail`：完全不设缓存头（仅返回 JSON `{exists: boolean}`）

4. **外部参照缓存**：`ExternalReferenceHandler` 设为 1h 缓存，但无 ETag/Last-Modified，客户端无法做条件请求。同一文件通过 `getExternalRefDownloadPath` 下载时无缓存头。

5. **文件下载缺少 Last-Modified**：虽然设了 ETag 和 Cache-Control，但 **从未设置 Last-Modified**（`if-modified-since` 不可用）

### 建议

| 端点 | 建议策略 |
|---|---|
| `/mxcad/files/:storageKey` | 静态资源类 ⇒ `public, max-age=31536000, immutable` + ETag |
| `/mxcad/file/:nodeId/download-external-ref/:fileName` | 转换临时文件 ⇒ `no-cache` |
| `/mxcad/thumbnail/:nodeId` (GET check) | JSON 响应 ⇒ `no-cache` + ETag（基于 nodeId + mtime） |
| `/file-system/batch-download/:taskId/download` | ZIP 文件 ⇒ `public, max-age=3600` + ETag |
| `/fonts/:fileName/download` | 字体文件 ⇒ `public, max-age=31536000, immutable` + ETag |
| `/public-file/access/*` | 静态文件类 ⇒ 保持 `max-age=3600`，建议增加 ETag |
| 外部参照 | 保持 `max-age=3600`，建议增加 ETag（基于 mtime+size） |
| 所有文件下载 | 建议统一补充 Last-Modified，支持条件请求的完整协商 |
| `filesData` 无 v 路径 | 考虑改用 `public, max-age=3600`（当前 no-cache 过于保守） |
