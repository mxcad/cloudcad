# 0034 — 前端直连 fetch 治理（收编 SDK + 豁免清单 + 门禁）
**Status**: accepted

现状：`packages/frontend/src` 存在 9 处裸 `fetch`（外加移动端 1 处同款）。其中 6 处对应的后端端点已在 `@cloudcad/api-sdk` 中生成（save-as / savemxweb / public-file access），3 处 blob 下载端点（batch-download、download-with-format、download-external-ref、mxcad filesData）SDK 运行时可拿到 Blob 但类型为 `unknown`；另有 3 处静态/外部资源加载 + 1 处 SSE 属合理豁免。本 ADR 定下「收编 SDK + 豁免清单 + eslint 门禁」的治理规则，执行走尾部队列（意图对齐后端 ADR-0019 契约单一源原则）。

**Decision**

**一、默认规则：一切后端 API 调用必须走 `@cloudcad/api-sdk` 生成的函数**

- 禁止裸 `fetch()` / `fetchWithAuth()` / `getCommonHeaders()` 调用后端 API。
- 收编后统一获得 SDK 层的 baseUrl、`{code,data}` 信封解包、Bearer + Accept-Language 注入、401 自动刷新重试（`clientSetup.ts`）。
- multipart 场景：body 传**普通对象**（`body: { file, hash, ... } as never` 绕过类型；类型来自 SDK 生成，不是手写）。**禁止传原生 `FormData`** —— SDK 的 `formDataBodySerializer` 用 `Object.entries()` 序列化，`Object.entries(FormData)` 返回 `[]`，字段全部静默丢失（参考头像上传修复 b1cd0d56 与 save-as 400 修复）。

**二、豁免清单（categorized，唯一出口 `src/utils/download.ts` 之外仅限下列）**

豁免只授予「非后端 API 资源」或「SDK 无法表达的传输形态」，逐处列名，新增豁免需在 Code Review 论证：

| 豁免项 | 位置 | 理由 |
|---|---|---|
| `/brand/config.json` 静态品牌配置 | `constants/appConfig.ts:90` | 静态资源 + AbortController 超时，非 API |
| 通用配置加载器 | `config/getConfig.ts:16` | 加载任意配置 URL，非 API |
| 任意外部图片 URL（插入图片命令） | `services/mxcadManager/cmd/insertImageCommand.ts:44` | 用户/图纸指定的外部资源，非后端 API |
| SSE 进度（batch-download 任务进度） | `hooks/file-system/useBatchDownload.ts:52` | EventSource 非 fetch，SDK 无 SSE 形态；token 走 query |

> 已解除：`mxcad/filesData` 外部参照私有下载（原 `hooks/useExternalReferenceUpload.ts` 豁免）——后端已为 `@Get('filesData/*path')` 补 `@Param('path')` 标注（2026-08-12，随历史版本预热改动一并落地），SDK 类型可用，已收编为 `mxcadFileAccessControllerGetFilesDataFile({ path, parseAs: 'blob' })`。

**三、blob 下载统一封装：`src/utils/download.ts`（L1 基础设施层）**

- 新建 `src/utils/download.ts` 作为 blob 下载唯一出口，提供：
  - `triggerBlobDownload(blob, filename)`（从既有重复代码提升）
  - `downloadNodeFile(nodeId, name)`：调用 SDK（blob 端点 + `as Blob` 单点断言）→ 解析 `Content-Disposition` 文件名 → 触发下载。
- `FileItem.tsx:283` / `MxCadUploader.tsx:144` 的重复下载块、`useBatchDownload.ts:113`、`BatchDownloadDialog.tsx:160`、`useExternalReferenceUpload.ts:726` 两分支全部收敛到该 util。
- `as Blob` 断言只允许出现在 `utils/download.ts` 一处（其余调用方拿到的就是 `Blob`）。
- 后端 7 个 blob 端点补二进制 `@ApiResponse` 标注属后端变更，本 effort Out of scope，另起 effort 后可消除断言。

**四、CSRF 确认**

- `packages/backend/src/auth/guards/csrf.guard.ts:60-69`：存在合法 Bearer token 时直接跳过 double-submit CSRF 检查。SDK 注入 Authorization header 后不受 CSRF 影响，收编无需后端改动。

**五、门禁：eslint `no-restricted-globals` + 文档**

- eslint 配置新增 `no-restricted-globals` 规则，禁用 `fetch` 与 `EventSource` 全局调用（覆盖 fetchWithHeaders 工具删除后所有裸调用路径）。
- 豁免清单在 `frontend-coding-standards` 的 api-contracts 文档中同步为「裸 fetch 治理」章节（随 187 文档落地）。
- `fetchWithHeaders.ts` 的 4 处调用方全部迁移后，该工具 + `getCommonHeaders` 整体删除；`tokenUtils.refreshTokenIfNeeded` 为死代码（零调用方，SDK 401 刷新已接管），直接删除。

**六、移动端联动**

- `packages/frontend_mobile/src/services/saveService.ts:61` savemxweb 裸 fetch 一并收编（该函数已在 SDK 中生成），与 PC 端同批执行。

**七、执行时机**

- 收编与删除属破坏性变更，排尾部执行队列（受「避免破坏性变更」约束），不在本 ADR 生效日执行。
- 迁移时保留 `useBatchDownload.ts` 的 404/409 状态分支语义（SDK 非 2xx 走 error 路径，需在收编时显式映射）。

**Guidance**

- 新增代码一律走 SDK；新增豁免需在 Code Review 论证并登记清单。
- Code Review 必拦：裸 fetch / fetchWithAuth / EventSource 调用后端 API、util 之外的 `as Blob` 断言。
- 后端二进制标注落地后，逐步移除 `utils/download.ts` 的 `as Blob` 断言。

**Status**: accepted
