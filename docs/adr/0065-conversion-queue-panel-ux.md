# ADR-0065 转换队列悬浮面板 UX —— 常驻按钮 + 数据管道接通 + 自动展开/收起

**Status**: accepted

## 背景

#428 转换队列地图 v1 建了 `ConversionPanel`（可拖动悬浮药丸按钮 + 展开任务列表面板，全局挂载 `App.tsx`，5s 轮询）+ `conversionQueueStore`（Zustand）+ 徽标/弹窗/管理页/监控 Tab。但用户反馈"CAD 编辑器打开文件看不到任何面板"。

调查发现面板 UI 已建好，但**数据管道断链**导致面板在最常见的"上传"流程下不可见：

- **上传不写 `node.taskId`**：`uploadFiles` 只返回 `{nodeId, tz, ret}`，后台转换走 `runBackgroundCadConversion` 直接调 `fileConversionService.convertFile`（不写 `node.taskId`，节点保持 `fileStatus=PROCESSING`、`taskId=null`）。
- **统一队列列表只查 `taskId != null`**：`GET /api/v1/mxcad/conversion/tasks`（`conversion-task.service.ts:131`）过滤 `taskId: { not: null }` → 上传中的节点（taskId=null）**不在列表里**。
- **前端上传流程不写 store**：`conversionQueueStore.submitTask`/`addLocalTask` 零生产调用方；面板唯一数据入口是"打开文件"流程 `waitForFileReady` 调的 `refreshCloud()`（`mxcadOpenFile.ts:127`），但即便调了，taskId=null 的节点也不在列表 → `tasks` 空 → `visible = tasks.length > 0 = false` → 面板隐藏。
- **无 progress 字段**：executor 层 `TaskStatus.progress` 与 conversion-service `TaskRecord.progress` 都有进度值，但 `ConversionTaskItemDto`/`ConversionStatusResponseDto` 未透传 → 面板只能五态、无百分比。

## 决策

### D1 悬浮按钮常驻

无任务时按钮也显示（轻量收起态，无角标），有任务时显示角标 + Loader。按钮作为可发现入口常驻，无任务时手动点开可看历史/排队。代价=常驻遮挡，靠可拖动 + 默认位置避让缓解。

### D2 数据管道接通（核心）—— v1 走"轻量前端兜底"，"统一云端队列"拆 v2

**v1（路径 B，轻量）**：上传链路**不动**（保持 `runBackgroundCadConversion`，taskId=null），前端上传成功后调 `addLocalTask`（localStorage）写入 store，面板合并本地任务呈现。面板靠 `waitForFileReady` 的节点轮询（`fileHash && path` 就绪）感知完成。**零后端风险**、不碰打开流程。局限：本地任务刷新丢失；上传任务不进云端统一队列（管理页/监控页看不到上传中任务）。

**v2（路径 A，完整架构修复，拆单独票）**：上传链路改走 `AsyncConversionService.convertNode`（写 `node.taskId`），使上传任务真正进统一云端队列。需 4 项后端改动：
1. 删 `drawing-ingest.service.ts` ingest 的 UPLOADING→PROCESSING 迁移（节点保持 UPLOADING，由 convertNode 负责 UPLOADING→PROCESSING，避免 PROCESSING→PROCESSING 非法）。
2. `runBackgroundCadConversion` 内**替换**（非追加）`fileConversionService.convertFile` 为 `convertNode`，避免双重转换。
3. convertNode 成功后**补 materialize 落盘 `node.path`**（否则 `waitForFileReady` 靠 `fileHash && path` 超时打不开——这是打通打开流程的必需项）。
4. convertNode 失败分支补 `releaseConversionReservation` + `nodeTrashService.deleteNode`（对齐 runBackgroundCadConversion 清理语义）。
前端零改动。风险：materialize 触及打开流程，须充分回归。

**为何 v1 不直接走路径 A**：路径 A 的 materialize 改动触及打开流程（`path` 落盘是打开的硬依赖），v1 引入该风险不划算；它属"上传任务进统一云端队列"的架构收敛，适合 v2 单独排票 + 充分回归。v1 的核心诉求"上传后能看到队列面板"用路径 B 即可达成。

### D3 自动展开时机

提交/上传转换任务后自动展开一次（`submitTask`/`addLocalTask` 成功后 `setCollapsed(false)`）。展开后用户可手动收起，下次提交再展开。

### D4 自动收起时机

队列空（无 PENDING/PROCESSING）后自动收起 + 延迟清理已完成项。轮询发现无进行中任务时，已完成项保留 N 秒（默认 5s，可配）后移除，队列空则 `setCollapsed(true)`。

### D5 进度显示粒度

v1 五态 + 排队位置（第 N 个）+ 文件名，**不透传 progress**（DTO 改动跨三层 + SDK 再生成，成本高）。v2 在 status DTO 透传 `progress`（executor 已有），面板显示百分比条。

### D6 覆盖流程

全部走统一队列：个人空间上传、项目上传、下载/导出、打开图纸、历史版本。所有"需要转换"的入口提交转换任务时都经 store 写入；面板全局挂载（已挂 App 根）天然覆盖所有路由。

### D7 本地 vs 云端任务

v1 以云端统一队列为主，无 nodeId 的本地任务保留 localStorage 兜底。有 nodeId 的任务走云端（`submitTask` + `listTasks` 合并）；无 nodeId 的纯本地任务（游客打开图纸，无节点）保留现有 localStorage 机制，面板合并呈现（本地 + 云端）。后端 `submitTask` 强制 nodeId（无则 400），游客场景无节点，不能强行造节点。v2 评估"无节点任务"是否后端化。

### D8 位置/层级

默认**右下角** + 可拖动 + 持久化位置（修正现有"注释右下/CSS 左下"不一致，统一右下角）；z-index 19000（已定）。右下角避开 CAD 左侧工具栏。

## 贯穿约束

1. **conversion-service 黑盒**：前端不直连，全部经后端 `conversion-monitor`/`conversion-task` 代理。
2. **三层一致性**：改 DTO（v2 progress 透传）须重新生成 SDK + MSW。
3. **不破坏既有优化**：`waitForFileReady` 120s 超时、CAD 引擎 `openFileComplete` 事件驱动的"打开完成"判定不变；面板只做"状态可见"，不替代打开等待机制。
4. **不越界改黑盒契约**：v1 不动 conversion-service 的 stats 契约（逐任务明细仍 v2）。

## 后果

- v1 路径 B 是纯前端改动（store + 面板交互 + 上传流程写 store），零后端风险，可独立合并。
- v2 路径 A 是后端重构（上传链路改走 convertNode + materialize），须充分回归打开流程，单独排票。
- 面板从"半孤儿数据管道"变为"上传即见"的常驻队列入口，覆盖所有转换流程。

## 修正记录（2026-09-08，面板 UX 迭代）

本节追加记录面板后续迭代，不推翻上文 v1/v2 决策：

### 上传历史持久化（D2 v1 局限部分解除）

上文 D2 v1 局限「本地任务刷新丢失」对**上传**流程已解除：`UploadManager` 单例新增 localStorage 持久化（key `cloudcad.upload.history`，上限 50，按 `updatedAt` 倒序）。终态（done/failed）任务刷新后仍可见。恢复的历史任务无 `File` 对象（File 不可序列化），故**不可直接重试**——见下「重新选择文件」。

### 面板三 tab 拆分

面板拆为三个独立 tab 组件：`ConversionTab`（转换历史 + live/本地任务）、`DownloadTab`（批量下载任务）、`UploadTab`（上传任务）。`ConversionPanel` 降为壳（910 行），持有搜索/选择/批量栏。上传 tab 自持滚动容器与橡皮框实例，独占 body 区域（不渲染转换/下载 body）。

### 搜索 + 无匹配空态

搜索框三 tab 共用（常显）。转换/下载/上传列表各自按名称过滤（下载匹配**全部** `itemNames`，多文件任务可搜任意文件名）。过滤掉全部行时显示「无匹配结果」空态（区别于「暂无任务」）。

### 多任务合并下载（后端 merge-zip）

新增后端 `POST /file-system/batch-download/merge-zip`（`{ taskIds[] }`，上限 20）：合并多个 COMPLETED 任务为单个 ZIP。zip 模式任务内嵌其 zip 为嵌套条目（无 zip 读取库，不引入新依赖）；individual 模式任务展开 `itemsManifest` 各文件。合并产物为临时按需产物，流式下载后即清理（区别于任务 zip 持久化）。前端下载 tab 批量下载：单任务保持现状（individual→逐文件 / zip→单包），多任务走 merge 一次下载。

### 恢复失败任务「重新选择文件」

从历史恢复的失败任务无 `File` 对象，`retryTask` 拦截入队。新增 `UploadManager.requeueTask(taskId, file)`：为无 File 的失败任务重新选择文件并重新入队（更新文件元数据 + 重置进度/错误 + 回队首）。UI 上此类任务显示「重新选择文件」按钮（隐藏 file input 取新文件），有 File 的失败任务仍显示「重试」。

### 键盘可达性 + 框选浮层

三种可选行（转换历史 deletable 行 / 下载行 / 上传行）加 `tabIndex`/`role=button`/`aria-pressed` + Enter/Space 触发选择（与 click 语义一致，deletable 行仅可选时聚焦）。橡皮框浮层加 `className=rubber-band-overlay`（便于测试定位），浮层随激活 tab 无条件渲染于 body（转换/下载两 tab 行都参与框选）。

> ⚠️ 本节描述的「deletable 行 / 橡皮框浮层 / 多选」已被下文「取消删除功能 + 移除多选（2026-09-10）」整体废弃，仅作历史保留。

### 取消删除功能 + 移除多选（2026-09-10）

面板的「删除」与「多选」被整体移除，改为「文件能打开但不从面板删、记录靠自动过期」的模型。上文「键盘可达性 + 框选浮层」子节的橡皮框多选 / 复选框 / 批量操作条 / deletable 行已全部废弃。

**存储模型澄清（决定「删除」是否有意义）**：

- **云端行**（ConversionTab 历史，有 `nodeId`）= 数据库 `fileSystemNode`，即文件本身。删它 = 软删文件，应从文件浏览器管理，面板不提供删除。
- **下载记录**（DownloadTab）= 数据库 `batchDownloadJob`，由后端 cron 定时清理（非 Redis TTL）。
- **本地行**（ConversionTab，无 `nodeId`，游客打开图纸）= 浏览器 localStorage 临时日志。
- **进行中任务**（PENDING/PROCESSING）= Redis 队列，TTL 过期。

**决策**：

1. **取消所有手动删除**：单条删除、批量删除、下载「清空已完成」全部移除。文件（持久）该从文件浏览器管理；记录（临时）靠后端自动过期。原手动删除是「假删除」——`removeTask` 只删前端 store + localStorage，不删 DB，刷新后 `syncTasksFromServer` 又从后端拉回。
2. **移除多选 UI**：复选框、橡皮框、批量操作条、选中态全部移除（`useFileBrowserSelection` / `useRubberBandSelection` / `BatchActionBar` 从面板停用，hook 本身保留未删）。以后有需要多选再恢复。
3. **行内操作收敛**：云端行仅「打开」（完成且有 `nodeId`）+「取消」（排队中的云端任务）；本地行纯展示（无 `nodeId` 不可打开）；下载行保留「下载 / 取消 / 重试 / 仅重试失败项」。
4. **`syncTasksFromServer` 修复**：后端已清掉的任务从 store 移除，解决「删除后刷新又回来」。因 `getUserTasks` 分页（默认 20 条），仅当 `hasMore === false`（完整列表）时才裁剪本地不存在于后端的任务，且保留进行中（PENDING/PROCESSING）任务，避免与在途任务竞态。

**核心原则**：文件（持久）能打开但不从面板删；记录（临时）靠自动过期，不靠手动删。
