# 移动端文件系统 ↔ PC 功能对齐 —— 计划清单

> **状态**: 5 阶段 + 二期 b/d/g/h 已完成（2026-09-29）；二期余项（SSE 实时进度/回收站项目筛选/保留时间倒计时）未做
> **最后更新**: 2026-09-29
> **分支**: develop（主分支 main 只收正式版本，本工作全部在 develop 做）
> **工作包**: `packages/frontend_mobile`（Vue 3 + Vite 4 + vant + VoerkaI18n）

## 0. 本文档怎么用（子代理必读）

1. **本文档是单一事实源**。所有设计决策已在 §2 定案，所有关键事实已在 §3 核实过——**不要重新决策、不要重新核实**，直接按 §5 的阶段任务执行。
2. 每个阶段**独立提交、独立可验证**。做完一个阶段，先跑该阶段的验证命令，全绿后按提交规范提交，再进入下一阶段。
3. 每完成一个阶段（或发现需要偏离计划时），**更新 §8 状态跟踪表和顶部「最后更新」时间**。
4. §6 的工程红线任何一条违反即打回。§7 列出的并发会话文件**禁止触碰**。
5. 遇到计划没覆盖到的分支决策：小决策（UI 细节、变量命名）自行按「对齐 PC + 移动端原生表达」原则定；**影响范围/行为语义的决策停下来报告，不要擅自扩大范围**。

## 1. 背景与目标

移动端文件浏览器与 PC 端存在功能差距。目标：**功能上先对齐 PC**（口径 = 功能对等 + 移动端原生表达），本轮聚焦三个点名区域（回收站 / 我的项目 / 个人空间）+ 配套小项。

移动端**已对齐、不要动**的能力：项目列表（筛选/搜索/分页/新建）、个人空间文件列表（网格/清单+面包屑+排序+无限滚动+下拉刷新）、文件夹下钻、打开图纸（缓存/版本戳/返回还原位置）、新建文件夹/图纸、上传（秒传+5MB 分片，强于 PC 单请求）、下载（单文件/格式转换/文件夹 zip/任务面板+取消+重试）、重命名、移动/复制（同域，单+批量）、软删除、长按多选+批量操作、项目成员管理、项目角色管理、项目配额条、个人空间配额显示（个人资料页）、分享管理页、分享当前图纸（编辑器菜单）、图纸库/图块库、版本历史（编辑器菜单）。

## 2. 已定案决策（共识，勿再讨论）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 对齐口径 | 功能对等 + 移动端原生表达。排除桌面专属交互：键盘快捷键、框选、拖拽、撤销/重做、右键菜单（长按菜单替代）、面包屑路径编辑。SSE→3s 轮询可接受（保留现状） |
| D2 | 本轮范围 | 回收站、项目重命名/删除、全局搜索、列表内分享入口、多文件上传、位置持久化、两域数据层统一、tab 名「我的项目」 |
| D3 | 二期范围 | 项目操作历史、高级筛选（扩展名/时间/大小区间）、跨项目移动/复制（转移矩阵 ADR-0054）、列表内版本历史入口 |
| D4 | 回收站形态 | 文件浏览器**第 3 个 tab** = 统一回收站页，内含两个 scope chips：「项目」（全局）/「个人空间」。每个 scope 独立：列表/搜索/排序/恢复/彻底删除/清空。**不加项目筛选** |
| D5 | 回收站交互 | 恢复（单条/批量）= 无确认直接执行 + toast；彻底删除（单条/批量）与清空 = 强确认（van-dialog 危险色）；清空按钮在回收站页头部，随当前 scope 生效；每条显示来源徽章（ancestorPath）；已删项目根节点以项目图标展示 |
| D6 | 搜索形态 | 我的项目 tab = `global` 混合结果（项目命中在前 + 文件命中带来源徽章）；项目详情页 = `project_files`（项目内递归）；个人空间 = `personal_space`（整体递归，替换现在「仅当前文件夹」）。点文件=打开、点文件夹=进入、点项目=进入，不做「打开所在位置」独立动作 |
| D7 | 数据层方案 | `useUnifiedFileList` 统一 project/personal 两域（ProjectDetailPage 弃用手写 `loadFiles`）；回收站用**独立薄 composable** `useTrashList`，复用 `UnifiedFileList` 展示组件（不塞进 useUnifiedFileList） |
| D8 | 实施顺序 | ① 数据层统一 → ② 回收站 → ③ 项目重命名/删除+tab 名 → ④ 全局搜索 → ⑤ 小项（分享入口/多文件上传/位置持久化） |
| D9 | 质量门禁 | 每个新 composable 配 vitest 单测；**零后端改动**（不重新生成 SDK、不新增后端测试/集成测试）；i18n 新文案走 extract+compile；移动端风格=无分号/宽 100，**禁 prettier --write**；每阶段独立提交 |

## 3. 已核实事实（勿重新核实）

### 3.1 后端回收站接口（全部现成，零后端改动）

| 接口 | SDK 函数 | 语义 |
|------|---------|------|
| `GET /trash`（无 projectId） | `trashControllerGetTrash` | **全局回收站 = 可访问项目内的已删条目 + 已删项目根节点。不含个人空间内的文件**（`project` 关联过滤只匹配 PROJECT 类型根）。返回节点带 `ancestorPath`（原位置路径）、`isRoot`、`childrenCount`。`deletedByCascade=false`（级联删除的子项不显示，只有顶层删除项） |
| `GET /trash?projectId=X` | `trashControllerGetTrash` | 项目级回收站。**projectId 可传个人空间根 id**（后端项目级分支显式接受 `nodeType in [PROJECT, PERSONAL_SPACE]`，按子树取数） |
| `POST /trash/restore` | `trashControllerRestoreTrashItems` | 批量恢复，body `{ itemIds: string[] }`。**根节点（含已删项目根）走这个** |
| `DELETE /trash/items` | `trashControllerPermanentlyDeleteTrashItems` | 批量彻底删除，body `{ itemIds: string[] }` |
| `DELETE /trash` | `trashControllerClearTrash` | 清空全局回收站。**作用范围与全局列表完全一致**（同一 where），不含个人空间文件 |
| `DELETE /projects/:projectId/trash` | `trashControllerClearProjectTrash` | 清空项目级回收站。**对 PERSONAL_SPACE 根同样有效**（无 nodeType 校验，按子树取数） |
| `POST /nodes/:nodeId/restore` | `nodeControllerRestoreNode` | 单条恢复（非根节点用；后端也支持 PROJECT 类型） |
| `DELETE /nodes/:nodeId?permanently=true` | `nodeControllerDeleteNode` | 单条彻底删除 |

- 回收站列表响应形状 = `{ nodes: FileSystemNodeDto[], total, page, limit, totalPages }`（与子节点列表同形，分页逻辑可直接复用）
- 排序：不传 `sortBy` 时后端默认 `nodeType desc, deletedAt desc`；传了则 `nodeType desc + [sortBy] sortOrder`
- 个人空间根节点不可删除（glossary：不可删除），回收站里不会出现
- 权限：后端强制 `FILE_TRASH_MANAGE`（项目内恢复等）；个人空间 scope 无项目权限检查（owner 独占）

### 3.2 后端搜索 scope 语义（`SearchService`，`packages/backend/src/file-system/search/search.service.ts`）

| scope | 语义 |
|-------|------|
| `global` | **混合结果**：项目命中（`sourceType:'project'`，在前）+ 全部可访问项目内文件命中（`sourceType:'file'`）。`filter` 参数 = all/owned/joined（项目筛选）。**不含个人空间文件** |
| `project_files` | 指定项目内递归（必传 `projectId`） |
| `personal_space` | 个人空间**整体递归**（后端忽略当前文件夹——PC 前端传 projectId 但后端该分支不消费） |

- 搜索支持：`keyword`（含 `ext:`/`type:`/日期等语法解析）、`extension`、`fileStatus`、`sortBy`（白名单 name/createdAt/updatedAt/size，越界 400）、`sortOrder`、`page`/`limit`
- SDK 函数：`nodeControllerSearch`

### 3.3 SDK 关键函数签名（`packages/api-sdk`，移动端经 `@cloudcad/api-sdk` 消费，勿手动改 .gen.ts）

```ts
trashControllerGetTrash({ query?: { projectId?, page?, limit?, sortBy?, sortOrder?, search?, extension?, fileStatus? } })
trashControllerRestoreTrashItems({ body: { itemIds: string[] } })
trashControllerPermanentlyDeleteTrashItems({ body: { itemIds: string[] } })
trashControllerClearTrash()
trashControllerClearProjectTrash({ path: { projectId: string } })
nodeControllerRestoreNode({ path: { nodeId: string } })
nodeControllerDeleteNode({ path: { nodeId: string }, query: { permanently: boolean } })  // permanently 必填
nodeControllerSearch({ query: { keyword, scope, filter?, projectId?, page?, limit?, sortBy?, sortOrder?, extension?, ... } })
projectControllerUpdateProject({ path: { projectId }, body: UpdateNodeDto })  // UpdateNodeDto = { name?, description?, ... } 全可选
projectControllerDeleteProject({ path: { projectId }, query: { permanently: boolean } })  // permanently 必填；UI 删除 = 软删 (false)
projectControllerGetPersonalSpace()  // → { id } 个人空间根 id
```

### 3.4 PC 端真实行为（对照基准，`packages/frontend`）

- **回收站**：PC 实际是三个上下文——项目列表根视图 → 全局回收站（仅项目）；个人空间视图 → 个人空间回收站（`projectId=personalSpaceId`）；项目内视图 → 项目回收站。无独立路由，是 FileSystemManager 内视图切换。不显示保留时间倒计时。PC 恢复操作有确认弹窗（移动端按 D5 省略）
- **搜索**：项目列表根 → `global`（混合）；项目内 → `project_files`；个人空间 → `personal_space`。搜索结果有「打开所在位置」（移动端按 D6 不做，点文件直接打开）
- **项目**：重命名/删除在根工具栏 + 项目列表菜单；删除=软删（进回收站可恢复）；删除前 `PROJECT_DELETE` 权限二次校验（移动端 v1 靠后端 403 兜底）

### 3.5 移动端现状文件地图（`packages/frontend_mobile/src/`）

| 文件 | 现状 |
|------|------|
| `pages/shell/sub-pages/FileBrowserPage.vue`（1054 行） | 壳子页。`van-tabs`：tab0「项目」（筛选 chips + van-search + 项目卡片网格，`loadProjects`/`projectFilter`）；tab1「个人空间」（`useUnifiedFileList('personal')` + `UnifiedFileList`）。长按菜单 = `menuTarget`/`showMenuSheet`/`menuActions`（打开/格式转换下载或打包下载/重命名/移动/复制/删除）。上传 = 单文件 input（仅个人域，`onFileInputChange`）。`loadPersonalSpace()` 已取 `personalSpaceId` |
| `pages/shell/sub-pages/ProjectDetailPage.vue`（1547 行） | 项目详情。tab「文件」（**手写 `loadFiles` 数据层** + 配额条）+「成员」。**未用 useUnifiedFileList**（漂移根源） |
| `pages/shell/components/UnifiedFileList.vue`（826 行） | 纯展示组件。props: `domain/items/loading/showToolbar/breadcrumb/mode/hasMore/keyword/loadMoreFailed/sortBy/sortOrder`；emits: `itemClick/itemMenu/modeChange/breadcrumbClick/fabClick/selectionAction('download'\|'delete'\|'move'\|'copy')/search/loadMore/loadMoreRetry/refresh/sortChange/update:keyword`。**菜单动作在父组件拼**（本组件只 emit itemMenu） |
| `composables/useUnifiedFileList.ts`（181 行） | `UnifiedDomain='project'\|'personal'`。state: `nodes/loading/error/page/totalPages/total/searchText/debouncedSearch/sortBy/sortOrder/currentFolderId/breadcrumbs/loadMoreFailed/hasMore`；actions: `loadNodes/enterFolder/goBackTo/loadMore/retryLoadMore/refresh/setSearch/setSort/loadRootNode/getThumbnailUrl`。搜索 = `getChildren` 的 search 参数（**仅当前文件夹**）。`STORAGE_KEY='fs_breadcrumb_${domain}'` 已定义**未使用**（位置持久化的坑位） |
| `composables/useNodeFormatter.ts` | `FileListItem = { id, name, ext, size?, time?, isFolder?, thumb?, path? }`（**无 ancestorPath**，回收站来源徽章需扩展可选字段）。`formatNodeAsItem/formatSize/formatTime/extractExtension` |
| `pages/shell/components/NodeFolderPicker.vue` | 移动/复制目标选择，单根下钻（跨项目=二期，勿动） |
| `pages/shell/components/RenameNodePopup.vue` | 重命名弹窗（项目重命名可参照其模式） |
| `pages/home/components/ShareLinkSheet.vue` | 分享链接底部弹窗（列表内分享入口复用它，先读它和 `ShareCurrentPopup.vue` 确认入参依赖） |
| `services/mobileUploadService.ts` | `uploadFile({ file, hash, nodeId, onProgress })`（MD5+秒传+分片）。多文件上传=页面层加 `multiple` + 并发循环，service 不改 |
| `stores/shellStack.ts` | 子页栈 + returnTarget（打开图纸返回还原位置用） |
| `utils/apiConfig.ts` | `cachedApiUrl/handleApiError` |

### 3.6 验证命令（`packages/frontend_mobile` 下，或根目录 `pnpm --filter frontend_mobile ...`）

```bash
pnpm type-check        # vue-tsc --noEmit，0 错
pnpm test              # vitest run，全绿
pnpm build             # vite build（最终验收）
pnpm i18n:extract && pnpm i18n:compile   # i18n 变更后必跑（-D/-f/-e 参数在 CLI 3.0.12 失效，用裸命令）
```

## 4. 范围

### 4.1 本轮（5 阶段，见 §5）
回收站（阶段2）、项目重命名/删除+tab 名（阶段3）、全局搜索（阶段4）、列表内分享/多文件上传/位置持久化（阶段5）、两域数据层统一（阶段1，工程前置）。

### 4.2 二期
**已完成（2026-09-29，用户明确立项实施，见 §8）**：项目操作历史（b）、高级筛选（d）、跨项目移动/复制（g，转移矩阵 ADR-0054 前端预判）、列表内版本历史入口（h）。
**仍未做**：SSE 实时进度、回收站项目筛选、保留时间倒计时。

## 5. 执行计划

### 阶段 1：数据层统一（纯重构，零行为变化）

**目标**：`ProjectDetailPage` 的文件列表数据层从手写 `loadFiles` 切换到 `useUnifiedFileList('project')`，消除两域漂移。

任务清单：
- [ ] 通读 `ProjectDetailPage.vue`，标出文件列表数据逻辑全部（loadFiles/分页/排序/搜索/面包屑/loadMore/下拉刷新/配额条与上传禁用联动）
- [ ] 与 `useUnifiedFileList` 能力逐项比对；composable 缺的能力**加进 composable**（两域共用），项目页特有的行为（如权限门控上传）留在页面层
- [ ] `ProjectDetailPage` 改用 composable，删除手写 loadFiles 及其孤儿引用
- [ ] 确认 `loadRootNode` 语义覆盖项目根（项目页入口传 projectId 作根）

**验证**：`pnpm type-check` 0 错；`pnpm test` 全绿；`grep -n "loadFiles" ProjectDetailPage.vue` 零命中；代码走查：数据流（加载/分页/排序/搜索/面包屑/刷新）与重构前一致。
**提交**：`refactor(mobile): 项目详情页文件列表改用 useUnifiedFileList，消除两域数据层漂移`

### 阶段 2：回收站

**目标**：`FileBrowserPage` 第 3 个 tab「回收站」= 统一回收站页（scope chips：项目/个人空间）。

任务清单：
- [ ] 新建 `composables/useTrashList.ts`（薄 composable，API 如下）：
  ```ts
  useTrashList(personalSpaceId: Ref<string | null>)
  // state: scope('projects'|'personal'), nodes(FileSystemNodeDto[]), loading, error,
  //        page, totalPages, total, searchText(300ms 防抖), sortBy, sortOrder
  // actions:
  //   load()            → trashControllerGetTrash({ query: { projectId: scope==='personal' ? personalSpaceId.value : undefined, page, limit: 30, search?, sortBy?, sortOrder? } })
  //   loadMore() / refresh() / setSearch(v) / setSort(by, order)
  //   setScope(s)       → 清搜索+回第 1 页+load
  //   restore(item)     → item.isRoot ? trashControllerRestoreTrashItems({body:{itemIds:[item.id]}}) : nodeControllerRestoreNode({path:{nodeId:item.id}})
  //   restoreBatch(ids) → trashControllerRestoreTrashItems({body:{itemIds:ids}})
  //   permanentDelete(item) → nodeControllerDeleteNode({path:{nodeId},query:{permanently:true}})
  //   permanentDeleteBatch(ids) → trashControllerPermanentlyDeleteTrashItems({body:{itemIds:ids}})
  //   clear()           → scope==='projects' ? trashControllerClearTrash() : trashControllerClearProjectTrash({path:{projectId:personalSpaceId.value}})
  // 每个动作成功后：toast + 回第 1 页重载；失败：error toast（403 显示权限错误文案）
  ```
- [ ] `FileBrowserPage.vue` 加第 3 个 `van-tab title="回收站"`：
  - scope chips（项目/个人空间）——复用项目筛选的 `filter-chip` 样式
  - `van-search`（关键词）+ 排序入口（复用个人 tab 的排序 ActionSheet 模式）
  - 复用 `UnifiedFileList`：`items`=trash 节点格式化、`breadcrumb=[]`、隐藏 FAB、`showToolbar` 保留（搜索+排序+视图切换）
  - `itemMenu` → 回收站菜单：**恢复 / 彻底删除（危险色）**（文件夹项同样两项）
  - 长按多选 → 批量恢复 / 批量彻底删除
  - 页头「清空回收站」按钮 → van-dialog 强确认（危险色，文案说明不可恢复）
  - 来源徽章：每条显示 `ancestorPath`（格式化为浅色小字，参照 PC FileItem searchPathBadge 的位置）
  - 已删项目根：`isRoot && nodeType==='PROJECT'` → 用 `ProjectIcon`（`components/FileIcons`）
- [ ] `UnifiedFileList.vue` 必要小改（不破坏现有两域调用）：
  - 加 `showFab?: boolean`（默认 true）；trash tab 传 false
  - `selectionAction` emit 类型扩为 `'download'|'delete'|'move'|'copy'|'restore'|'permanentDelete'`
  - 确认 `breadcrumb=[]` 时面包屑条不渲染（若会渲染空条，加守卫）
  - 来源徽章：若 `FileListItem` 无 `ancestorPath`，在 `useNodeFormatter.ts` 加**可选字段** `ancestorPath?: string`（`formatNodeAsItem` 透传 `node.ancestorPath`），`UnifiedFileList` 在 list/grid 项上渲染（仅非空时）
- [ ] 权限：personal scope 全动作可见；projects scope 不建逐条权限查询，后端 403 → 权限错误 toast（v1 简化，决策已定）
- [ ] i18n：新文案（回收站、项目、个人空间（scope chip 文案）、恢复、彻底删除、清空回收站、已恢复、已彻底删除、清空确认文案、权限错误等）→ 先 grep 语言文件查已有 key 复用，再 `t()` 写入 → `pnpm i18n:extract && pnpm i18n:compile`
- [ ] 测试：新建 `composables/useTrashList.spec.ts`（mock SDK 函数）覆盖：scope 切换重载、load/分页/搜索防抖/排序、restore 根 vs 非根分支、批量恢复、彻底删除单条/批量、clear 两 scope 分支、失败 toast 路径

**验证**：`pnpm type-check` 0 错；`pnpm test` 全绿（含新 spec）；现有两域（项目 tab/个人空间 tab）行为不变（UnifiedFileList 改动处走查）。
**提交**：`feat(mobile): 回收站统一页（项目/个人空间双 scope：恢复/彻底删除/清空/来源徽章）`

### 阶段 3：项目重命名/删除 + tab 名

**目标**：我的项目 tab 补齐项目级操作，tab 名对齐 PC。

任务清单：
- [ ] `FileBrowserPage.vue` tab0 标题「项目」→ `t('我的项目')`（注意：i18n key 变更会影响语言文件，extract 后核对）
- [ ] 项目卡片操作入口：先读现有卡片交互（点击=进入项目）。加**长按菜单**（与文件项一致的 action-sheet 模式）：**重命名 / 删除（危险色）**
  - 重命名：参照 `RenameNodePopup.vue` 模式（输入框+名称校验复用 `utils/validateName.ts`）→ `projectControllerUpdateProject({ path:{projectId}, body:{ name } })`（`UpdateNodeDto` 全可选，只传 name 不碰 description）
  - 删除：van-dialog 强确认（说明：删除后进回收站可恢复）→ `projectControllerDeleteProject({ path:{projectId}, query:{ permanently: false } })`（**permanently 必填**）
  - 成功后刷新项目列表（loadProjects）；403 → 权限错误 toast
- [ ] 逻辑抽到 `composables/useProjectActions.ts`（可测性），页面只做接线
- [ ] i18n + extract + compile
- [ ] 测试：`useProjectActions.spec.ts`（重命名成功/校验失败/403、删除成功/403/取消）

**验证**：`pnpm type-check` 0 错；`pnpm test` 全绿。
**提交**：`feat(mobile): 项目重命名/删除 + tab 名统一「我的项目」`

### 阶段 4：全局搜索

**目标**：三个 scope 的递归搜索（D6）。

任务清单：
- [ ] `useUnifiedFileList.ts` 搜索行为改造：
  - 新增 `rootId` ref（`loadRootNode` 时记录）
  - `debouncedSearch` 非空时改走 `nodeControllerSearch`：
    - domain `personal` → `{ keyword, scope: 'personal_space', page, limit: 30, sortBy, sortOrder }`
    - domain `project` → `{ keyword, scope: 'project_files', projectId: rootId, page, limit: 30, sortBy, sortOrder }`
  - 搜索态：`nodes` = 搜索结果；`enterFolder` 时先清搜索（对齐 PC 上下文切换清搜索）；清空搜索词 → 回 `getChildren` 正常列表
  - 搜索结果交互：文件夹→进入、文件→打开（沿用现有 itemClick 分发）
- [ ] `FileBrowserPage.vue` tab0（我的项目）：
  - `keyword` 非空 → `nodeControllerSearch({ query: { keyword, scope: 'global', filter: projectFilter, page, limit: 30 } })`
  - 混合结果渲染：`nodeType==='PROJECT'` 命中 → 项目卡片样式（点击进入项目）；文件/文件夹命中 → 文件行（点=打开/进入）+ 来源徽章（`ancestorPath`，先核实搜索响应是否返回该字段，**不返回就不显示徽章**，勿自行拼）
  - `keyword` 为空 → 回 `projectControllerGetProjects` 正常列表（保留现有筛选/分页逻辑）
- [ ] i18n（搜索 placeholder、无结果文案——先 grep 已有 key）+ extract + compile
- [ ] 测试：新建 `composables/useUnifiedFileList.spec.ts`（mock SDK）覆盖：搜索 scope 派生（personal/project）、搜索结果替换、清空搜索回退、enterFolder 清搜索；tab0 global 搜索逻辑若留在页面层则抽 composable 后测

**验证**：`pnpm type-check` 0 错；`pnpm test` 全绿。
**提交**：`feat(mobile): 全局递归搜索（global/project_files/personal_space 三 scope 对齐 PC）`

### 阶段 5：小项（分享入口 / 多文件上传 / 位置持久化）

任务清单：
- [x] **列表内分享入口**：已读两组件——`ShareCurrentPopup` 入参 = `{ fileId, fileName }`（解耦，不依赖编辑器上下文）→ 文件项菜单（非文件夹）加「分享」→ 打开 ShareCurrentPopup（全套 UI：有效期/二维码/已有分享/撤销，优于最小 ShareLinkSheet）
- [x] **多文件上传**：file input 加 `multiple`；`onFileInputChange` 遍历 `Array.from(input.files)` 走 `runUploadPool`（`utils/uploadPool.ts`，并发 2 纯 Promise 池零依赖）；逐文件独立成功/失败 toast，全部结束后统一重载一次；两页（FileBrowserPage 个人 tab / ProjectDetailPage）同改
- [x] **位置持久化**：`useUnifiedFileList` 启用 `STORAGE_KEY`：
  - `enterFolder`/`goBackTo` → `persistLocation()`（根目录不写，避免覆盖离开位置）
  - `loadRootNode`：有存档 → `nodeControllerGetNode` 验证节点存在 → 恢复 `currentFolderId`+`breadcrumbs`；失败/存档损坏 → 清存档回根目录
  - key：personal 域 = `fs_breadcrumb_personal`；project 域 = `fs_breadcrumb_project_{projectId}`（每项目独立）
  - `loadRootNode(override)` 参数承接「打开图纸返回」的 returnTarget（优先于存档，两页 initFileList 改走 loadRootNode 顺带补上 rootId）
- [x] i18n + extract + compile（零新增 key：分享/上传成功/上传失败，请重试/上传中... 均已有；「上传中 {pct}%」因进度 toast 移除而闲置，随并发会话下次 extract 自然清）
- [x] 测试：`uploadPool.spec.ts` 4 例（并发上限/失败隔离/空列表）+ `useUnifiedFileList.spec.ts` 持久化 7 例（读写/key 隔离/回退不覆盖/还原/节点已删清存档/override/损坏存档）

**验证**：`pnpm type-check` 0 错；`pnpm test` 全绿；`pnpm build` 成功。
**提交**：`feat(mobile): 文件列表分享入口 + 多文件上传 + 文件夹位置跨会话持久化`

## 6. 工程红线（违反即打回）

1. **API 调用只走 `@cloudcad/api-sdk` 生成函数**（import 路径跟随所在文件现状：`@cloudcad/api-sdk/sdk.gen` 或 `@/api-sdk`）。禁止原生 `fetch`/`FormData`。multipart 场景传普通对象 `as never`
2. **代码风格**：无分号、宽 100、匹配周边风格。**禁 prettier --write**（移动端 HEAD 基线在根配置下 check 本就失败，--write 制造整文件假 diff）；禁对 .md 跑 prettier
3. **状态管理**：composable 返回 ref/computed，**禁模块级变量**；Pinia 仅在跨页面共享状态时用（本轮预计不需要新增 store）
4. **i18n**：所有用户可见文案走 `t()`；新增前先 grep `src/languages/messages/zh-CN.ts` 查已有 key（如 取消=819、删除/重命名/移动/复制/打开 等已存在）；改完必跑 `pnpm i18n:extract && pnpm i18n:compile`，**语言文件与源码一起提交**（不跑 compile 会留下「default.json 有键/messages 没有」的不一致）
5. **测试**：vitest，mock SDK 函数；spec 命名 `*.spec.ts` 放同目录；禁止 setState 注入期望态式的假测试
6. **提交**：每阶段一个 commit，**显式 pathspec 只提交自己的文件**（`git commit -m "..." -- packages/frontend_mobile/<path>...`），绝不 `git add -A`；commit message 用 `feat(mobile):`/`refactor(mobile):` 前缀 + 中文描述
7. **范围纪律**：二期清单（§4.2）一律不做；发现计划外缺陷只记录到 §9，不顺手修
8. **禁 git 恢复/回退/暂存/切分支类操作**（工作区钩子硬拦截）；需要撤销用非破坏性方式

## 7. 并发会话警告（2026-09-29 快照）

本工作区多 AI 会话共享。**另一会话正在做 auth/profile 域重构**，以下文件有未提交在途改动，**全部禁止触碰**（改到即停并报告）：

`src/utils/authSession.ts`、`src/utils/authSession.spec.ts`、`src/utils/errorHandler.ts`、`src/utils/apiConfig.ts`、`src/utils/apiError.ts`、`src/utils/profileDisplay.ts`、`src/utils/profileDisplay.spec.ts`、`src/composables/useAuthState.ts`、`src/composables/useUser.ts`、`src/composables/useSave.ts`、`src/composables/useFileLoader.ts`、`src/composables/useMemberCenter.ts`、`src/composables/useProfileData.ts`、`src/composables/useProfilePassword.ts`、`src/composables/useShellMode.ts`、`src/composables/useLibrary.ts`、`src/composables/useLibrary.spec.ts`、`src/pages/shell/sub-pages/ProfilePage.vue`、`src/pages/home/hooks/useMenu.ts`、`src/pages/home/index.vue`、`src/App.vue`、`src/main.ts`、`src/router/index.ts`、`src/stores/shellStack.ts`、`src/services/pendingImageService.ts`、`src/services/thumbnailService.ts`、`src/services/saveService.spec.ts`、`src/styles/main.scss`

**本计划允许触碰的文件**：`FileBrowserPage.vue`、`ProjectDetailPage.vue`、`UnifiedFileList.vue`、`useUnifiedFileList.ts`、`useNodeFormatter.ts`、`RenameNodePopup.vue`（只读参照）、`ShareLinkSheet.vue`（视阶段 5 结论）、`mobileUploadService.ts`（视阶段 5 结论）、`src/languages/**`、新建的 `useTrashList.ts`/`useProjectActions.ts`/各 spec。

> 动手前先 `git status --short -- packages/frontend_mobile/` 重查一次：若上表文件之外又出现新的在途改动，先判断归属再动。

## 8. 状态跟踪

| 阶段 | 状态 | 完成日期 | commit | 备注 |
|------|------|---------|--------|------|
| 1 数据层统一 | ✅ 完成 | 2026-09-29 | 032a974 | 项目详情页文件列表改用 useUnifiedFileList，消除两域漂移 |
| 2 回收站 | ✅ 完成 | 2026-09-29 | d51c4d9 | 统一回收站页（项目/个人空间双 scope：恢复/彻底删除/清空/来源徽章）+ useTrashList.spec 18 例 |
| 3 项目重命名/删除+tab 名 | ✅ 完成 | 2026-09-29 | e958eb1 | 项目长按菜单重命名/删除（软删进回收站）+ tab 名「我的项目」+ useProjectActions.spec 7 例 |
| 4 全局搜索 | ✅ 完成 | 2026-09-29 | 996a18e | 三 scope 递归搜索：tab0 global 混合结果（项目卡片+文件行+来源徽章）/ personal_space / project_files；useProjectSearch + useUnifiedFileList 搜索分支，20 例 spec |
| 5 小项 | ✅ 完成 | 2026-09-29 | 9436b26 | 列表内分享（ShareCurrentPopup 解耦复用）+ 多文件上传（runUploadPool 并发 2）+ 位置持久化（存档还原+节点验证回退）；11 例新 spec；initFileList 改走 loadRootNode 补 rootId |
| 二期 b 操作历史 | ✅ 完成 | 2026-09-29 | 0bf2d3b | 项目 nav-bar 入口 → ProjectAuditLogPopup（今天/昨天/更早三桶分组+操作/成员筛选+分页）；定位=文件走统一打开入口/文件夹取父目录跳位；FILE_DELETE 等不可定位动作不显示定位；useProjectAuditLog.spec 9 例 |
| 二期 d 高级筛选 | ✅ 完成 | 2026-09-29 | 0bf2d3b | FileFilterPopup（扩展名多选/创建+修改时间区间/大小区间）→ useUnifiedFileList.setFilters 统一织入 getChildren/search 两路请求（服务端筛选，参数名对齐后端 QueryChildrenDto/SearchDto）；筛选按钮高亮+变更回第一页；筛选用例 4 例 |
| 二期 g 跨项目移动/复制 | ✅ 完成 | 2026-09-29 | 0bf2d3b | transferPolicy.ts 六域矩阵前端预判（与后端 node-mutation.guard 同语义：库源 move 恒拒/出向+入向双查/设置缺失保守拒）+ useTransferTargets（个人空间+我的项目根列表）+ useCrossProjectTransfer（切根实时重算）；NodeFolderPicker 加根切换器+disabledReason 红字禁用；跨项目 move 二次确认；后端错误透传（403 策略/权限/配额文案不吞成通用失败）；transferPolicy.spec 11 例 |
| 二期 h 列表内版本历史 | ✅ 完成 | 2026-09-29 | 0bf2d3b | 文件项菜单「版本历史」→ VersionHistoryPopup 显式 target（projectId+path 取自节点，无需先开编辑器）；useVersionHistory.loadHistory 加可选 target 参数（编辑器路径不变）；选中版本 URL 带 ?v= 走统一打开入口；FileListItem 补 projectId 字段 |
| 二期 i18n | ✅ 完成 | 2026-09-29 | d470a18 | 40 新键（b/d/g/h）extract+compile；顺带移除零引用的死键 2024「上传中 {pct}%」；恢复 831/852（仍被 useFileLoader 三元内引用、extract 扫描器不可见，防 en/ko 翻译丢失） |

**整体 DoD**：5 阶段 + 二期 b/d/g/h 全部 ✅，R7 留票已修（`e809e64`）；`pnpm type-check` 本工作范围 0 错（auth 页 7 错 + m_mx_find_text JSX 错为预存，属其他工作流）；`pnpm test` 382/382 全绿；`pnpm build` 成功；develop 分支 commit 可追溯（032a974/d51c4d9/e958eb1/996a18e/9436b26 + 0bf2d3b/d470a18/002bd81 + e809e64）。

## 9. 已知风险与开放问题

| # | 风险/问题 | 处理 |
|---|----------|------|
| R1 | `UnifiedFileList` 的 FAB 渲染与 `breadcrumb=[]` 的空条行为未逐行确认 | 阶段 2 动手时先读模板确认，按 §5 阶段 2 任务清单加 `showFab` prop 与空条守卫 |
| R2 | ~~`nodeControllerSearch` 响应节点是否带 `ancestorPath` 未实测~~ 已核实（阶段 4）：后端 `search.service.ts` 的 `injectAncestorPaths` 在 searchProjectFiles/searchAllProjects/searchLibrary/searchPersonalSpace 均注入 `ancestorPath`（名称路径 `"根 > 父1 > 父2"`，**无节点 id**）；global scope 的文件命中经 searchAllProjects 注入、项目命中为根节点无该字段。故来源徽章直接渲染 `ancestorPath`（非空才显示）；文件夹命中无法还原面包屑 → 移动端「进入」= 跳所属项目根/个人空间 tab（PC 用新标签+高亮，不适用移动端） |
| R3 | ~~`ShareLinkSheet` 入参是否依赖编辑器上下文未确认~~ 已核实（阶段 5）：`ShareCurrentPopup` 入参 = `{ fileId, fileName }`（`withDefaults`，解耦、不依赖编辑器上下文）→ 直接复用全套分享 UI（有效期/二维码/已有分享/撤销），文件项菜单加「分享」打开；`ShareLinkSheet` 仅作其内部剪贴板降级 sheet，不单独作入口 |
| R4 | 并发会话可能随时改到 `useUnifiedFileList.ts` 周边文件（其当前仅 CRLF 差异无内容改动） | 每阶段开工前重查 `git status`；若该文件出现内容级在途改动，停下报告，勿叠加 |
| R5 | `node_modules/.bin` 曾被并发会话清空 | 命令报 command not found 时根目录 `CI=true pnpm install` 恢复 |
| R6 | 项目删除的 403 文案与通用错误文案的区分 | 阶段 3 用 `handleApiError` 现有能力，403 统一走权限错误文案（grep 已有 key） |
| R7 | ~~计划外缺陷（阶段 4 发现，未修）：`useUnifiedFileList.goBackTo(-1)`（面包屑「根目录」）把 `currentFolderId` 置 null 而非根 id → `loadNodes` 无目标早退，列表停留在上一子文件夹的旧内容~~ **已修（2026-09-29，`e809e64`）**：回根置 `rootId`，`loadNodes` 重查根子节点；回归用例同步改为断言根 id + 根子节点重查 + 回根不覆盖存档（persistLocation 的 `=== rootId` 跳过分支天然兼容） |
