# MxCAD 转换服务（MxCAD）

**文件位置**：`packages/backend/src/mxcad/`

## 概述

MxCAD 图纸转换服务，支持分片上传、断点续传、自动转换 CAD 图纸为 .mxweb 格式。

## 核心组件

- **CacheManagerService**: 缓存管理服务
- **ChunkUploadService**: 分片上传服务
- **FileCheckService**: 文件检查服务
- **FileConversionService**: 文件转换服务
- **FileSystemService**: 文件系统服务
- **FileUploadManagerService**: 文件上传管理服务
- **FilesystemNodeService**: 文件系统节点服务
- **NodeCreationService**: 节点创建服务
- **UploadOrchestrator**: 上传编排器

## 接口列表

| 接口 | 方法 | 功能 |
|------|------|------|
| `/mxcad/files/chunkisExist` | POST | 检查分片是否存在 |
| `/mxcad/files/fileisExist` | POST | 检查文件是否存在 |
| `/mxcad/files/tz` | POST | 检查图纸状态 |
| `/mxcad/files/uploadFiles` | POST | 上传文件（支持分片） |
| `/mxcad/convert` | POST | 转换服务器文件 |
| `/mxcad/upfile` | POST | 上传并转换文件 |
| `/mxcad/savemxweb` | POST | 保存 MXWEB 到服务器 |
| `/mxcad/savedwg` | POST | 保存 DWG 到服务器 |
| `/mxcad/savepdf` | POST | 保存 PDF 到服务器 |
| `/mxcad/file/:filename` | GET | 访问转换后的文件 |

## 外部参照相关接口

| 接口 | 方法 | 功能 |
|------|------|------|
| `/mxcad/file/{fileHash}/preloading` | GET | 获取外部参照预加载数据 |
| `/mxcad/file/{fileHash}/check-reference` | POST | 检查外部参照是否存在 |
| `/mxcad/up_ext_reference_dwg` | POST | 上传外部参照 DWG |
| `/mxcad/up_ext_reference_image` | POST | 上传外部参照图片 |
| `/mxcad/up_image` | POST | 上传图片 |

## 双层拦截器架构

| 拦截器 | 职责 | 功能 |
|--------|------|------|
| ApiService（axios 层） | 处理 axios 请求 | 补充 nodeId，设置 Authorization |
| MxCadManager（XHR/fetch 层） | 处理底层请求 | 清理冗余参数，兼容 MxCAD-App |

**参数来源优先级**（ApiService）：
1. 请求体中的 nodeId
2. URL 查询参数中的 nodeId 或 parent
3. 全局状态 `window.__CURRENT_NODE_ID__`
4. localStorage 中的 currentNodeId

## 返回格式

> **重要**: MxCAD 接口绕过了 NestJS 全局响应包装，直接返回原始格式

```json
{"ret": "ok"}
{"ret": "fileAlreadyExist"}
{"ret": "chunkAlreadyExist"}
{"ret": "convertFileError"}
```

## 外部参照管理

自动检测缺失的外部参照文件，支持 DWG 和图片参照上传与转换。

## 相关配置

- `MXCAD_ASSEMBLY_PATH`: 转换工具路径
- `MXCAD_UPLOAD_PATH`: 上传路径
- `MXCAD_TEMP_PATH`: 临时路径
- `MXCAD_FILE_EXT`: .mxweb
- `MXCAD_COMPRESSION`: true