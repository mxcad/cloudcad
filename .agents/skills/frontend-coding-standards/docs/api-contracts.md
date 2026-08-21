# API 契约规则（ADR-0034）

前端 API 类型必须与后端 DTO 保持一致。**禁止前端本地定义 API 类型。** **禁止裸 fetch 调用后端 API。**

## 类型来源

```
后端 DTO (@ApiProperty)
    │
    ▼ (pnpm generate:api-types → 根目录脚本)
@hey-api/openapi-ts 自动生成
    │
    ▼
@cloudcad/api-sdk 包（packages/api-sdk）
    │
    ▼
src/api-sdk/index.ts（桥接 re-export，`export * from '@cloudcad/api-sdk'`）
```

SDK 生成物（`sdk.gen.ts` / `types.gen.ts` 在 `@cloudcad/api-sdk` 包内）自动生成，**禁止手动编辑**。

## 规则

### ✅ 正确：使用自动生成的类型与函数

```typescript
import type { FileNodeDto } from '@/api-sdk';
import { fileSystemApi } from '@/api-sdk';

async function loadFile(nodeId: string): Promise<FileNodeDto> {
  return fileSystemApi.getFileNode(nodeId);
}
```

SDK 自动处理：baseUrl、`{code,data}` 信封解包、Bearer + Accept-Language 注入、401 自动刷新重试（`clientSetup.ts`）。

### ❌ 错误：前端本地定义 API 类型 / 裸 fetch

```typescript
// ❌ 禁止 — 前端自定义类型，与后端脱节
interface FileNodeDto { id: string; name: string; fileStatus: string; }

// ❌ 禁止 — 裸 fetch 调用后端 API（ADR-0034）
fetch('/api/file-system/node', { headers: { Authorization: `Bearer ${token}` } });
```

## 裸 fetch 治理（ADR-0034）

**默认规则：一切后端 API 调用必须走 `@cloudcad/api-sdk` 生成的函数。**

- 禁止 `fetch()` / `fetchWithAuth()` / `getCommonHeaders()` 调用后端 API
- multipart 场景：body 传**普通对象**（`body: { file, hash, ... } as never`，SDK 的 `formDataBodySerializer` 自动序列化为 FormData；`file` 可为 Blob/File）。**禁止传原生 `FormData`** —— `Object.entries(FormData)` 返回 `[]`，所有字段会被静默丢弃（参考头像上传修复 b1cd0d56）
- **blob 下载统一走 `src/utils/download.ts`**（唯一允许 `as Blob` 断言处）：
  - `triggerBlobDownload(blob, filename)`
  - `downloadNodeFile(nodeId, name)`：调 SDK → `as Blob` 单点断言 → 解析 Content-Disposition 文件名 → 触发下载
- `as Blob` 断言**只允许出现在 `utils/download.ts`**（其余调用方拿到的就是 `Blob`）

### 豁免清单（唯一出口之外仅限下列，逐处列名）

豁免只授予「非后端 API 资源」或「SDK 无法表达的传输形态」，新增豁免需 Code Review 论证：

| 豁免项 | 位置 | 理由 |
|---|---|---|
| `/brand/config.json` 静态品牌配置 | `constants/appConfig.ts:90` | 静态资源 + AbortController 超时，非 API |
| 通用配置加载器 | `config/getConfig.ts:16` | 加载任意配置 URL，非 API |
| 任意外部图片 URL（插入图片命令） | `services/mxcadManager/cmd/insertImageCommand.ts:44` | 用户/图纸指定的外部资源，非后端 API |
| SSE 进度（batch-download 任务进度） | `hooks/file-system/useBatchDownload.ts:52` | EventSource ≠ fetch，SDK 无 SSE 形态；token 走 query |

> 已解除：`mxcad/filesData` 外部参照私有下载（原 `hooks/useExternalReferenceUpload.ts` 豁免）——后端已为 `@Get('filesData/*path')` 补 `@Param('path')` 标注（2026-08-12），已收编为 `mxcadFileAccessControllerGetFilesDataFile({ path, parseAs: 'blob' })`。注意：SDK 会把 path 整体 `encodeURIComponent`（`/` → `%2F`），后端通配符路由（Express 5）会自动解码，路径语义不变。

## 类型变更流程

1. 修改后端 DTO（`@ApiProperty`）
2. 运行 `pnpm generate:api-types`（根目录，dev/build 管道会自动触发）
3. 前端自动获得更新后的类型
4. TypeScript 编译器会标出所有不兼容的使用点

## 常见错误

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 在组件中定义 `interface ApiResponse {...}` | 使用 api-sdk 自动生成的类型 |
| 手动写 `fetch('/api/xxx')` | 使用 SDK 生成的函数（ADR-0034） |
| `as Blob` 断言散落在下载调用方 | 收敛到 `utils/download.ts` 单点 |
| 用 `any` 或 `as` 绕开类型检查 | 修复类型不匹配，不要绕过 |
| 手动修改 `sdk.gen.ts` 或 `types.gen.ts` | 这些文件由 `generate:api-types` 生成 |

## ADR 参考

- ADR-0034 前端直连 fetch 治理：`docs/adr/0034-frontend-fetch-governance.md`
