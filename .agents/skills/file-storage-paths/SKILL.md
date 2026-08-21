---
name: file-storage-paths
description: CloudCAD 文件存储路径规范 — filesDataPath 结构、目录分配（YYYYMM/YYYYMM_N）、节点路径、外部参照（ExtRef）路径、preloading.json、前端 URL 格式。Use when constructing file URLs, handling file storage paths, working with extref files/directories, uploading/downloading DWG/mxweb files, or implementing file access controllers.
---

# 文件存储路径

> 根配置 `FILES_DATA_PATH`（默认 `data/files`），通过 `resolvePath` 转为绝对路径。

## 目录分配

由 `directory-allocator.service.ts` 管理：

```
{YYYYMM}[/{N}]/{nodeId}/
```

- 当前月份 → `YYYYMM`（如 `202607`）
- 节点数超过 `FILES_NODE_LIMIT`（默认 300,000）→ `YYYYMM_1`, `YYYYMM_2`（最多 100 个）

## 节点文件命名

| 用途 | 模式 | 示例 |
|------|------|------|
| 工作 mxweb 文件 | `{nodeId}.mxweb.mxweb` | `abc123.mxweb.mxweb` |
| 转换后 DWG/DXF | `{nodeId}{ext}.mxweb` | `abc123.dwg.mxweb` |
| 初始备份 | `{nodeId}.mxweb` | `abc123.mxweb` |

**磁盘上文件始终存为 `.mxweb`**，无论原始格式。

## 外部参照（ExtRef）

### DWG 外部参照

```
{filesDataPath}/{YYYYMM}/{nodeId}/{src_file_md5}/{fileName}.mxweb
```

### 图片外部参照

```
{filesDataPath}/{YYYYMM}/{nodeId}/{src_file_md5}/{fileName}
```

关键规则：
- `src_file_md5` 来自 **preloading.json** 的 `src_file_md5`，**不是**主图纸的 `fileHash`
- DWG/DXF 外部参照统一追加 `.mxweb` 扩展名
- 图片保持原始文件名和扩展名
- `src_file_md5` 不存在时回退到 `nodeId`

> 详细模式见 [docs/extref.md](docs/extref.md)

## Preloading JSON

```
{nodeId}.{ext}.mxweb_preloading.json
```

位置：与主图纸文件同目录

```json
{
  "tz": true,
  "src_file_md5": "d41d8cd9...",
  "images": ["image1.png"],
  "externalReference": ["ref1.dwg"]
}
```

API：`GET /api/v1/mxcad/file/{nodeId}/preloading`（项目文件）
`GET /api/v1/public-file/preloading/{hash}`（公开文件）

## 前端 URL 模式

| 用途 | URL 模式 |
|------|----------|
| 项目文件 | `/api/v1/mxcad/filesData/{path}?v={version}&t={timestamp}` |
| 图纸库 | `/api/v1/library/drawing/filesData/{path}` |
| 图块库 | `/api/v1/library/block/filesData/{path}` |

`path` 段匹配存储路径格式：`{YYYYMM}/{nodeId}/{fileName}`

外部参照：`/api/v1/mxcad/filesData/{YYYYMM}/{nodeId}/{src_file_md5}/{fileName}.mxweb`

## 文件访问控制

`mxcad-file-access.controller.ts` 路由顺序**至关重要**：

```typescript
@Controller('mxcad')
export class MxcadFileAccessController {
  @Get('file/:nodeId/preloading')       // 必须在前
  @Get('file/:nodeId/download-external-ref/:fileName')  // 必须在通配符之前
  @Get('file/*path')                     // 通配符最后
}
```

`authorizeFilesDataAccess` 从路径提取 `nodeId`：
```typescript
const parts = normalizedFilename.split('/');
const nodeId = parts.length >= 2 ? parts[1] : null;
```

## 其他数据路径

| 配置 | 默认值 | 用途 |
|------|--------|------|
| `FILES_DATA_PATH` | `data/files` | 图纸文件 |
| `MX_REPO_PATH` | `data/mx-repo` | SVN 版本仓库 |
| `MXCAD_UPLOAD_PATH` | `data/uploads` | 上传暂存 |
| `MXCAD_TEMP_PATH` | `data/temp` | 临时文件 |
| `MXCAD_DEBUG_PATH` | `data/debug` | 调试日志 |
