# 移动端 vs PC 端功能差距清单（Mobile Gap Tracker）

> 2026-09-10 生成，基于 `packages/frontend_mobile` 与 `packages/frontend` 代码级对比（4 个域逐文件通读）。
> 每条：`ID / 缺口 / PC 参照 / 移动端做法 / 优先级 / 状态`。
>
> **状态图例**：⬜ 未开始 | 🚧 进行中 | ✅ 已完成 | ⏸ 待用户确认 | ➖ 移动端不适用（附说明）
>
> **完成顺序**：P0（安全/数据风险）→ P1（高频日常）→ P2（体验/信息密度）→ P3（大块功能）。
> 同一条缺口在多个页面复用时只列一处，其余页面引用 ID。

## 移动端 UI/UX 转译原则（所有条目通用）

| PC 形态 | 移动端做法 |
|---|---|
| 右键菜单 | 长按 500ms ActionSheet + 列表行 ellipsis 按钮 |
| 模态对话框 | 底部弹窗 `van-popup position=bottom`（复用现有 panel 样式） |
| 键盘快捷键（Ctrl+A/Shift 多选/框选） | 无等价，功能入口放菜单/ActionSheet；多选=长按进多选模式 |
| 拖拽上传/拖拽移动 | 点按上传；「移动到文件夹」ActionSheet + 文件夹选择弹窗 |
| hover 行内按钮 | 列表行常驻 ellipsis 按钮 |
| 表格列排序 | 排序 ActionSheet / van-dropdown-menu |
| Dashboard 首页 | 暂不做（移动端入口=文件浏览器，见 A-30） |
| 新标签页打开 | ➖ 不适用（触屏无多标签），ActionSheet 提供「打开文件所在位置」 |

---

## A. 文件浏览器 FileBrowserPage（/shell/file）

### P0 安全/数据

- [ ] **A-01 节点权限门控**：按节点 `canEdit/canDelete/canCopy/canMove` 隐藏/禁用操作（PC `FileSystemContent.tsx:199-225` 加载期悲观隐藏）。移动端：列表项数据带权限字段，无权限的操作在 ActionSheet 中不显示或禁用 + Tooltip 文案。
- [ ] **A-02 删除前权限校验 + 彻底删除选项**：PC `useFileSystemCRUD.ts:343-366` 删除前校验、含「彻底删除」选项。移动端：删除 ActionSheet 提供「删除（进回收站）/彻底删除」两项，彻底删除需二次确认。

### P1 高频日常

- [x] **A-03 单条目操作菜单**：列表行 ellipsis 按钮（现 `UnifiedFileList.vue:260` 是死控件）+ 长按 ActionSheet：打开/重命名/移动/复制/下载/分享/版本历史/拷贝路径/删除。PC 参照 `FileSystemContextMenu.tsx` + `FileItem.tsx:964-1031` 行内按钮。✅ 已实施（2026-09-10）：列表行 ellipsis + 网格角标按钮均 emit `itemMenu`，两父页弹 `van-action-sheet`（打开/重命名/移动/复制/删除，删除红字）；长按仍为多选。✅ 2026-09-11 追加（Batch 3）：菜单按 `isFolder` 分叉——文件项「格式转换下载」（A-06）/ 文件夹项「打包下载」（A-08）。分享/版本历史/拷贝路径 3 项（A-27/A-28/A-29）待后续批次。
- [x] **A-04 重命名**：底部弹窗输入（保留扩展名 + 名称合法性校验：非法字符/保留名/长度/首尾点，PC `validateFolderName` L64-97）。✅ 已实施（2026-09-10）：`RenameNodePopup.vue`（keepExtension 时扩展名静态展示）+ 两页 `nodeControllerUpdateNode` 接线。
- [x] **A-05 移动/复制（单条 + 批量）**：文件夹选择底部弹窗（目录树/面包屑导航，非 PC 的 SelectFolderModal 全屏）。✅ 已实施（2026-09-10）：`NodeFolderPicker.vue`（getChildren 逐级下钻 + 面包屑回退 + 源文件夹禁选）；单条 `nodeControllerMoveNode/CopyNode`、批量 `nodeControllerBatchMoveNodes/BatchCopyNodes`；源文件夹自身不可选为目标，子树内目标由后端拒绝 + toast 兜底。
- [x] **A-06 下载格式转换**：ActionSheet 选格式（dwg/dxf/pdf/mxweb）→ 底部弹窗选 DWG 版本/PDF 纸张/色彩（复用 PC `DownloadFormatModal` 字段，移动端底部弹窗形态）。✅ 已实施（2026-09-11）：`DownloadFormatPopup.vue`（格式 chip + DWG 版本 23/25/27/29/33 + PDF 宽高/黑白彩色，打开即重置默认值）；两页文件项菜单「格式转换下载」→ `downloadControllerDownloadNodeWithFormat({ query:{format,...}, parseAs:'blob' })` → `URL.createObjectURL` 触发下载（已确认移动端 `responseTransformer` 对 Blob 透传，Blob 无 `code` 键）。
- [x] **A-10 排序控件**：van-dropdown 或 ActionSheet（更新时间/创建时间/名称/大小，升降序）。✅ 已实施（2026-09-11，Batch 4）：`UnifiedFileList.vue` 工具栏 sort 按钮 → `van-action-sheet`（修改时间/创建时间/名称/大小，subname 显示 ↑/↓ 当前方向）；同字段再点反转、切字段用自然默认方向（名称升序、其余降序）→ emit `sortChange`；`useUnifiedFileList.setSort` 与 `ProjectDetailPage.onFileSortChange` 带 `sortBy`/`sortOrder` 回到第一页重查。后端白名单 `ALLOWED_SORT=['name','createdAt','updatedAt','size']`（`file-tree.service.ts:516`），越界抛 400 `error.file_extra.sort_unsupported`。
- [x] **A-11 项目筛选 Tab**：「全部/我创建的/我加入的」van-tabs 或 chips（PC `ProjectFilterTabs.tsx`）。✅ 已实施（2026-09-11，Batch 4）：`FileBrowserPage.vue` 项目 Tab 顶部水平滚动 chips（全部/我创建的/我加入的，对齐 PC `ProjectFilterTabs.tsx` 的 all/owned/joined）→ `projectControllerGetProjects({ query:{ filter } })`（`QueryProjectsDto.filter` 注释 all-全部/owned-我创建的/joined-我加入的）+ watch 回第一页重查。
- [x] **A-19 全选**：多选模式下顶部「全选」开关。✅ 已实施（2026-09-11，Batch 4）：`UnifiedFileList.vue` 多选栏左侧「全选/取消全选」（`checked`/`circle` 图标 + `allSelected` computed），作用于当前已加载页（服务端分页下与 PC「全选当前视图」语义一致，不做跨页全选）；计数文案改 `t('已选 {count} 项')`。
- [ ] **A-22 多文件上传**：input 加 `multiple`，逐个走上传管线，进度合并展示。

### P2 体验/信息密度

- [x] **A-07 批量下载任务体系**：zip 打包/进度/取消/重试失败项（PC `useBatchDownload.ts` 全套）。移动端：任务列表底部弹窗 + 进度条。✅ 已实施（2026-09-11）：`useBatchDownload.ts` composable（GetUserTasks 列表/CancelTask/RetryFailedItems/DownloadZip 锚点）+ `BatchDownloadPanel.vue` 底部弹窗（任务卡 + `van-progress` 进度条 + 状态标 + 失败计数 + 下载/取消/重试失败项按钮）；面板打开期间 3s 轮询进度（移动端无 SSE，`onUnmounted` 清 timer）；两页 FAB 新增「下载任务」入口。
- [x] **A-08 文件夹下载**：ActionSheet「下载文件夹」→ zip。✅ 已实施（2026-09-11）：文件夹项菜单「打包下载」→ `batchDownloadControllerGetFolderFiles`（递归树 `{nodeId,fileName,isFolder,children}`）→ 前端 `flattenFolderTree` 展平为 `BatchFileItem[]`（relativePath 由嵌套目录名拼接）→ `batchDownloadControllerCreateTask({ mode:'zip' })` → 打开任务面板看进度。空文件夹 toast 兜底。
- [ ] **A-12 项目卡片信息**：描述（2 行截断）、成员数、真实封面缩略图（PC `FileItemInfo.tsx:43-106`）。
- [ ] **A-13 配额进度条**：顶部或卡片底部 used/limit，>90% 变色（PC `FileSystemHeader.tsx:267-304`）。
- [x] **A-14 加载更多失败重试条**：列表已有内容时底部失败条 + 重试，不整页替换（PC `FileSystemContent.tsx:86-91`）。✅ 已实施（2026-09-11，Batch 4）：`useUnifiedFileList.loadMoreFailed`（`error!=='' && page>1`）+ `retryLoadMore`——`loadMore` 已把 page 推到失败页，重试重跑当前页不会重复追加已加载页；`UnifiedFileList` 两种模式 footer 在 loading 与「没有更多了」之间插入「加载失败，点击重试」；项目详情侧对称 `fileLoadMoreFailed`（catch 时 `page>1`）+ `retryLoadMoreFiles`。首屏失败仍走整页错误 + 重试按钮。
- [x] **A-15 手动刷新**：下拉刷新（van-list onPullRefresh）替代 PC 刷新按钮。✅ 已实施（2026-09-11，Batch 4）：`UnifiedFileList` 把网格/清单两种模式包进 `van-pull-refresh`（`:items-length="items.length"`，列表不足一个屏时手势会自动静默失效，避免误判为 bug）→ emit `refresh` → composable `refresh()`（page=1 整页重查）；`onPullRefresh` 等父组件 loading 回落后再收起动画，8s 兜底防请求挂死。CSS 坑：Vant `__track` 只有 `height:100%` 不是 flex 容器，必须补 `display:flex;flex-direction:column;min-height:0`，否则内部滚动容器的 `flex:1` 失效、列表被 `overflow:hidden` 裁掉。
- [x] **A-16 视图模式持久化**：网格/列表存 localStorage。✅ 已实施（2026-09-11，Batch 4）：新增 `src/composables/useViewMode.ts`（key `fs_view_mode_<scope>`，watch 自动落盘，非法值回落网格）；个人空间 `useViewMode('personal')`、项目详情 `useViewMode('project')` 各自记住（PC 也按用户持久化视图偏好）；`UnifiedFileList` 加 `watch(props.mode)` 与内部展示态同步。
- [ ] **A-20 回收站**：独立子视图（恢复/批量恢复/清空/彻底删除），入口=列表页顶部切换或菜单项。
- [ ] **A-23 新建项目支持描述**：创建弹窗加描述字段（500 字）。
- [x] **A-24 名称合法性校验**：新建文件夹/项目/图纸共用 `validateName`（与 A-04 同函数）。✅ 已实施（2026-09-10）：`src/utils/validateName.ts`（移植 PC `validateFolderName` 全规则）；已接入两页新建文件夹 + `useCreateDrawing`（名称非空时校验）。新建项目弹窗暂无名称输入框，待 B-11 项目改名时一并接入。
- [ ] **A-25 转换失败徽标**：fileStatus=FAILED 红标（PC `FileItemInfo.tsx:67-79`）。
- [ ] **A-27 版本历史入口（文件项级）**：ActionSheet「版本历史」→ 底部弹窗列表（可打开历史版本）。
- [ ] **A-28 文件项分享入口**：ActionSheet「分享」→ 复用 ShareManagePage 的分享创建弹窗。
- [ ] **A-29 打开文件所在位置/拷贝路径**：ActionSheet 两项。

### P3 大块/低价值

- [ ] **A-09 搜索高级筛选**：格式/大小/时间筛选面板（底部弹窗形态）。
- [ ] **A-17 每页条数选择器** ➖ 移动端无限滚动为主，暂不做。
- [ ] **A-18 面包屑路径可编辑重命名** ➖ 移动端低价值，暂不做。
- [ ] **A-21 撤销/重做 + 剪贴板复制剪切粘贴**：PC 命令栈形态，移动端暂不做（有回收站 A-20 兜底）。
- [ ] **A-26 外部参照管理**：缺失参照上传/预览/格式下载（PC `FileItem.tsx:234-339`）。
- [ ] **A-30 Dashboard 首页**（统计卡/最近文件/快捷操作/横幅）：⏸ 移动端入口定位待确认，暂不做。

---

## B. 项目详情 ProjectDetailPage（/shell/file/project/:id）

### P0 安全/数据

- [x] **B-01 修复搜索框死控件**：`UnifiedFileList` emit `search` 未绑定 → 绑定后传搜索参数给 `loadFiles`。✅ 已实施（2026-09-10）：`UnifiedFileList` 加 `keyword` prop + `update:keyword` emit，`ProjectDetailPage` 绑定 `fileSearch` 300ms 防抖 → `loadFiles(1)` 带 `search` 参数。
- [x] **B-02 修复分页**：`loadMore` 未绑定，`limit:50` 一次拉完 → 绑定滚动加载。✅ 已实施（2026-09-10）：`loadFiles(page)` 支持追加，`onFileLoadMore` 滚动加载，`hasMore = filePage < fileTotalPages`，进入文件夹/返回时重置搜索与页码。
- [x] **B-03 修复 move/copy 死操作**：多选栏 emit 了 move/copy 但无处理 → 接 A-05 实现（或先隐藏死按钮）。✅ 已实施（2026-09-10）：多选栏新增「移动/复制」按钮，两父页 `onSelectionAction` 接 `NodeFolderPicker` + 批量 move/copy API；多选栏操作触发后退出多选（选中项已捕获）。
- [x] **B-04 成员自我保护**：`isSelf` 时禁用「移除」「改角色」控件 + 提示文案（PC `MembersModal.tsx:673,798-804`）。✅ 已实施（2026-09-10）：`useUser()` 取当前用户 ID，`isSelf(m)` 为真时整行 `member-actions`（改角色下拉 + 移除按钮）不渲染。
- [x] **B-05 成员管理权限门控**：无 `PROJECT_MEMBER_MANAGE` 权限时隐藏「添加成员」与移除/改角色控件（PC `MembersModal.tsx:202-207,393-418`）。✅ 已实施（2026-09-10）：`memberControllerGetUserProjectPermissions` 拉取项目权限，`canManageMembers = permissions.includes('PROJECT_MEMBER_MANAGE')`（对齐 PC `permissionUtils`），失败时悲观隐藏；「添加成员」按钮与成员操作区均受控。

### P1 高频

- [ ] **B-06 改角色后刷新自身权限**：改完重查 `checkPermission` 刷新 UI 可用性（PC `MembersModal.tsx:294-303`）。
- [ ] **B-07 转让项目所有权**：成员 ActionSheet「转让所有」→ 确认弹窗（含「降级为管理员、不可撤销」警示，PC `MembersModal.tsx:315-342`）。
- [ ] **B-08 成员真实头像 + 邮箱展示**：`member.avatar` 替代 `user-o` 图标；行内显示 email（无则「无邮箱」）。
- [ ] **B-09 按角色筛选成员**：van-dropdown 角色筛选。
- [ ] **B-10 精细化错误文案**：FORBIDDEN→「没有权限」、BAD_REQUEST→「不能修改项目所有者的角色」（PC `MembersModal.tsx:253-311`）。
- [ ] **B-11 项目改名/改描述**：顶部标题旁编辑入口 → 底部弹窗（名称 100 字/描述 500 字计数，PC `ProjectModal.tsx:170-203`）。
- [ ] **B-12 删除项目**：设置区「删除项目」→ 确认弹窗（「删除后将移至回收站」，PC `useProjectDrawingsInteractions.ts:173-188`）。
- [x] **B-15 配额用量条**：used/limit 进度条 + 升级引导（PC `FileSystemHeader.tsx:269-301`）。✅ 已实施（2026-09-11，Batch 4）：`ProjectDetailPage.vue` nav-bar 下方配额条（仅文件 Tab 且 `limit>0` 显示）→ `projectControllerGetProjectQuota({ path:{ projectId } })`（`ProjectQuotaDto {projectId,used,limit}`，used 仅计源文件大小、limit 随 VIP 等级）；进度条 + `used/limit` 文案，配色对齐 PC（`used>limit` 红 `--error`、`>90%` 黄 `--warning`、否则 `--accent`）；下拉刷新顺带刷新配额。配额加载失败静默（展示性信息，不阻断文件列表）。**升级引导不在本批**（PC 该处也无跳转），随 D-02 个人空间配额一并做。
- [x] **B-16 文件重命名**：复用 A-04。✅ 已实施（2026-09-10）：项目文件 ellipsis 菜单「重命名」→ `RenameNodePopup` → `nodeControllerUpdateNode`。
- [x] **B-17 文件移动/复制**：复用 A-05。✅ 已实施（2026-09-10）：项目文件 ellipsis 菜单「移动/复制」+ 多选栏 → `NodeFolderPicker`（root=当前文件夹/项目根）→ 单条/批量 API。
- [x] **B-18 下载格式选择**：复用 A-06。✅ 已实施（2026-09-11）：随 A-06 落地（项目文件 ellipsis 菜单「格式转换下载」→ `DownloadFormatPopup`）。
- [ ] **B-19 版本历史**：复用 A-27。
- [x] **B-20 手动刷新**：下拉刷新。✅ 已实施（2026-09-11，Batch 4）：随 A-15 落地（项目详情 `@refresh="refreshFiles"`，同时刷新配额）。

### P2

- [x] **B-21 批量下载对话框**：复用 A-07。✅ 已实施（2026-09-11）：随 A-07 落地（FAB「下载任务」→ `BatchDownloadPanel`）。
- [ ] **B-13 角色模板管理**：角色 CRUD + 权限配置（PC `ProjectRolesModal.tsx`）。移动端：角色管理底部弹窗 + 权限勾选列表。
- [ ] **B-14 项目操作历史**：底部弹窗时间线（复用 PC `OperationHistoryModal` 数据，移动端按时间分组）。

---

## C. 分享管理 ShareManagePage（/shell/share）

### P0

- [x] **C-01 撤销二次确认**：ActionSheet「撤销分享」→ `showConfirmDialog`（PC `ConfirmRevokeModal`）。✅ 已实施（2026-09-10）：`onRevokeShare` 前置 `showConfirmDialog`（撤销后该分享链接将立即失效，确定撤销？/ 撤销 / 取消），取消则不执行。

### P1

- [x] **C-02 修改有效期（续期）**：列表项「续期」→ 底部弹窗选有效期（PC `EditExpiryModal` + `shareControllerUpdateShare`）。✅ 已实施（2026-09-11）：ActionSheet「修改有效期」→ 底部弹窗 7 个有效期 chip（2h/6h/12h/1d/3d/7d/永不过期）→ `shareControllerUpdateShare({ path:{token}, body:{expiresAt} })`（null=永不过期，SDK DTO 类型松需 `as never`，与 PC 一致）。
- [x] **C-10 二维码**：创建后底部弹窗显示二维码（160px）+ URL 复制；列表项「查看二维码」入口（PC `ShareDialog.tsx:859-868`）。✅ 已实施（2026-09-11）：用已存在的 `qrcode` 依赖 `toDataURL`（PC 用 `qrcode.react` 的 QRCodeSVG）—— 创建成功面板内嵌 160px + ActionSheet「查看二维码」→ 200px 弹窗 + URL 复制；`createdShareInfo` watch 生成，失败静默降级。
- [x] **C-06 创建时间字段**：卡片/列表补 createdAt。✅ 已实施（2026-09-11）：列表项 stat 行补「创建 {日期}」（`toLocaleDateString`，对齐 PC createdAt 列）。
- [x] **C-07 URL 展示 + 打开分享页**：截断显示 URL + 「打开」动作（PC `ShareTable.tsx:138-198`）。✅ 已实施（2026-09-11）：列表项新增截断 URL 行（>25 字符加 ...，monospace）+ ActionSheet「打开」`window.open(url,'_blank')`。
- [x] **C-16 状态判定修正（附带修复）**：移动端原 `s.status` 读后端字段恒 undefined → 全部判「有效」，已过期/已撤销筛选 tab 与状态标是死代码。✅ 已实施（2026-09-11）：核实后端 `listShares` 无 status 字段（撤销=软删 `deletedAt` 不出现在列表）→ 改客户端由 `expiresAt` 判定（对齐 PC `isExpired`）；`status` 收窄为 `active|expired`，删除「已撤销」filter tab 与 revoked 分支；`ShareItem` 补 `token`（续期/URL 兜底需要）与 `createdAt`。

### P2

- [ ] **C-03 多选 + 批量撤销**：多选模式 + 批量撤销 + 成功/失败计数（PC `useShareActions.ts:80-108`）。
- [ ] **C-04 排序**：创建时间/有效期/次数排序 ActionSheet（PC `SORTABLE_COLUMNS`）。
- [ ] **C-05 分页/加载更多**：滚动加载替代固定 `pageSize:50`。
- [ ] **C-11 自定义天数**：补 `customDays` 输入 UI（现死代码，1-365 天）。
- [ ] **C-12 「立即过期」选项**：有效期选项补 immediate。
- [ ] **C-13 复制成功行内反馈**：该行图标变 ✓ 2 秒（替代/补充 toast）。
- [ ] **C-14 加载失败底条**：列表已有内容时底部失败条 + 重试，不整页替换。
- [ ] **C-15 空态「清除搜索」**：搜索无结果时一键清除关键词。

### P3

- [ ] **C-08 新建分享文件选择器**：搜索 + 文件夹树 + 多选 + 跨目录（PC `SelectFileModal.tsx`）。移动端：底部弹窗目录树 + 搜索 + 多选。
- [ ] **C-09 批量分享**：多文件逐个生成 + (done/total) 进度 + 失败项展示（PC `ShareDialog.tsx:258-342`）。

---

## D. 个人中心 ProfilePage（/shell/profile）

### P1 高频

- [x] **D-01 头像展示 + 上传**：真实头像替代首字母占位；点击上传（格式白名单 + 5MB 校验 + 上传 spinner，PC `usePasswordProfile.ts:151-183`）。✅ 已实施（2026-09-11，Batch 5）：头像区改 `van-image`（有 `profile.avatar` 时显示，`@error` 回落到首字母占位）+ 右下角相机角标提示可点击；隐藏 `<input type=file accept="image/png,image/jpeg,image/gif,image/webp">` + `usersControllerUploadAvatar({ body: { file } as never })`（普通对象，非 FormData）；PNG/JPEG/GIF/WebP 白名单 + 5MB 校验 + 上传中遮罩 loading；成功后 `loadProfile()` 回读。契约：POST `/api/v1/users/profile/avatar`，SDK `UploadAvatarDto = { file: Blob|File }`。
- [x] **D-06 密码强度条 + 安全建议 + 忘记密码入口**：5 级彩色强度条 + 建议列表 + 「忘记密码？」链接（PC `ProfilePasswordTab.tsx:110-179`）。✅ 已实施（2026-09-11，Batch 5）：`pwdStrength` computed 与 PC `getPasswordLength>=8/大小写/数字/特殊字符` 四项打分同口径，5 档配色（#ef4444→#10b981），条宽 `score/4*100%`；「安全建议」清单带勾（已完成项 `passed` 绿勾、未完成 `info-o` 灰）；「忘记密码？」cell 走 `getPCForgotPasswordUrl()`（ADR-0062，移动端不承载原生认证）；弹窗高度 62%→76%。
- [x] **D-10 会员购买/续费/升级入口**：VIP 徽章区加「管理会员」→ 套餐对比底部弹窗 + 购买（PC `MemberCenter.tsx:484-626`）。被 VIP 拦截时弹框改为此入口（现只 toast）。✅ 已实施（2026-09-11，Batch 5，降级方案）：新增「会员」分组，「管理会员」cell 显示当前档位/免费用户，点击 `window.open(getPCMemberCenterUrl())` 跳 PC `/member-center`（弹窗被拦截时回退整页跳转）。移动端不重做套餐对比+支付下单流程（涉及支付，属 PC 能力）；被 VIP 拦截的 toast 未改（`handleApiError` 全局分类，改动会影响所有页）。
- [x] **D-11 会员到期预警**：剩余 ≤7 天黄色横幅（PC `MemberCenter.tsx:458-478`）。✅ 已实施（2026-09-11，Batch 5）：`vipDaysRemaining` = `ceil((expiresAt - now)/86400000)`，`vipExpiringSoon` = `isVip && 0 < days <= 7`（`expiresAt` 为 null=永久，不算到期）；头部下方黄色横幅 + `warning-o` 图标 + `t('会员即将到期，剩余 {days} 天，请及时续费')`。
- [x] **D-12 存储配额用量**：已用/总量进度条，70%/90% 变色（PC `MemberCenter.tsx:700-748`）。✅ 已实施（2026-09-11，Batch 5）：`usersControllerGetDashboardStats` → `UserDashboardStatsDto.storage`（`{used,total,remaining,usagePercent}`）；`storagePercent` 优先用后端 `usagePercent`、缺失时前端算 `used/total*100` 并 clamp 0-100；配色 >90% 红 / >70% 黄 / 其余 accent；`loadStats()` 失败静默（配额条隐藏）不打成整页错误态。契约：GET `/api/v1/users/stats/me`。

### P2

- [x] **D-02 账号元信息**：角色 Tag、账号状态（正常/未激活/已禁用）、创建时间（PC `ProfileInfoTab.tsx:280-320`）。✅ 已实施（2026-09-11，Batch 5）：新增「账号详情」分组——角色 Tag（`role.name === 'ADMIN'` → 系统管理员，否则普通用户，与 PC `usePermission.isAdmin` 同口径；后端 role.name 是枚举值非展示名，故不直接展示）+ 状态 Tag（ACTIVE/INACTIVE/SUSPENDED → 正常/未激活/已禁用，绿/黄/红）+ 创建时间（`createdAt` → YYYY-MM-DD，非法时间不显示）。
- [x] **D-03 邮箱/手机「已验证」标记**：已绑定显示 ✓，手机区分 `phoneVerified`。✅ 已实施（2026-09-11，Batch 5）：`accountGroup` 加 `verified` 字段，cell `#value` slot 尾部 `van-icon name="passed"`。邮箱=已绑定即已验证（后端无 `emailVerified` 字段，核实 `UserProfileResponseDto` 只有 `phoneVerified`）；手机号=`phone && phoneVerified === true`。
- [x] **D-05 邮箱/手机解绑**：绑定管理区加「解绑」→ 原值验证码确认（PC `useEmailProfile.ts:315-330`）。✅ 已实施（2026-09-11，Batch 5）：点已绑定的邮箱/手机 cell → `van-action-sheet`（更换/解绑，解绑红字；未绑定时单动作直进弹窗不多加一层）；解绑弹窗=发码到原值 → 输码 → `authControllerUnbindEmail/UnbindPhone({ body: { code } })`（后端 `unbindEmail` 内部自行 `verifyEmail` 校验码，无需先取 token）。后端强制「账号至少保留一种登录方式（密码/手机/微信）」，违规 400 兜底 + 弹窗内文案前置提示。
- [x] **D-07 hasPassword 用户「设置密码」引导**：区分「设置密码/修改密码」按钮文案 + 引导文案（PC `ProfilePasswordTab.tsx:73-87`）。✅ 已实施（2026-09-11，Batch 5）：`isSettingPassword = hasPassword === false` 时——安全组入口文案改「设置密码」、弹窗标题改「设置密码」、不显示当前密码字段、顶部加灰底引导文案（手机/微信自动创建账号尚未设密）、新密码 placeholder 改「至少8位，包含大小写字母和数字」、提交按钮改「设置密码」、成功文案改「密码已设置成功」。
- [x] **D-08 改密后自动重新登录**：改密后 `login(用户名, 新密码)` 保持会话，失败则登出（PC `usePasswordProfile.ts:100-138`）。✅ 已实施（2026-09-11，Batch 5）：`reloginWithNewPassword()` 用 `authControllerLogin({ body: { account: username||email, password: newPassword } })`，成功写 `accessToken`/`refreshToken`/`user` 三 localStorage + `setAuthenticated()` + `loadProfile()`；失败 `showDialog` 告知后清三 key + `setGuest()`（登录引导弹窗接着提示用新密码登录）。`AuthApiResponseDto = {accessToken, refreshToken, user, restored?, mfaSetupRequired?, passwordChangeRequired?}`；`LoginDto.account` = 邮箱/用户名/手机号。
- [x] **D-14 验证码格式对齐**：移动端 `/^\d{4,8}$/` 改与 PC 一致 `/^\d{6}$/`。✅ 已实施（2026-09-11，Batch 5）：抽 `CODE_RE = /^\d{6}$/` 常量替换 4 处（`canSubmitCode` ×2 / `submitOldCode` / `submitNewCode`）。后端实证=邮箱与短信验证码均 `(100000 + crypto.randomInt(900000)).toString()` 恒 6 位，原 4-8 位正则可接受后端不发的码宽。
- [x] **D-15 密码可见性切换**：van-field 加密码眼睛切换。✅ 已实施（2026-09-11，Batch 5）：三个密码字段 `:type` 绑 computed（password/text 切换）+ `#right-icon` slot 放 `van-icon`（`eye-o`/`eye`），`openPwdDialog` 重置三个可见态。核实 Vant 4 `van-field` 无内置密码切换；`showClear` 与自定义 `right-icon` slot 是并列渲染（`renderFieldBody` = input + clear + rightIcon + button），`clearable` 不受影响。
- ➖ **D-16 deactivated 态细化**：区分「冷静期可自动恢复（重新登录即取消注销）」vs「已超期（数据 N 天后删除）」+ 客服联系方式（PC `useLoginForm.ts:231-236` + `SupportModal`）。➖ 移动端不适用（2026-09-11，Batch 5 判定）：deactivated 只发生在**登录时**（PC 登录页），移动端登录走 PC 页（ADR-0062），已登录用户不存在 deactivated 态可细化——壳级 `useAuthState` 已有 `deactivated` kind + `requireAuth()` 对 deactivated 直接 `return false`，`AuthStatePage` 已统一展示。客服联系方式需要产品给出口，另开产品需求票。

### P3 / 待确认

- [ ] **D-04 微信绑定/解绑/冲突接管**：⏸ OAuth 全页跳转在移动端受限（现有设计已移除），需确认是否做 H5 内 OAuth 流程。
- [ ] **D-09 注销账户（冷静期）**：4 种验证方式 + 30 天警告 + 确认勾选（PC `ProfileDeactivateTab.tsx`）。移动端：底部弹窗流程。
- [ ] **D-13 订单历史/继续支付/申请退款**：PC `MemberCenter.tsx:883-1121`。
- [ ] **D-17 原生认证流程**（登录/注册/忘记密码/邮箱手机验证/设备授权）：⏸ 与 ADR-0062 现有设计（认证跳 PC 页）冲突，需确认是否做原生认证。
- [ ] **D-18 登出行为**：现整页跳 PC 登录页，可改为站内 guest 态 + 登录引导弹窗。

---

## E. 首页编辑器 + 图纸库/图块库（home）

### P0 数据风险

- [x] **E-22 从库打开图纸前未保存更改确认**：`openDrawing` 直接 `reset()` 重开有丢数据风险 → 加 `isModified` 确认（PC `SidebarContainer.tsx:283-296` `checkAndConfirmUnsavedChanges`）。✅ 已实施（2026-09-10）：`LibraryPanel.openDrawing` 在 `reset()` 前判断 `editorState.state.isModified`，`showConfirmDialog`（保存/不保存，同 home `handleNewFile` 模式）：保存失败则中止打开，「不保存」清标记继续。

### P1 高频（含速赢）

- [x] **E-01 编辑器菜单补 5 项（速赢）**：导出 PDF/DWG/DXF、版本历史、协同、语言切换、另存为到云图——命令与弹窗**全部已实现**（`useMenu.ts:67-115/170-230`），只是 `mxUIConfig.json` 菜单数据无对应项，加配置即可。✅ 已实施（2026-09-10）：`public/mxUIConfig.json` headerMenuData 补 导出(Mx_export)/版本历史(Mx_versionHistory)/协同(Mx_ShowCollaborate)/另存为(Mx_SaveAsToCloud) + 末尾 语言(Mx_languages)，图标名已核对 iconfont.css。
- [x] **E-02 本地另存为**：「另存为本地」菜单项。✅ 已实施（2026-09-11）：命令 `Mx_SaveAsMxWeb`（`src/command/m_mx_saveAsMxWeb.ts`）与注册（`command/index.ts`）**早已存在**，仅 `mxUIConfig.json` headerMenuData 缺项 → 在「另存为」后插入，icon 复用 `baocun`。
- [x] **E-07 分享当前图纸**：菜单「分享」→ 底部弹窗（创建/复制链接/撤销/有效期，PC `ShareDialog` 移动端形态）。✅ 已实施（2026-09-11）：`ShareCurrentPopup.vue`（有效期 8 档含自定义天数/永不过期、`expiresIn` 单位**秒**对齐后端、QRCode 二维码、复制降级 toast、已有分享列表 + 撤销）；菜单项不带 icon（iconfont 无 share glyph，Vant icon-cell 对 falsy icon 不渲染 → 纯文本行）；`Mx_Share` 命令经 `mxcad-share-current` 事件由 `home/index.vue` 监听唤起。
- [x] **E-23 图块插入/打开图纸缓存戳用 updatedAt**：✅ 已实施（2026-09-11）：抽 `libraryOperationService.buildCacheTimestamp(updatedAt)`（无值/非法才回退 `Date.now()`）+ `buildLibraryFileUrl`，`LibraryPanel.getNodeFileUrl` 与图块插入共用 —— `Date.now()` 会让每次点击生成新缓存键，同一文件重复插入永不命中缓存。
- [ ] **E-17 库面包屑返回入口**：⏸ 拆 Batch 6b（需层级视图）：`all-files` 端点递归平铺且后端过滤 `nodeType: FileType.FILE`，**文件夹不进扁平列表**，`enterFolder`/`breadcrumbs` 在扁平模型下无数据来源。
- [x] **E-08 库内文件上传**：✅ 已实施（2026-09-11）：抽屉头部上传按钮（`canManage` 时显示，icon `photo-o`，上传中 `replay` 旋转）+ 隐藏 `<input type="file" multiple>`；走 `calculateFileHash + uploadFile({file, hash, nodeId})` 管线（秒传/去重契约），目标 = `library.resolveCategoryNodeId()`；`UPLOAD_ACCEPT` 对齐后端支持的 dwg/dxf/图片/pdf 白名单。
- [ ] **E-09 库内新建文件夹**：⏸ 拆 Batch 6b（需层级视图，理由同 E-17：新建的文件夹在 `all-files` 扁平列表中不可见）。
- [x] **E-10 库内重命名**：✅ 已实施（2026-09-11）：底部弹窗 + `van-field`（maxlength 100）+ 空名禁用确认；`renameLibraryNode` → `libraryControllerRename{Drawing|Block}Node`。
- [x] **E-11 库内删除（单个 + 批量）**：✅ 已实施（2026-09-11）：长按（800ms，`touchmove` 取消）进入多选 → 勾选角标 + 底部操作栏（取消/已选 N 项/全选/操作）→ 操作表删除项红色 `#ee0a24` + `showConfirmDialog`「删除后不可恢复」（库无回收站，`permanently: true`）；批量走 `batchDeleteLibraryNodes` 按 `successCount/failedCount` 分支提示避免误报全成。
- [ ] **E-12 库内移动/复制**：⏸ 拆 Batch 6b（目标=分类/文件夹树，需层级视图）。
- [x] **E-13 库内下载**：✅ 已实施（2026-09-11）：操作表「下载原格式 / 导出 PDF / DWG / DXF」（导出格式受 `canExportDownloadGate` VIP 门控）+ 多选「下载所选」并行批量下载 + 汇总提示；`downloadLibraryNode` 双路（mxweb 走库公开下载端点，其余走 `downloadControllerDownloadNodeWithFormat`），`silent` 模式不弹 toast 也不 `closeToast()`（否则批量时调用方自己的 loading toast 被逐个杀掉）。
- [x] **E-19 当前打开文件高亮**：✅ 已实施（2026-09-11）：`openDrawing` 成功后补 `setFileId(node.id)` + `setUpdatedAt`（`openMxWeb` 本身不设 fileId，`reset()` 会清掉 → 不补则高亮永不生效），`grid-item--active` 主题色描边。
- [x] **E-20 库空态 CTA**：✅ 已实施（2026-09-11）：`canManage && !selecting` 时空态加「上传图纸」按钮（直接唤起文件选择，省去再点头部按钮）。
- [x] **E-21 库加载失败保留已有列表**：✅ 已实施（2026-09-11）：错误态仅 `nodes.length === 0` 时整页展示；有数据时在「加载更多」行显示失败条 → `useLibrary.retryLoadMore()`（重载当前页，不复用已自增 page 的 `loadMore`，否则漏一整页）。
- [x] **E-28 MXWEB 导出菜单项**：✅ 已实施（2026-09-11）：`buildExportActions()` 首位插入「导出 MXWEB」（icon `geshi`），**不走 VIP 门控** —— MXWEB 是源格式、纯前端导出无转换（与 PC 一致）。

### Batch 6 记录（2026-09-11）

- 新增 2 文件：`services/libraryOperationService.ts`（rename/delete/batchDelete/download + 缓存戳，库命名空间专用，对照 PC `useLibraryOperations.ts`）、`pages/home/components/ShareCurrentPopup.vue`。
- 修改 6 文件：`LibraryPanel.vue`（多选/上传/操作表/重命名/错误态/高亮）、`useMenu.ts`（MXWEB 导出 + `Mx_Share`）、`permissionService.ts`（迁入 `canExportDownloadGate`，库面板与菜单共用，避免面板耦合 `useMenu` 的 mxcad 重依赖）、`useLibrary.ts`（`retryLoadMore` + 导出 `resolveCategoryNodeId`，纯追加零行为变更）、`home/index.vue`（挂 `ShareCurrentPopup` + 事件监听）、`public/mxUIConfig.json`。
- 后端/SDK/数据库零改动（全部端点与 DTO 已存在）。
- **i18n 管线坑（重要）**：`voerkai18n extract` 默认 mode=`sync`，**会删除源码中不存在的文本**；而 `public/mxUIConfig.json`（运行时 fetch 的菜单配置）与 `useMenu.ts`（菜单文本是裸字符串、不经 `t()`）都不在抽取范围内 → 编辑器菜单新增文案**必须手工写进 `src/languages/translates/messages/mxUIConfig.json`**（该文件不被 extract 重写，但 compile 会 `*.json` 全量合并进 4 个语言包），并分配不与现有区间冲突的 `$id`（compile 遇无 `$id` 直接 throw）。写入 `default.json` 的手工键会被下一次 extract 清掉，无效。
- **附赠 bug 修复**：撤销分享传 `item.id` 致 404 —— 后端 `@Delete(':token')` + `findUnique({ where: { token } })`，`ShareManagePage.onRevokeShare` 原传 DB id（恒 NotFound，用户只会看到「撤销失败」），已改传 `item.token`；`ShareCurrentPopup` 新代码直接按 token 写。
- 遗留（不在本批）：库是扁平模型，`useLibrary` 的 `isFolder`/`enterFolder`/文件夹缩略图分支在 `all-files` 下为死代码，保留待 Batch 6b 切 `children` 层级视图时复用；编辑器菜单既有键 `导出`/`协同` 至今未翻译（en-US/ko-KR 用户看到中文），非本批引入。


### P2

- [ ] **E-03 打印**：`Mx_PrintDialog` 等价（打印输出到 PDF）。
- [ ] **E-04 重做**：顶栏撤销旁加重做（`Mx_Redo`）。
- [ ] **E-05 插入表格**：`Mx_InsertTable` 菜单项。
- [ ] **E-06 视图子菜单**：窗口缩放/范围缩放/视区平移/视区旋转（现仅「显示全部」）。
- [ ] **E-15 库列表视图 + 切换**：网格/列表双视图（现仅 2 列网格）。
- [ ] **E-16 库分页/页大小**：滚动加载已有，补「没有更多」尾标一致性。
- [x] **E-18 库多选 + 批量操作栏**：✅ 已实施（2026-09-11，随 E-11 一并落地）：长按多选 + 底部操作栏（下载/删除）；移动/复制留 Batch 6b（需层级视图选目标）。
- [ ] **E-24 「当前图纸已被删除」警告横幅**：顶部黄条（PC `CADEditorDirect.tsx:662-673`）。
- [ ] **E-25 版本历史体验**：预热提示（「正在准备历史版本文件…」行级 loading）+ 相对时间（刚刚/X 分钟前）（PC `VersionHistoryModal.tsx:40-126`）。
- [ ] **E-26 外部参照面板**：查看/下载/替换/刷新已有参照（现仅上传缺失参照，PC `ExternalReferencePanel`）。
- [ ] **E-27 另存为成功后「打开新图纸」**：confirm + 打开（PC `useExportModals.ts:115-133`）。

---

## F. 字体库（整页缺失）

> PC `packages/frontend/src/pages/FontLibrary/` 整页，移动端完全没有。用户无法管理 CAD 引擎可用字体。

### P2

- [ ] **F-01 字体库页面**：入口（个人中心或编辑器菜单）→ 列表页：后端/前端双 tab（转换程序/资源目录）、统计条（总数/总存储/格式种类）、名称搜索、格式筛选、排序（时间/名称/大小）、网格/列表切换。移动端：单列列表 + 筛选 chips + 排序 ActionSheet。
- [ ] **F-02 字体上传**：多文件 + 目标选择（仅后端/仅前端/同时）+ 去重提示（PC `UploadFontModal.tsx:243-250`）。
- [ ] **F-03 字体删除（单个 + 批量）**：长按多选 + 删除确认 + 部分失败提示（PC `useFontLibrary.ts:209-282`）。
- [ ] **F-04 字体下载**：ActionSheet「下载」。
- [ ] **F-05 无权限空态**：`canReadFonts` 门控「您没有查看字体库的权限」空态（PC `FontLibrary/index.tsx:70-84`）。

---

## G. 跨切面

- [ ] **G-01 UnifiedFileList 列表模式 ellipsis 死控件**：并入 A-03（接 ActionSheet）。
- [ ] **G-02 新增文案 i18n**：所有新 UI 文本走 `t()` → `pnpm i18n`（extract+baidu translate+compile），ko 翻译质量需人工校对（本次已发现 baidu 把 `{pct}` 译成乱码的坑）。
- [ ] **G-03 集成测试/单测**：每条 P0/P1 修复带回归测试（AGENTS.md 集成测试规则）。
- [ ] **G-04 PC 通知中心（notice-center）前端孤儿代码去留**：⏸ 待确认。`packages/frontend/src/components/notice/` 下 `NoticeProvider.tsx` + `useNoticeStream.ts`（已跟踪）依赖 api-sdk 的 `NoticeResponseDto` / `noticeCenterControllerGetCurrent` / `noticeCenterControllerIssueTicket`，但**后端 notice-center 在全部 git 历史中从未存在**（`git ls-files packages/backend | grep -i notice` = 0；`git log --all --diff-filter=A` 只命中前端 2 文件），api-sdk 亦无对应导出。且 `NoticeProvider` **从未在 `App.tsx` 挂载**、`useNotices` 全仓零调用者 —— 属从未交付、从未接线的功能。后果：`pnpm type-check` 残留 4 个错误（TS2724 ×2 + TS2305 ×2），**不可通过前端编辑解决**。两条出路：① 删死代码（符合 AGENTS.md「无消费者代码删或标注」，但 `NoticeProvider.tsx`/`useNoticeStream.ts` 已跟踪，删除后无法 `git restore`，不可逆）；② 重建后端 notice-center（等于凭空发明功能规格：数据模型/级别/上下线/管理入口均无原始定义可依，且落地后无创建公告的途径，属「上线但无用」）。**当前保留文件 + 如实保留 4 个错误**，不擅自删除他人已跟踪代码，也不发明后端规格。

---

## 实施批次规划

| 批次 | 内容 | 说明 |
|---|---|---|
| Batch 1（速赢） | E-01 菜单 5 项、B-01/B-02 搜索分页修复、C-01 撤销确认、B-04/B-05 成员保护+门控、E-22 未保存确认 | ✅ 2026-09-10 完成并复验（58/58 测试绿、type-check 改动文件 0 错、build 通过、i18n 新键已翻译编译） |
| Batch 2（核心文件操作） | A-03 单条目菜单 + A-04 重命名 + A-05 移动/复制 + A-24 名称校验 + B-03/B-16/B-17 接线 | ✅ 2026-09-10 完成并复验（58/58 测试绿、type-check 改动文件 0 错、build 通过、i18n 新键已翻译编译） |
| Batch 3（下载/分享增强） | A-06 格式下载 + A-07/A-08 批量下载 + C-02/C-10 续期+二维码 + C-06/C-07 字段 + C-16 状态判定修正 | ✅ 2026-09-11 完成并复验（58/58 测试绿、type-check 改动文件 0 错、build 通过、i18n 新键已翻译编译；新增 3 文件 `useBatchDownload.ts`/`BatchDownloadPanel.vue`/`DownloadFormatPopup.vue`） |
| Batch 4（列表体验） | A-10 排序 + A-11 项目筛选 + A-19 全选 + A-14/A-15/A-16 状态细节 + B-15 配额条 + B-20 手动刷新 | ✅ 2026-09-11 完成并复验（58/58 测试绿、type-check 改动文件 0 错、build 通过、i18n 14 新键已翻译编译；新增 1 文件 `useViewMode.ts`） |
| Batch 5（个人中心） | D-01/D-06/D-10/D-11/D-12 + D-02/D-03/D-05/D-07/D-08/D-14/D-15（D-16 判定 ➖ 不适用） | ✅ 2026-09-11 完成并复验（58/58 测试绿、type-check 改动文件 0 新增错、build 通过、i18n 45 新键四语言齐；改 2 文件 `ProfilePage.vue`/`apiConfig.ts`，后端/SDK 零改动） |
| Batch 6（编辑器+库管理） | E-02/E-07/E-28 + E-08/E-10/E-11/E-13/E-18/E-19/E-20/E-21/E-23 | ✅ 2026-09-11 完成并复验（58/58 测试绿、type-check 20 预存错且改动文件 0 新增、build exit 0、i18n 734 键四语言齐 + ko 占位符手修 9 键、0 占位符损坏；新增 2 文件、改 6 文件，后端/SDK 零改动；附修撤销分享传 id 致 404） |
| Batch 6b（库层级视图） | E-09 新建文件夹 / E-12 移动复制 / E-17 面包屑 | ⏸ 需把库数据源从 `all-files` 切到 `children` 层级浏览（后端 `all-files` 过滤 `nodeType: FILE`，扁平列表不含文件夹）；与并行会话「库浏览抽屉用 all-files 对齐 CAD 侧边栏 flatMode」的决策冲突，需用户确认方向后实施 |
| Batch 7（字体库） | F-01~F-05 | 整页新增 |
| Batch 8（大块/待确认） | A-09/A-20/A-26、B-11/B-12/B-13/B-14、C-03~C-05/C-08/C-09、D-09/D-13、E-03~E-06/E-24~E-27、D-04/D-17 ⏸ | 大块功能 + 待用户确认项 |

> 待确认项（⏸）：A-30 Dashboard、D-04 微信绑定、D-17 原生认证、D-18 登出行为。
