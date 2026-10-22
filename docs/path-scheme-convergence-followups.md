# 磁盘路径 scheme 收口 —— 收尾票

> 背景：`StorageManager` 已是 DB 存储路径（`YYYYMM[/N]/nodeId/...`，可带 `/mxcad/file/` 前缀）
> → 节点目录的**唯一解码出口**（约定标记 C8，见 `storage-manager.service.spec.ts` 表驱动用例），
> 4 个纯方法、约 35 个消费方。真正的问题不是缺深 module，而是**少数调用点绕过了这条 seam**。
>
> 本轮已消除 2 处绕过：
> - `node-trash.service.ts` `deleteFileInStorage` —— 删除自建的 `path.join(filesDataPath, path.dirname(nodePath))`
>   （无前缀剥离、不经 `validatePath`），节点目录改由 `getFullPath` 的 `dirname` 唯一产生；
>   两项守卫（段数、`endsWith(nodeId)`）前移到**任何删除之前**，此前 MX 标记删除跑在校验之前。
> - `external-reference-handler.service.ts` —— 根目录改走 `extRefPreloadingService.resolveStorageRoot`，
>   删除自建 `path.resolve(filesDataPath, node.path, '..')`。这是 b936c6e 修掉「文件名锚定」半边后剩下的
>   「根目录锚定」半边；顺带补上游客 `mxcadUploadPath` 回落与 `validatePath` fail-closed。
>
> 两处均带回归用例。backend `tsc --noEmit` 0 错，全量单测 235 套件 / 3335 例全绿。
>
> 下列各项**刻意留作后续票**，避免一次性大改引入数据丢失风险。每项都是同一个病：
> seam 存在，但纪律不成立。

## 待办清单

### P1 · `mxcad-file-access.service.ts` 两种 nodeId 索引约定 + 越过 seam 拼 storage key
- **位置**：`authorizeFilesDataAccess` 用 `parts[1]`（路径形态 `YYYYMM/{nodeId}/...`），
  `serveNodeFile` 用 `pathParts[0]`（另一种形态），相隔约 80 行；
  `possiblePaths` 用字面量 `` `mxcad/file/${normalizedFilename}` `` 拼 storage key（3 处 + 一处裸 `normalizedFilename`），
  绕过 `StorageManager` 与前缀剥离规则。
- **为何不在本轮**：这是 IDOR 面，两个 URL 形态是否真的不同、能否统一，需要先厘清
  controller 侧路由与 `normalizeMxcadPath` 的交互，误判会把合法访问改成 404/403。
- **验证口径**：`share.service.ts:371` 的 `isSameNodeStoragePath` 已是带尾部 `/` 的安全比较，可作对照。

### P2 · 10 处裸读 `mxcadUploadPath`，绕过 `resolveMxcadUploadDir`
- **resolver**：`common/utils/mxcad-upload-dir.ts`（自称唯一出口，默认 `../../uploads`）。
- **绕过点**：`batch-download/batch-download-cleanup.service.ts:60`、
  `file-system/storage-quota/storage-info.service.ts:115`、
  `mxcad/core/mxcad-core.module.ts:77`、
  `mxcad/external-ref/ext-ref-preloading.service.ts:42`、
  `mxcad/core/mxcad-version-history.service.ts:714`、
  `mxcad/external-ref/external-reference-update.service.ts:40`、
  `mxcad/infra/file-system.service.ts:33`、
  `mxcad/save/mxcad-save.service.ts:49`、
  `mxcad/save/save-as.service.ts:434,582`、
  `public-file/services/public-file-upload.service.ts:37`。
- **风险**：三派默认值（`../../uploads` / `''` / `undefined`）只在配置键缺失时分道——而那正是最可能分道的时候。
  `ext-ref-preloading.service.ts:42` 无回落，配置缺失时 `resolveStorageRoot` 返回 `undefined`，
  下游 `path.join(undefined, ...)` 直接抛。
- **注意**：`batch-download-cleanup.service.ts:55-62` 是**刻意的**另一套链路
  （`mxcadUploadPath || conversionCacheDir`，与写入方同源），不要顺手改成 resolver。

### P3 · 5 处硬编码 `path.join(process.cwd(), 'uploads')`
- `mxcad/save/mxcad-save.service.ts:321`、`mxcad/save/save-as.service.ts:435,583`、
  `mxcad/upload/file-node-materializer.service.ts:333,371`。
- 与 P2 同根：resolver 默认 `../../uploads`（相对仓库根）、这 5 处是 `cwd/uploads`（相对进程目录），
  两个默认根在源码运行与部署运行下不等价。

### P4 · `/mxcad/file/` 前缀规则散布 7 个文件且行为不一致
- `storage-manager.service.ts`（剥）、`isSameNodeStoragePath`（**刻意不剥**，注释说明是保 403 行为）、
  `common/utils/file-utils.ts`（剥 `/mxcad/file/` 与 `filesData/`，后者 `StorageManager` 不认）、
  `storage/local-storage.provider.ts`（provider 内特判）、
  `version-control/providers/http-version-control.provider.ts`、
  `version-control/providers/mx-version-control.provider.ts`、
  `mxcad/infra/mxcad-file-access.service.ts`（字面量拼接）。
- **注意**：`isSameNodeStoragePath` 的「不剥」是安全相关的刻意选择，收口时必须显式保留该差异，
  不能一刀切成「都剥」。

### P5 · `getNodeDirectoryRelativePath` 的非规范化回落
- `storage-manager.service.ts:248-253`：`parseNodeDirectory` 返回 null 时回落「剥前缀后原样返回」，
  即返回一个 `parseNodeDirectory` 明确判为不合格的路径。
- 唯一消费方 `node-copy-move.service.ts:542`。
- **为何不在本轮**：回落语义被 `storage-manager.service.spec.ts` 明确钉为「保留旧调用方的回落语义」，
  属既有契约。若要收紧需先确认 `copyPlanDirectories` 对不合格源路径的预期行为。

### P6 · 引擎执行 seam 的消费方已从 2 扩到 4
- ADR-0069 假设 backend + conversion-service 两个 adapter，实际
  `admin/mxcad-engine-config.service.ts` 也持有 `runMxcadAssembly`（诊断探测），
  `mxcad/infra/thumbnail-generation.service.ts` 直接用 `spawnManagedProcess`，
  `config/configuration.ts` 亦依赖 `engine-exec`。桶导出无深导入，属边界纪律问题而非泄漏。
