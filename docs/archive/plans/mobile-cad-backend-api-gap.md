# 移动端 CAD 编辑器 — 后端接口缺失（需修复）

> **范围**：移动端 CAD 编辑器只替代 PC 端 CAD 编辑器页面（`CADEditorDirect.tsx`）  
> **排除**：侧边栏文件浏览器、图纸库/图块库浏览、分享管理、存储配额等 —— 这些由 PC 端页面覆盖，移动端不需要  
> **日期**：2026-07-07（更新于 2026-07-07，已修复部分 bug）

---

## 已修复的 Bug

### 1. `extRefService.ts` - 外部参照检查参数错误

**问题**：`checkExternalReferences()` 发送给 `mxCadControllerCheckExternalReference` 的 `body.fileName` 始终为空字符串，导致后端无法检查具体的外部参照文件是否存在。PC 端逐一检查每个文件名。

**修复**：重写为 `checkExternalReferenceExists(nodeId, fileName)`，逐一检查每个外部参照文件。

| 文件 | 修改 |
|------|------|
| `src/services/extRefService.ts` | `checkExternalReferences` → `checkExternalReferenceExists(nodeId, fileName)` |
| `src/composables/useFileLoader.ts` | 调用方更新，逐一检查每个文件并过滤已存在的参照 |

---

### 2. `extRefService.ts` - `uploadExtRefDwg` 缺少 `ext_ref_file` 参数

**问题**：`uploadExtRefDwg()` 发送给 `mxCadControllerUploadExtReferenceDwg` 的 `body.ext_ref_file` 为空字符串。`UploadExtReferenceFileDto` 中 `ext_ref_file` 是必填字段，后端依赖此字段关联 uploaded file 与对应的外部参照。缺少此参数会导致 DWG 参照上传后无法正确关联。

**修复**：增加 `extRefFile` 参数，调用方传入具体的外部参照文件名。

| 文件 | 修改 |
|------|------|
| `src/services/extRefService.ts` | `uploadExtRefDwg` 增加 `extRefFile` 参数，body 中传递 `ext_ref_file: params.extRefFile` |
| `src/composables/useFileLoader.ts` | 调用 `uploadExtRefDwg` 时传入 `extRefFile: ref.name` |

---

### 3. `extRefService.ts` - `uploadExtRefImage` body 参数与 PC 端不对齐

**问题**：移动端 `uploadExtRefImage` body 中使用了 `hash`（源文件的 hash），PC 端使用的是 `nodeId`（body.nodeId）。且缺少 PC 端传递的 `updatePreloading: true`。

**修复**：对齐 PC 端参数格式：`body` 中添加 `nodeId` 和 `updatePreloading: true`。

| 文件 | 修改 |
|------|------|
| `src/services/extRefService.ts` | `uploadExtRefImage` body 添加 `nodeId: params.nodeId`、`updatePreloading: true`；移除 `srcDwgfileHash` 入参 |

---

### 4. `useFileLoader.ts` - `checkFileExternalRefs` 缺少预加载数据重试逻辑

**问题**：PC 端 `useExternalReferenceUpload.checkMissingReferences` 在 `shouldRetry=true` 时预加载数据最多重试 10 次（每次 2 秒），等待后端完成文件转换和 preloading.json 生成。移动端仅尝试一次，文件转换未完成时会直接跳过外部参照检查。

**修复**：新增 `getPreloadingDataWithRetry` 函数（对齐 PC 端 10 次 × 2 秒策略），在 `checkFileExternalRefs` 中使用。

| 文件 | 修改 |
|------|------|
| `src/services/extRefService.ts` | 新增 `getPreloadingDataWithRetry(nodeId, maxRetries, delayMs)` |
| `src/composables/useFileLoader.ts` | `checkFileExternalRefs` 改用 `getPreloadingDataWithRetry` |

---

## 已确认不需要（由 PC 端页面覆盖）

以下接口 PC 端 CAD 编辑器侧边栏/弹窗中有调用，但属于平台管理功能，移动端 CAD 编辑器不需要实现：

| Controller | 排除原因 |
|------------|----------|
| `libraryController.*`（全部 28 个方法） | 图纸库/图块库浏览在 PC 端侧边栏实现 |
| `shareController.createShare/listShares/updateShare/revokeShare/getFileShares` | 分享管理在 PC 端独立页面 `/shares` 实现 |
| `fileSystemController.getStorageQuota` | 存储配额在 PC 端 Layout 底部展示 |
| `runtimeConfigController.getPublicConfigs` | 运行时配置由 PC 端 Layout 读取 |
| `libraryController.getDrawingCategories/getBlockCategories` | 资源库分类导航在 PC 端侧边栏实现 |

---

## 移动端已对齐的后端 API

以下接口移动端已调用，与 PC 端 CAD 编辑器功能一致：

| Controller | API 方法 | 用途 |
|------------|----------|------|
| `mxCadController` | `getPreloadingData` / `getPreloadingDataWithRetry` | 预加载数据（含重试） |
| `mxCadController` | `checkExternalReference` | 检查单个外部参照是否存在 |
| `mxCadController` | `checkFileExist` | 上传前 hash 去重 |
| `mxCadController` | `checkChunkExist` | 分片存在检查 |
| `mxCadController` | `uploadFile` | 文件上传（单片/分片） |
| `mxCadController` | `uploadExtReferenceImage` | 外部参照图片上传 |
| `mxCadController` | `uploadExtReferenceDwg` | 外部参照 DWG 上传（已修复） |
| `publicFileController` | `convertAndDownload` | mxweb→PDF/DWG/DXF 转换下载 |
| `publicFileController` | `checkExtReference` | 公开文件外部参照检查 |
| `publicFileController` | `uploadExtReference` | 公开文件外部参照上传 |
| `publicFileController` | `getPreloadingData` | 公开文件预加载数据 |
| `shareController` | `resolveShareNode` | 解析分享 token |
| `thumbnailController` | `checkThumbnail` / `uploadThumbnail` | 缩略图检查与上传 |
| `versionControlController` | `getFileHistory` | 版本历史 |
| `saveController` | `saveMxwebAs` | 另存为到项目/个人空间/资源库 |
| `libraryController` | `saveDrawingNode` / `saveBlockNode` | 保存到资源库 |
| **直接 fetch** | `POST /api/v1/mxcad/savemxweb/:nodeId` | 保存到已有节点 |

---

## 后续可选优化（非必须）

| 项目 | 说明 |
|------|------|
| `refreshExternalReferences` | PC 端在外部参照刷新场景使用，移动端如有"刷新参照"交互需求时补充 |
| 外部参照状态缓存 | PC 端对预加载数据做了 5 秒缓存 + 请求去重，移动端如有性能需求可参考实现 |
