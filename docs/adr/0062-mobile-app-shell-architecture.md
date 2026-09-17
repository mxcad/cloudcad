# 移动端 App 壳架构：常驻 CAD 编辑器 + 子页栈（微信式导航）

**Status**: accepted
**Date**: 2026-09-01
**Related**: #447（地图）、#449（T1）、#450（T2）、#451（T3）、#452（T4）、#454（T6）、#455（T7）、#456（T8）、#457（T9）、#458（T10）、#459（T11）

## Context

移动端（`packages/frontend_mobile`）此前是**单页 WASM canvas 编辑器**——打开 App 直接就是编辑器，所有功能（文件浏览/分享/个人资料）都以弹窗或子组件形式叠加在编辑器上。这导致：

1. 文件管理入口深藏于编辑器菜单，用户路径长
2. 弹窗叠弹窗，导航层级混乱，返回语义不明确
3. 编辑器与文件系统管理耦合，编辑器菜单既含 CAD 功能又含文件操作
4. 移动端无路由库，深链/书签/返回按钮均不可用
5. 无法与 PC 端的信息架构对齐（PC 端是独立的文件管理 + 编辑器分离）

用户决策：**重构为微信式 App 壳**——编辑器作为**常驻根**（形态 A），其余功能作为**可返回的子页**（push/pop，返回上一级露出常驻编辑器）。所有页面设计完 + 原型齐全后才写代码（用户铁律）。

## Decision

**采用形态 A（常驻编辑器壳）+ Vue Router + PersistentEditorShell 根组件 + 子页栈管理。**

### 核心结构

```
┌─ PersistentEditorShell（根）─────────────────────────────────┐
│  ┌─ 壳顶栏 44px（App 层）：CloudCAD +「+」─────────────────┐ │
│  ├─ Home（编辑器根 = 原移动端首页，恒渲染不卸载）──────────┤ │
│  │   ┌─ 编辑器原顶栏（CAD 层）─────────────────────────┐   │ │
│  │   ├─ #mxCanvas（WASM canvas，WebGL 保活）───────────┤   │ │
│  │   └─ 右侧竖排工具条 + 底部命令工具条 ───────────────┘   │ │
│  ├─ <router-view> 子页门控 ─────────────────────────────────┤ │
│  │   v-if="$route.path !== '/'"                            │ │
│  │   - 文件浏览器 / 项目详情 / 图纸库 / 图块库             │ │
│  │   - 分享管理 / 个人中心                                 │ │
│  └────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

### 技术要点

| 维度 | 决策 |
|------|------|
| **编辑器保活** | `createMxCAD()` 只跑一次，复用 `MxCpp.getCurrentMxCAD()`；`#mxCanvas` 顶层常驻，WebGL 上下文零重建 |
| **子页导航** | push = 全屏覆盖右滑入；pop = 露出编辑器根 |
| **路由库** | 引入 Vue Router（当前移动端无路由库） |
| **栈状态** | Pinia `useShellStack` store 与 router 同步，避免 shell 组件内维护栈导致不同步 |
| **鉴权** | 保留现有 token 同步机制（跳 PC 登录 URL 新标签 + `storage` 事件同步 token），不建移动端原生登录页 |
| **技术栈** | Vue3 + Vant + VoerkaI18n + Pinia + 共享 `@cloudcad/api-sdk`（PC 是 React 无法共享组件，子页 Vue 重实现） |
| **主题** | 暗色单模式（CAD 青 `#00a99e` + 背景 `#000`），不做明暗切换（已否决，会污染 CAD 编辑器视觉） |
| **后端 admin** | 全部保留 PC 端不变，移动端不做 admin |

### 路由表

| 路径 | 页面 |
|---|---|
| `/` / `/shell` | 编辑器根（Home） |
| `/shell/file` | 文件浏览器 |
| `/shell/file/project/:id` | 项目详情 |
| `/shell/library/drawing` | 图纸库 |
| `/shell/library/block` | 图块库 |
| `/shell/share` | 分享管理 |
| `/shell/profile` | 个人中心 |

深链直达：直接访问 `/shell/file/project/123` → Shell 挂载后立即 push 项目详情，跳过编辑器根直接显示目标页。

## Alternatives Considered

### 形态 B：子页独立页面（编辑器按需加载）

每次进入子页都卸载编辑器，返回时重新加载。优势是实现简单、内存占用低。劣势是：

- **编辑器重载成本高**：WASM canvas 重新编译 + 图纸重新加载 = 3-5s，用户体验差
- **状态丢失**：未保存编辑/协同会话在子页期间丢失
- **与 PC 端体验不一致**：PC 端编辑器是常驻的

**否决**：用户明确要"编辑器作为常驻根"（T1 定案），形态 B 不满足。

### 形态 C：Tab 底部导航栏

微信底部 3-4 个 Tab（发现/消息/我），编辑器作为其中一个 Tab。优势是导航层级清晰。劣势是：

- **编辑器与子页同权**：编辑器退化为一个 Tab，失去"根"的地位
- **Tab 切换开销**：每次切换编辑器 Tab 都要重建 canvas
- **移动端屏幕小**：4-5 个 Tab 挤在底部，图标识别度低

**否决**：编辑器是移动端的**核心功能**，必须保持"根"的地位，不能被降为 Tab。

### 壳布局备选：壳顶栏与编辑器顶栏合并

将壳顶栏和编辑器原顶栏合并为一条。优势是节省垂直空间。劣势是：

- **职责混淆**：App 层导航（返回/更多）与 CAD 层导航（图层/标注）混在一起
- **编辑器顶栏被覆盖**：子页期间无法显示编辑器状态（保存/协同人数）
- **编辑器视觉不统一**：编辑器顶栏是 CAD 工程风，壳顶栏是微信简约风

**否决**：用户定案 A——壳导航条与编辑器原顶栏**分两条**。

## Consequences

### 正面

1. **导航清晰**：单层导航语义（← 返回露出编辑器根），符合微信体感
2. **编辑器保活**：未保存编辑/协同会话在子页期间存活，返回即恢复编辑
3. **文件管理与编辑器解耦**：编辑器菜单只专注 CAD，文件系统管理成为专门页面
4. **可深链**：URL 直达任何子页，支持书签、微信分享链接
5. **可测试**：子页作为独立组件，可单独测试/预览

### 负面

1. **内存占用**：编辑器 + 子页同时存在，峰值内存约 80-120MB（WASM + canvas + 子页）
2. **实现复杂度**：Vue Router 引入 + 子页栈同步 + 手势返回，比单页模型复杂
3. **回归风险**：现有移动端功能（编辑/保存/协同/版本/库/分享）需全量回归
4. **迁移成本**：图纸库/图块库从编辑器面板 → 独立页是 expand-contract，需排收尾票（M7 实施期）

### 三层影响面

| 层 | 影响 |
|---|---|
| **前端移动端** | 全量改造（壳 + 路由 + 子页 + 组件 + i18n） |
| **api-sdk** | 复用既有函数（T3 已盘点 ~45 个），无需新 DTO；401 refresh 重试需修 fetch 覆写方式 —— 此行的风险判断已被 2026-09-07 修正（见文末「修正记录」），盘点动作 ≠ 契约核验 |
| **后端/admin** | 不变 |

## Implementation

实施票分解（9 张普通 issue）：

| 票 | 标题 | 依赖 |
|---|---|---|
| [#479](https://github.com/mxcad/cloudcad/issues/479) | M1 壳骨架：Vue Router + PersistentEditorShell | 0 |
| [#480](https://github.com/mxcad/cloudcad/issues/480) | M2 UnifiedFileList 统一文件列表组件（四域共用） | #479 |
| [#481](https://github.com/mxcad/cloudcad/issues/481) | M3 文件浏览器页（项目 + 个人空间） | #479, #480 |
| [#482](https://github.com/mxcad/cloudcad/issues/482) | M4 项目详情 + 图纸库 + 图块库专门页 | #479, #480 |
| [#483](https://github.com/mxcad/cloudcad/issues/483) | M5 个人中心 + 分享管理页 | #479, #480 |
| [#484](https://github.com/mxcad/cloudcad/issues/484) | M6 壳顶栏「+」+ 底部 Action Sheet 导航 | #479 |
| [#485](https://github.com/mxcad/cloudcad/issues/485) | M7 编辑器菜单裁剪 + 编辑器根设计 | #479, #480, #482, #483 |
| [#486](https://github.com/mxcad/cloudcad/issues/486) | M8 登录/鉴权引导 + 6 态异常态组件 | #479, #481, #482 |
| [#487](https://github.com/mxcad/cloudcad/issues/487) | M9 i18n 全量 + 部署入口 + 回归矩阵落地 | #479-#486 |

执行顺序：M1 → M2 → {M3, M4, M5, M6 并行} → M7 → M8 → M9。

## 回归矩阵

| 功能域 | 现有功能 | 壳改造后回归要点 | 风险等级 |
|---|---|---|---|
| **CAD 编辑** | 绘制/编辑/标注/图层/测量/颜色 | 子页返回后编辑器状态完整（选区/光标/命令历史），无状态丢失 | **高** |
| **保存** | 自动保存 + 手动保存 | 子页期间自动保存照常触发，不丢数据 | **高** |
| **协同** | CooperatePopup 多用户实时协同 | 子页期间协同心跳不中断，返回后光标/锁仍正常 | **高** |
| **版本历史** | VersionHistoryPopup 版本管理 | 子页期间版本提交不丢，返回后可继续操作 | 中 |
| **库** | LibraryPanel 面板 | 面板 → 独立页（M4），功能等价；expand-contract 收尾 | **高** |
| **分享** | 分享管理 | 从编辑器菜单入口 → 壳「+」→ 分享，功能等价 | 中 |
| **深链打开** | 微信链接打开图纸 | 深链直达图纸（需新增路由 `/shell/file/project/:id` 支持） | **高** |
| **401/鉴权** | 跳 PC 登录 URL | 保持现有行为，新增 LoginPromptPopup 引导 | 中 |
| **离线** | 无 | 新增离线态（壳徽标 + 编辑器继续可用 + 操作暂挂队列） | 中 |
| **i18n** | VoerkaI18n 4 语言 | 新增所有子页文案全量覆盖 | 中 |

## 修正记录（2026-09-07）

本 ADR 的决策（形态 A、常驻编辑器、子页栈）不变；修正的是「三层影响面」里对 api-sdk 影响面的**风险评估**，以及回归矩阵里「库」域等价性的证据状态。

### 1. 「复用既有函数」的风险被低估了

原结论「复用既有函数（T3 已盘点 ~45 个），无需新 DTO」在字面上正确——确实没有新增 DTO——但它把**盘点（inventory）**当成了**契约核验（contract verification）**。盘点回答的是「有没有这个函数」，没有回答「这个函数的语义和我需要的是否一致」。两个线上 bug 都是盘点正确、语义错配：

| bug | 盘点结论 | 实际语义差 | 后果 |
|---|---|---|---|
| 图纸库/图块库空白 | `libraryControllerGetDrawingAllFiles` / `...GetBlockAllFiles` 存在 | `all-files` 是递归收集，只返回 `nodeType=FILE`（约 16313 个平铺文件、0 个文件夹）；库页需要的是 `children`（文件夹+文件，`[{nodeType:'desc'},{name:'asc'}]` 文件夹优先），与 PC 一致 | 文件夹下钻、面包屑、分类联动全部是死代码；UI 空态 |
| 会员徽章永不显示 / 微信恒「未绑定」 | `usersControllerGetProfile` 存在 | 移动端按 `membershipLevel` / `membershipExpireAt` / `wechatBound` 取值，这三个字段在 `UserProfileResponseDto` 中**不存在**；真实字段是 `membershipTier` / `membershipTierLevel` / `membershipExpiresAt` / `isVip` / `phoneVerified` | 字段恒 `undefined`，`if (profile.wechatBound)` 类判断恒假 |

**修正后的规则**：T3 盘点之后必须补一次「语义核验」——对每个复用的函数确认① 返回形状（DTO 字段名逐个对齐后端 `src/**/dto/*.dto.ts`，不靠记忆）② 查询语义（分页/排序/递归/过滤）。核验产物落在测试里而不是文档里：

- `src/composables/useLibrary.spec.ts`（3 例）锁定库域必须调 `children`、`all-files` 不得被调用，drawing/block 参数化。
- `src/utils/profileDisplay.spec.ts`（16 例）锁定会员/手机/头像/显示名的字段映射，含两条**回归锁定**用例：把已废弃字段名（`membershipLevel`/`membershipExpireAt`）注入输入仍必须返回 `null`。
- 字段映射集中在 `src/utils/profileDisplay.ts`，UI 层不再各自读会员字段（单一出口，`null` = 不适用）。

另注：`QueryChildrenDto.limit` 有 `@Min(10) @Max(100)` 约束，库页 `limit: 30` 合法；此类运行时约束同样不属于「盘点」能发现的范围。

### 2. 「库」域等价性（回归矩阵行 5）缺少证据

`src/pages/home/components/LibraryPanel.vue` 已删除（expand-contract 的 contract 阶段），但「面板 → 独立页，功能等价」至今没有核验证据——这是 M7 收尾票的原始承诺，未兑现即关闭会让回归矩阵这一行处于「声称完成」状态。已知的等价性缺口至少包括：M7 收尾未排票、`LibraryPanel.vue` 的交互（文件夹下钻/分类联动/缩略图）与 `LibraryPage.vue` 的逐项对照未做。等价性核验完成前，该行不应标记为通过。

### 3. SDK 热更新插件静默失效 → `client` 单例被拆成两个实例 → 移动端所有接口拿到未解包信封

本轮最严重的问题。前两条 bug 是**契约/语义**错配，这条是**开发态装配**错配：`responseTransformer` 从未生效，所以每一个接口的 `res.data` 都是后端信封 `{ code, message, data, timestamp }`，消费方读的 `.id` / `.nodes` 恒 `undefined`。它同时解释了为什么图纸库、图块库、文件浏览器**一起**空白——不是三个 bug，是一个 bug。用户侧的表象是「后端请求正确但前端对不上数据」。

**根因在 `packages/api-sdk/scripts/vite-plugin.js`（PC 与移动端共用），有两个叠加缺陷：**

1. **路径错一级**：`path.resolve(root, '../../api-sdk/src')`，从 `packages/frontend_mobile` 解析到 `cloudcad/api-sdk/src`（仓库根外，不存在），`fs.existsSync` 为假直接 `return`。
2. **分隔符不匹配**：`path.resolve` 在 Windows 返回反斜杠路径，而 chokidar 回调里的 `file` 是正斜杠，`triggerReload` 里的 `file.startsWith(apiSdkSrc)` 永远不匹配。

**第 1 条让插件从一开始就是空转的**——它的注释写得很清楚（「必须先手动失效缓存模块，再触发浏览器整页刷新，否则浏览器拿到的仍是旧 SDK」），但这段逻辑一次都没执行过，而且**静默退出无任何告警**，所以缺陷潜伏了很久。

**失效链条**：

```
openapi-ts 重新生成（client.gen.ts 被删除后重写）
  → 那一瞬间某前端模块被 Vite import-analysis 分析
  → fs.existsSync(resolved.id) 为假 → import 改写为 /@id/<path>
  → SDK 自身用相对导入 ./client.gen → /@fs/<path>
  → Vite 服务端 ModuleGraph 按 resolvedId 去重，两个 URL 指向同一 ModuleNode
  → 但浏览器 ESM 缓存按 URL 去重 → 同一文件执行两次 → client 是两个实例
  → responseTransformer 配置在没人用的实例上 → 所有接口返回信封
  → 插件失效 → 这个 /@id/ 改写永不清理，活到 dev server 重启为止
```

**验证方式**（区分「结构性问题」与「脏图残留」）：起一个全新 dev server 逐模块 curl，`/@fs/` 是唯一形式、**`/@id/` 完全不出现**——包括 mobile 的 `apiConfig.ts`、SDK 的 `sdk.gen.ts`、以及 barrel 自身。所以「文件位置决定 URL 形式」是不成立的，`/@id/` 只来自重新生成窗口里的 `existsSync` 假判定加失效的清理机制。判断这类问题时应先拿干净图做对照，再决定是否怀疑结构性原因。

**修复**：

- 路径改 `../api-sdk/src`，并 `.replace(/\/g, '/')` 统一为正斜杠。
- `existsSync` 失败改为 `console.warn` 显式告警——静默 `return` 正是本次缺陷的藏身之处。
- 新增 `scripts/vite-plugin.test.mjs`（零依赖，`pnpm --filter @cloudcad/api-sdk test`）4 组断言：路径解析、SDK 变更→失效+整页刷新、非 SDK/非 .ts 不触发、无模块记录时退化 `invalidateAll`。测试同时锁住了分隔符缺陷（触发用正斜杠路径，插件路径错误会令失效计数为 0）。

**处置说明**：曾误判为「配置延后 + 文件位置」问题，按 PC 顶层执行模式重构成了 `src/config/clientSetup.ts` 并验证通过；干净 dev server 对照实验证明那不是成因，已**全部回退**，`main.ts` / `apiConfig.ts` 恢复原状（`setupApiClient()` 在 `app.use(router)` 之后同步执行，早于任何微任务里的首个请求，不存在竞态窗口）。**经验教训**：Vite 模块图缺陷要用全新 server 做 A/B 对照，不要在长跑的脏图上推断结构。

**处置动作**：修好插件后需要**重启一次 dev server**（旧图里的 `/@id/` 改写不会被追溯清理），然后硬刷新移动端页面。

### 4. 库的展示方式回退：抽屉（FloatingPopup）取代全屏子页

「面板 → 独立页」这一步被否决并回退。`193de3d` 删除 `LibraryPanel.vue`（600 行）并新建
`LibraryPage.vue`（610 行，`van-nav-bar` + `.subpage` 全屏子页）。用户反馈：库是**编辑器工具**，
不是可导航页面，展示方式应沿用旧的抽屉。

**回退理由**：库/图块的用途是往画布里插东西，全屏子页会遮住画布、切走上下文；旧抽屉
（`FloatingPopup`，锚点 `[100, 0.5, 0.95]`，可拖拽）浮在画布上，画布保持可见可交互，与
`CooperatePopup` / `InsertBlockPopup` / `VersionHistoryPopup` 等既有编辑器弹层一致。子页那套
转场 + 返回箭头是为「文件/分享/我的」这类真正独立的页面准备的，套在库上是形态错配。

**实施**：

- 还原 `src/pages/home/components/LibraryPanel.vue`（与 `CooperatePopup` 等同目录，是编辑器弹层家族）。
- 删除 `src/pages/shell/sub-pages/LibraryPage.vue` 与 `/shell/library/{drawing,block}` 两条子路由。
- 入口收敛到壳：`shell/index.vue` 新增 `openLibrary(type)` / `closeLibrary()`，抽屉作为
  `.editor-root` 的兄弟节点渲染。三条入口统一走它——Action Sheet 的「图纸库/图块库」项、
  编辑器命令的 `mxcad-shell-navigate` 事件（`useMenu.ts` 发 `/shell/library/*`，壳侧按
  `startsWith('/shell/library/')` 分流到 `openLibrary`）、以及 `home/index.vue` 的
  `mxcad-show-library` 监听（改为转发 `mxcad-shell-navigate`，不再自己 `router.push`）。
- `shellStack` 同步移除 `drawing-library` / `block-library` 两项：库不再进子页栈，顶栏不隐藏。

**一个必须注意的实现细节**：`useLibrary(libraryType)` 在创建时就把 `libraryType` 固化成闭包
（drawing/block 各选一套 SDK 函数），组件内只有 `watch(props.show)` 而无 `watch(libraryType)`。
所以图纸库↔图块库切换必须用 `:key="libraryType"` 强制重建组件实例，否则会拿旧闭包查错库。
这是「两个库共用一个组件」的隐性约束，之前子页模式靠两条独立路由天然规避了。

**顺带修正**：上面第 2 节记录的「面板 → 独立页等价性缺口」随本次回退作废——不再需要
`LibraryPanel.vue` 与 `LibraryPage.vue` 的逐项对照，因为展示方式已回到面板。
`docs/mobile-shell-regression-matrix.md` 行 3.5 / 3.7 / 6.2 / 6.3 已改为抽屉语义。

**未处理（既有残留，非本次引入）**：`src/utils/navigateBack.ts` 的
`LIBRARY_DRAWING` / `LIBRARY_BLOCK` / `LIBRARY_DRAWING_FOLDER` / `LIBRARY_BLOCK_FOLDER`
四个常量无人使用（是更早一套 `/library/*` 路径方案的残留，与壳的 `/shell/library/*` 无关）。
按「无消费者代码删或标注」原则登记于此，未删除。

## 修正记录（2026-09-08）

本 ADR 的核心决策（形态 A、常驻编辑器、子页栈、库=抽屉）不变；本轮补充**库的数据层定案**（对第 1 节结论的修正）、**文件浏览器用户侧补齐**、**管理端边界**，并**登记死代码残留**。

### 5. 库的数据层定案：抽屉用 `all-files`（扁平），管理页用 `children`（层级）

第 1 节（2026-09-07）「库页需要 `children`、`all-files` 是 bug」的结论，是在**旧全屏子页 `LibraryPage.vue`**（文件夹下钻 + 面包屑）语境下得出的。第 4 节把库回退成**抽屉**（`LibraryPanel.vue`，`FloatingPopup`，浮在画布上）后，数据层语义随之改变——第 1 节的结论对**抽屉**不再成立。

**契约核验**（不靠记忆，逐层对齐后端 `library.service.ts` → `file-tree.service.ts` + PC 侧边栏 `hooks/library/useLibraryQuery.ts`）：

| 接口 | 后端实现 | 返回形状 | 适用场景 |
|---|---|---|---|
| `GET /library/{type}/all-files/:nodeId` | `getAllFilesUnderNode`：`treeWalker.getSubtreeFiles*` 递归子树 + `findMany({ nodeType: NodeType.FILE })` | **只回 FILE 节点**（递归扁平、无文件夹），`isFolder` 恒 `false` | **库抽屉 / CAD 侧边栏**（分类下所有图纸一次铺开，不做文件夹下钻） |
| `GET /library/{type}/children/:nodeId` | `getChildren`：直接子节点 | 文件夹 + 文件（层级） | **LibraryManager 管理页**（层级浏览/管理） |

PC 侧边栏 `useLibraryQuery` 的 `flatMode`（默认 `true`）正是这个分叉点：`flatMode=true` → `getAllFiles`（侧边栏扁平浏览），`flatMode=false` → `getChildren`（管理页层级）。移动端抽屉对齐侧边栏，故走 `all-files`。

**定案**：

- **库抽屉（`useLibrary.ts`）**：`loadNodes` 走 `all-files`（`libraryControllerGet{Drawing,Block}AllFiles`），对齐 CAD 侧边栏扁平语义——分类本身就是目录结构，浏览列表里**不做文件夹下钻**。
- **管理页（`LibraryManager`，PC 端）**：走 `children`（层级浏览）。
- 移动端**不移植**管理页（见第 7 节），所以移动端库域**只**用 `all-files`。

**对第 1 节 spec 的更正**：`useLibrary.spec.ts` 的契约已从「必须调 `children`、`all-files` 不得被调用」**反转为**「必须调 `all-files`、`children` 不得被调用」（drawing/block 参数化 + 搜索下推 + 静默空态）。教训：**「与 PC 一致」要对齐具体参照物**——侧边栏是扁平 `all-files`，管理页是层级 `children`，不能只看接口名就下结论（呼应第 1 节「盘点≠契约核验」）。

### 6. 文件浏览器用户侧补齐（`FileBrowserPage.vue`，`/shell/file` 全屏子页）

文件浏览器补齐用户侧能力，全部走 `@cloudcad/api-sdk`（无原生 `fetch`/`FormData`）：

| 能力 | 实现 |
|---|---|
| **上传** | 复用 `mobileUploadService.uploadFile`（SDK `mxcadUploadController*`：`calculateFileHash` 算 MD5 → `checkFileExist` 秒传 → 5MB 分片 `checkChunkExist`），进度 toast；**不再**用原生 `fetch` + `FormData` |
| **项目 Tab 分页** | `projectControllerGetProjects` 真实分页（`page`/`limit:20`/`search`/`sortBy:updatedAt desc`），无限滚动（`@scroll.passive` 触底 `loadMore`）+「没有更多了」页脚；搜索 300ms 防抖重置到第 1 页 |
| **个人空间 Tab** | `useUnifiedFileList('personal')`（`nodeControllerGetChildren` 服务端搜索），文件夹下钻 + 面包屑 |
| **网格卡片裁切 bug** | `UnifiedFileList.vue` 的 `.grid-item` 原 `overflow:hidden` 令 CSS grid 自动行轨道只按 min-content 定高，把卡片压成一条（名称被裁顶、缩略图塌缩）；改 `min-width:0`（长名称由 `.grid-name` 自身 `ellipsis` 裁切），浏览器实机验证前/后（itemH 33.55px → 219px，缩略图恢复方形） |

### 7. 管理端边界：移动端不移植 admin 界面

用户明确：**移动端只实现用户侧界面，不实现任何管理员界面**。ADR「技术要点」表「后端 admin 全部保留 PC 端不变，移动端不做 admin」维持不变。本轮文件浏览器 / 库抽屉均**不含**管理端能力——建文件夹 / 删除 / 移动 / 重命名 / 批量操作等 `LIBRARY_*_MANAGE`、项目管理端点一概**不移植**。库的层级管理走 PC 端 `LibraryManager`（`children`），移动端库抽屉只读浏览 + 插入图块 / 打开图纸。

### 8. 死代码残留登记

数据层定案（第 5 节）+ 库改抽屉（第 4 节）后，两处遗留代码已无消费者。按「无消费者代码删或标注」原则处理：**`useUnifiedFileList.ts` + `UnifiedFileList.vue` 的库分支已在本轮清理**（已验证 type-check + 测试），**`useLibrary.ts` 的文件夹下钻残留本轮未删**（涉及 `LibraryPanel.vue` 消费，收尾方向见下）。

| 位置 | 残留 | 原因 | 状态 |
|---|---|---|---|
| `useUnifiedFileList.ts` | `library-drawing`/`library-block` 两个 `UnifiedDomain` 分支 + `libraryController*` 导入 + `isLibrary`/`getLibraryType`/`libraryApi`/`fetchRootAndCategories`/`selectCategory`/`categories`/`selectedPath`/`categoryLabel`/`rootId`/`loadSavedCategory` | 库改抽屉后，文件浏览器只以 `useUnifiedFileList('personal')`（`FileBrowserPage`）/ `('project')`（`ProjectDetailPage`）调用，库分支恒不可达 | **已清理**：`UnifiedDomain` 收敛为 `'project' \| 'personal'`，库分支 + 未用导入（含 `nodeControllerSearch`）已删；`UnifiedFileList.vue` 的 `domain === 'library*'` 空态第三分支 / FAB `v-if` 守卫 / 头部注释一并移除 |
| `useLibrary.ts` | `goBackTo`/`breadcrumbs`（导出但无消费者）+ `enterFolder`/`isFolder`（`LibraryPanel.vue` 消费但 `all-files` 恒无文件夹 → 分支不可达）+ `currentFolderId`（恒 `null`） | 抽屉不做文件夹下钻（第 5 节），`all-files` 只回 FILE，文件夹下钻机制整体失效 | **未删（收尾方向）**：删 `goBackTo`/`breadcrumbs`/`currentFolderId`；`enterFolder`/`isFolder` 须随 `LibraryPanel.vue` 的文件夹分支（line 73/235/307）一并移除，涉及已验证的抽屉 UI，风险高于纯 composable，留后续单独收尾 |
