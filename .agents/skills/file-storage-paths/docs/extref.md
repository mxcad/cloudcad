# 外部参照（ExtRef）详细模式

## 路径构造

上传时路径构造（`external-ref.service.ts`）：

```typescript
const sourceNodeDir = path.dirname(sourceNodePath);
const externalRefDirName = await getExternalRefDirName(srcDwgNodeId);
// 从 preloading.json 读取 src_file_md5，不存在则用 nodeId
const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

// DWG 外部参照
const targetFile = path.join(externalRefDir, `${extRefFileName}.mxweb`);

// 图片外部参照
const targetImageFile = path.join(externalRefDir, extRefFileName);
```

## 降级搜索

`checkExists` 兼容性：如果标准目录 `{parentDir}/{src_file_md5}/` 不存在，
系统会扫描 `parentDir` 所有子目录匹配文件名。

## extReferenceUrlResolver

`mxcadManager.buildViewOptions()` 中配置外部参照 URL 解析器：

```typescript
extReferenceUrlResolver: async (extRefInfo) => {
  return `${API_BASE}/api/v1/mxcad/filesData/${extRefInfo.path}?v=${version}`;
}
```

## 路由授权

`authorizeFilesDataAccess` 从 URL path 提取 nodeId：

```typescript
// path 格式: YYYYMM/{nodeId}/...
// extref path: YYYYMM/{nodeId}/{src_file_md5}/{fileName}.mxweb
const parts = normalizedFilename.split('/');
const nodeId = parts.length >= 2 ? parts[1] : null;
```

## extRefInfo.path 格式

`mxcad-app` 的 `extReferenceInfo` 结构：

```typescript
interface ExtRefInfo {
  path: string;  // 存储相对路径，如 "202607/abc123/xyz.mxweb"
  type: 'dwg' | 'image';
  name: string;
}
```

URL 解析时拼接 `/api/v1/mxcad/filesData/` + `path` + `?v=` + `version` + `&t=` + `timestamp`。

## 关键文件

| 文件 | 角色 |
|------|------|
| `src/mxcad/external-ref/external-reference-update.service.ts` | Preloading 管理、路径构造 |
| `src/mxcad/external-ref/external-ref.service.ts` | 文件上传/复制 |
| `src/mxcad/external-ref/external-ref.controller.ts` | REST 端点 |
| `src/mxcad/infra/mxcad-file-access.controller.ts` | 文件提供、路径授权 |
| `src/mxcad/core/mxcad-file-handler.service.ts` | 文件回退逻辑 |
