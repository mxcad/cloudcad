# CloudCAD UI/UX 真实交互认证 E2E 测试发现报告

- 测试日期：2026-10-29
- 测试方法：agent-browser 0.27.0 真实浏览器操作（6 个并行子代理，各自独立 session / 独立临时账号）
- 环境：frontend `:8000`（Vite dev）/ backend `:3001`（`node dist/main`，PID 29576 启动于 10:25，加载 11:48 构建的 dist）/ PG `:5433` / Redis `:6380` / conversion-service `:3100`
- 范围：认证（登录/注册/MFA/邮箱·手机验证/忘记密码）、用户账号/会员中心、文件系统管理、项目/分享、CAD 编辑器自实现命令、管理后台（用户/角色/IP 访问/运行时配置）
- 性质：**只测不改**。重点覆盖【反模式 / 非正常操作 / 模拟真实用户】分支；每条问题已与源码对照复核，区分「产品缺陷」与「测试制品 / 环境噪声」。

---

## 结论速览

| 区域 | 确认产品缺陷 | 高 | 中 | 低 | 测试制品/未确认 |
|---|---|---|---|---|---|
| 认证 | 2 | 0 | 0 | 2 | 1（BUG-AUTH-03 低置信） |
| 用户/会员 | 2 | 1 | 1 | 0 | 1（OBS-USER-04） |
| 文件系统 | 4 | 0 | 2 | 2 | 1（OBS-FS-06 受 HMR 干扰） |
| 项目/分享 | 6 | 3 | 2 | 1 | 2（PROJ-02 / PROJ-06） |
| CAD 编辑器 | 6 | 0 | 3 | 3 | 1（BUG-CAD-04 符合设计） |
| 管理后台 | 4 | 1 | 2 | 1 | 0 |
| **合计** | **24** | **5** | **10** | **9** | **6** |

> 高 = 崩溃/数据丢失/流程不可用/安全；中 = 功能异常但可绕过；低 = 体验/文案/样式。

---

## 一、管理后台（4 项，含 1 高）

### [BUG-ADMIN-001] 把自己 IP（白名单 IP）加入 IP 黑名单无任何保护，黑名单优先于白名单，管理员把自己锁死 — 高 · 反模式
- **复现**：管理员登录 `/admin/ip-access` →「IP 黑名单」tab → 添加 `127.0.0.1`（自己 + 白名单内 IP）→ toast「已添加到 IP 黑名单」（**无任何"该 IP 在白名单/会锁死管理员"警告**）→ 重新调用管理员登录 → `403 FORBIDDEN "当前 IP 已被加入黑名单，禁止登录"`。
- **预期**：添加黑名单时检测该 IP 同时在管理员白名单，提示风险或禁止；至少不应锁死白名单管理员。
- **实际**：后端允许把白名单 IP 加入黑名单，且黑名单判定优先于白名单（fail-close），管理员把自己拉黑后下次登录立即被拒。
- **证据**：UI toast；DB `ip_blacklist_entries` 新增 ip=127.0.0.1 source=MANUAL；`POST /admin/auth/login` → `{"code":"FORBIDDEN","message":"当前 IP 已被加入黑名单，禁止登录"}`；黑名单缓存 Redis `ip-blacklist:exact`（清缓存才恢复）。
- **影响**：管理员可无警告地锁死自己登录入口。安全设计上的"防自锁"缺口（黑名单 fail-close 本身是刻意的，缺的是**添加时的白名单冲突检测/风险提示**）。
- **✅ 已修复（2026-10-30）**：**先查设计决策**——ADR-0044 的 IP 黑名单为应用层人工管理、**fail-close（黑名单判定优先于白名单是刻意设计）**、ADR 本身**无白名单概念**；仓内另有独立 `IpWhitelistService`（管理员 IP 白名单，环回恒放行作为**自救通道**，同样 fail-close），且 admin-auth **先查黑名单再查白名单（刻意）**。故「黑名单优先于白名单」**非缺陷**（安全 fail-close 设计），真缺陷 = **添加时可把自救通道（环回）拉黑、无任何保护**。**修复（手术式，不碰 fail-close 设计）**：硬拦环回地址入黑名单——①后端 `ip-blacklist.utils.ts` 新增 `isLoopbackEntry()`（CIDR 用 `cidrContains` 判 `127.0.0.1`/`::1`，精确值判 `::1` 或 `127.` 前缀），`ip-blacklist.service.ts` `addEntry` 格式化校验后 `if (isLoopbackEntry(ip)) throw new BadRequestException(i18n 'error.ip_blacklist.loopback_not_allowed')`（400，非 500）；②前端 `AddEntryModal.tsx` 提交前 `else if (isLoopbackIpOrCidr(trimmedIp)) setIpError(t('不能将本机环回地址加入 IP 黑名单'))` 内联拦截、不提交；`ipCidrValidation.ts` 镜像 `prefixMask()/cidrContains()/isLoopbackIpOrCidr()`；③后端 4 语言 `error.yml` 新增 `ip_blacklist.loopback_not_allowed`；前端 i18n 键 `1000317`（idMap 数值型）+ 4 语言文件。**验证**：后端 3 个环回测试（127.0.0.1/127.0.0.0/8/::1 拒 400）+ 前端 `index.spec.tsx` BUG-ADMIN-001 用例，全绿；后端 53/53、前端 26/26；双端 `tsc --noEmit` 0；**真实 API 测试**（curl 带 admin token）：`POST /api/v1/admin/ip-blacklist` 的 `127.0.0.1`/`::1`/`127.0.0.0/8` → **400「不能将本机环回地址加入 IP 黑名单」**（修复前静默 201 并自锁），对照 `203.0.113.0/24`（合法非环回）→ **201 正常入黑名单**（正常添加不受影响）；**真实浏览器测试**：`/admin/ip-access?tab=blacklist` → 添加 → 填 `127.0.0.1` + 原因 → 确认添加 → 弹窗内**内联错误「不能将本机环回地址加入 IP 黑名单」**，弹窗保持打开、输入保留 `127.0.0.1`、未发请求。**清理**：删除实测的 `203.0.113.0/24` 测试条目、关闭浏览器。⚠️ 注：环回地址本就恒在白名单（自救通道），**入黑名单 = 白名单冲突**，故直接禁止而非仅提示——与「白名单 IP 不该入黑名单」语义一致。

### [BUG-ADMIN-002] 唯一约束冲突错误文案「字段 已存在」（i18n 参数 `{fields}` 未替换，字段名丢失）— 中 · 反模式
- **复现**：`/roles` 新建角色填一个已存在角色名 → 点「保存配置」→ alert「提示 / 字段 已存在 / 确定」。
- **预期**：「角色名称已存在」类明确字段名。
- **实际**：`字段` 二字是后端模板 `unique_constraint: 字段 {fields} 已存在` 的占位，但 `{fields}` 为空串，字段名丢失。
- **根因（源码确认）**：`packages/backend/src/common/filters/prisma-exception.filter.ts:56-65` P2002 分支 `const targets = exception.meta?.target; if (Array.isArray(targets) && targets.length > 0) {...} else { fields='' }`。Prisma 7 的 P2002 `meta.target` 是**字符串**（约束名，如 `roles_name_key`）而非数组 → 走 else → `fields=''`。
- **影响**：所有唯一约束冲突场景（角色重名、用户名/邮箱/手机号重复等）错误文案丢失字段名，误导排障。

### [BUG-ADMIN-003] 新建角色弹窗角色名为空时点「保存配置」静默无反馈 — 中 · 反模式
- **复现**：`/roles` → 新建角色 → 角色名称留空（必填 `*`）→ 点「保存配置」。
- **预期**：提示「请输入角色名称/不能为空」。
- **实际**：完全静默——弹窗不关闭、无 toast、无字段错误样式（按钮 `disabled=false` 可点但无响应）。对照：填有效名点保存能正常 toast「角色创建成功」。
- **证据**：eval 检查 `aria-invalid`/`[class*=error]`/`[role=alert]` 均无，`[class*=toast]` 为空。
- **✅ 已修复（2026-10-29）**：**先查设计决策**——`useRoleForm.handleSave` 已有 `if (!name)` 空名校验（`showError(t('请输入角色名称'))`），后端 `CreateRoleDto` 也有 `@IsNotEmpty()`。**实测复现**：浏览器真实操作「名称留空 → 保存配置」**实际弹出「提示：请输入角色名称」ErrorModal，报告的「完全静默」不可复现**（校验生效；报告的 eval 可能漏检 ErrorModal 结构或为瞬态误判）。**但发现相邻真实缺陷**：`if (!name)` 与后端 `@IsNotEmpty()` 都**放过纯空白名**（`' '` 是 truthy 非空字符串）——纯空格名保存会穿过校验、弹窗关闭、**后端创建出空白名角色**（实测 DB 出现 `name=" "` 的 CUSTOM 角色）。**修复**：①前端 `useRoleForm.ts` `!name` → `!name.trim()`（拦截空名+纯空格名），保存前 `name.trim()` 去首尾空白；②后端 `create-role.dto.ts` + `create-project-role.dto.ts` 的 `name` 增加 `@Matches(/\S/, { message: '角色名称不能全为空白字符' })` 兜底。**验证**：`RoleManagement.spec.tsx` 新增「纯空白角色名不发送请求并提示」用例，16/16 全绿；`role-name-validation.spec.ts`（后端 DTO）3/3 全绿（空白名拒绝/正常名通过）；前端 `tsc --noEmit` 0。**真实浏览器测试**：`/roles` 新建角色填纯空格名 → 保存 → 弹「提示：请输入角色名称」，弹窗保持打开，DB 无空白名角色（修复前创建出 `name=" "` 角色，已清理）。**清理**：删除实测创建的空白名脏角色、关闭浏览器。⚠️ 注：后端 `dist` 因运行中进程锁定未重建，运行中的 3010/3001 后端暂未含 `@Matches` 兜底（源码已改，前端 trim 已足够拦下 UI 路径，构建/部署时生效）。

### [BUG-ADMIN-004] 删除自己的确认框无「不能删除自己」提示（后端有硬保护，仅 UX 反馈缺失）— 低
- **复现**：`/users` 对自己所在行触发删除 → 确认框无「不能删除自己」文案（编辑弹窗有「不能修改自己的角色/账户状态」提示，删除确认框没有）。
- **实际**：后端 `isAdminUser` 硬保护存在，但 UI 未前置提示，用户点了删除确认才被告知失败。
- **✅ 已修复（2026-10-30）**：**先查设计决策**——后端 `user-status.service.ts:56` `softDelete` 对 `isAdminUser` 目标 `throw "不能删除管理员账户"`（含删自己，前端无角色前置提示），属「后端硬保护 + 前端 UX 反馈缺失」而非功能 bug。**修复**：①前端 `DeleteUserConfirm.tsx` 新增 `blockReason` prop：非空时渲染 `formNotice`（`role=alert`）展示阻断原因、**禁用「确认删除」按钮**、隐藏「立即注销（不等待30天冷静期）」选项；②`UserManagement/index.tsx` `handleDelete` 计算目标 = 当前用户自己 → `不能删除自己`，目标角色 = ADMIN → `不能删除管理员账户`，否则 null；批量删除 `openBatchDelete` 清除可能残留的单删阻断原因（批量无单目标语义）；③新增 i18n 键 `1000314`（不能删除自己）/`1000315`（不能删除管理员账户），写全 4 语言文件 + idMap.json。**验证**：`UserManagement.spec.tsx` 新增 3 用例（删自己→提示+按钮禁用+不发送请求；删其他管理员→提示+按钮禁用；批量不携带单删残留），29/29 全绿；前端 `tsc --noEmit` 0；4 语言 + idMap 键一致性已核对。**真实浏览器测试**：`/users` 对 `admin`（当前登录者）行点「注销」→ 确认框出现 `role=alert`「不能删除自己」，**确认按钮 disabled**，「立即注销」选项隐藏，删除请求未发出；对照 e2e_admin 行（另一管理员）→ 同样前置阻断。**清理**：关闭浏览器、未产生任何脏数据（未实际删除）。⚠️ 注：后端 `isAdminUser` 硬保护未改动（已有），本次仅补前端 UX 前置提示。

---

## 二、项目 / 分享（6 项，含 3 高）

### [BUG-PROJ-01] 创建项目入口仅在空态显示，项目列表非空后「创建项目」按钮消失 — 高
- **复现**：无项目用户登录 `/projects` → 空态有「创建项目」按钮 → 创建 1 个项目成功 → 列表非空后遍历「我的项目/全部/我创建的/我加入的」全部 tab 及 `/cad-editor` 项目管理面板，**均无创建入口**。
- **实际**：无法连续创建第二个项目（DB 里用 API 直建后，UI 仍无入口）。API 侧创建行为正常，纯 UI 入口缺失。
- **证据**：截图 `projects-list.png`（顶部仅 返回/刷新/视图/回收站，无 + 号）；源码 `ProjectListView.tsx:114` 创建按钮条件渲染 `{onCreateProject && ...}`，`FileSystemStates.tsx:145` 仅空态调 `onCreateProject`。

### [BUG-PROJ-03] 项目名称允许非法文件名字符（`<>:"/\|?*`），前后端均不校验 — 中 · 反模式
- **复现**：创建项目 name=`测试<>:"/\|?*特殊` → 前端直接接受 → 后端 `POST /file-system/projects` 返回 **HTTP 201 SUCCESS**，DB 出现含非法字符的 PROJECT 节点。
- **根因（源码确认）**：`create-project.dto.ts` 仅 `@IsString() @Length(1,100)`，**无**非法字符校验（对比 `createFolder` 走 `name-rules.ts` 的 `checkFileName`）。该名称若用于文件系统路径/导出/URL 会失败。
- **对照**：文件夹/文件创建有非法字符校验，项目名没有 → 不一致。

### [BUG-PROJ-04] 项目重命名（行内编辑点对勾/Enter）保存不生效，未发出任何请求 — 高
- **复现**：项目详情 `/projects/:id/files` → 点项目名右侧铅笔进入行内编辑 → 改名称 → 点对勾或 Enter。
- **预期**：名称更新并持久化。
- **实际**：编辑框关闭、标题与 DB 均保持旧名，**fetch 拦截显示未发出任何 `/file-system` 请求**。后端 `PATCH /file-system/projects/:id` 单独调用返回 200 成功 → 问题在前端（保存回调未触发请求）。
- **证据**：点对勾（svg path `M20 6 9 17l-5-5`）后 `window.__api` 无 `/file-system` 记录；DB name 仍旧值。
- **✅ 判定（2026-10-29）：设计误判，非 bug，无需改码。** 该铅笔的 Tooltip 是「编辑路径」（i18n key 4672），`onPathSubmit` → `handleBreadcrumbPathSubmit` → `nodeControllerResolvePath` + `navigate`——这是一个**路径跳转编辑器**（输入路径并跳转），**不是项目重命名入口**。真正的重命名入口是**右键 / F2 → RenameModal → `useFileSystemCRUD.handleRename` → `nodeControllerUpdateNode`**（PATCH `/file-system/nodes/:id`），该链路完整、有单测覆盖，且后端已实测：PATCH 改名返回 200、GET 确认持久化、已还原。设计决策（`docs/design/file-browser-core/design-A.md` / `design-B.md` / ADR-0052）明确：**面包屑=导航元素，`rename(node, name)`=独立契约**，实现与设计一致。报告把「编辑路径」误认为「项目重命名」。

### [BUG-PROJ-05] 未登录用户可访问 `/cad-editor` 并看到项目列表外壳（路由守卫缺失/不一致）— 高 · 反模式
- **复现**：全新会话（无 accessToken/user）直接打开 `http://127.0.0.1:8000/cad-editor`。
- **预期**：未登录访问受保护页应跳 `/login`（对照 `/projects` 正是如此）。
- **实际**：`/cad-editor` **未跳登录**，渲染项目管理界面外壳（左侧「共 8 项 防撞墙图/temp_empty/01海绵城市…」项目卡片）。真实 API 无 token 返回 `UNAUTHORIZED`（**真实数据未泄露**），但 UI 暴露项目面板外观，误导未登录用户。
- **根因（源码确认）**：`App.tsx:424-425` 路由 `/cad-editor` / `/cad-editor/:fileId` 的 element 是**空 `<></>`**，真正 UI 由全局 `CADEditorRouteGuard`（L193，`AppContent` 内，**不在 ProtectedRoute 内**）渲染 → 未登录访问该路径时受保护 UI 仍挂载。而 `/`（L445-446）在 ProtectedRoute 内重定向 → 不一致。
- **注**：数据未泄露（API 401），但 UI 暴露 + 路由保护不一致是真实缺陷。

### [BUG-PROJ-07] 分享创建表单只有「有效期」，无「密码」「权限级别」设置项 — 中（功能缺失）
- **复现**：分享管理 → 新建分享 → 分享设置 → 仅「有效期」（永不过期/2h/6h/12h/1天/3天/7天/自定义/立即过期）+「生成分享链接」。
- **实际**：无密码输入框、无权限级别选项。`CreateShareDto` 仅 `fileId` + `expiresIn`（后端 DTO 亦无这些字段）。
- **影响**：任务要求的「密码分享」「权限级别」分支在 UI 不可达（功能层面缺失，非测试受限）。
- **⚠️ 复核结论（2026-10-30）：功能缺失（产品范围决策），非回归缺陷**。**先查设计决策**——仓内**无任何 ADR/设计文档**规划分享的「密码」「权限级别」；`file_shares` 表列仅 `id/fileId/token/createdBy/expiresAt/usedCount/deletedAt/createdAt/updatedAt`（**无 password/permission 列**）；`CreateShareDto` 仅 `fileId + expiresIn`；`ShareDialog.tsx` 仅「有效期」选择器（L799/L823），**无密码/权限 UI**；git 历史无「实现后又移除」痕迹。**定性**：当前分享功能是**令牌 + 有效期**形态（无密码、无权限级别），「密码分享」「权限级别」**从未实现**，非本次改动引入的回归，也非「设计如此但 UI 藏了」——是**功能层面的产品范围缺口**（E2E 任务预设了该分支，但产品从未提供）。**按「Simplicity First / 不做超出要求的功能 / 无消费者不写防御」原则不作为 bug 修复**：实现它 = DB migration（加 password/accessLevel 列）+ 后端 DTO/Service（生成校验 + 解析）+ 前端 UI（密码框/权限选择）+ 测试，属**范围扩张**，需产品决策拍板是否立项。**建议**：若产品确认要「密码分享/权限级别」，另立 feature 任务（含三层一致性：前端↔api-sdk↔后端↔DB）；本次不实现。

### [BUG-PROJ-08] 分享链接 `fileName` 参数中文名被错误编码（乱码）— 低
- **复现**：分享中文名图纸（如「测试图纸A.mxweb」）→ 生成链接 `?shareToken=...&fileName=%EF%BF%BD%EF%BF%BD%EF%BF%BD%EF%BF%BD%CD%BC%D6%BDA.mxweb`。
- **实际**：中文被编码成 U+FFFD 替换字符序列 + GBK 残留（标题在终端显示为替换字符），存在乱码/兼容风险。
- **⚠️ 复核结论（2026-10-30）：非产品缺陷（测试制品）**。**先查设计决策**——无 ADR/设计文档规定分享链接 fileName 编码；仓内 `fonts/mojibake.utils.ts` 记录该族问题的**既有设计决策**：busboy（multer 依赖）默认用 **latin1** 解码 multipart 文件名，浏览器以 UTF-8 字节发送的中文名会被解成乱码，对策 = 上传拦截器配 `defParamCharset: 'utf8'` + `decodeMojibakeFileName` 防御。**源码确认**：所有图纸/字体/库上传路径均已配 `defParamCharset: 'utf8'`（`mxcad-upload.controller.ts:170`、`fonts.controller.ts:99`、`library.controller.ts:199/218`），分享链接两处构造 `share.service.ts:80`/`:295` 均 `encodeURIComponent(fileNode.name)`（正确对合法字符串做 UTF-8 百分号编码），前端 `shareUrl()` 仅前置 origin、**逐字透传**后端 url，不重建 fileName。**真实 API 测试**（curl 带 admin token）：分享 DB 中名字干净的中文图纸 `防撞墙图.mxweb` → `POST /api/v1/shares` 返回 `url=/cad-editor/...?shareToken=...&fileName=%E9%98%B2%E6%92%9E%E5%A2%99%E5%9B%BE.mxweb`（**完全正确的 UTF-8 编码**）；`GET /api/v1/shares` 列表端点同样返回 `fileName=防撞墙图.mxweb` + `%E9%98%B2...`。**根因定性**：乱码 URL 里的 `%EF%BF%BD`（U+FFFD）不是分享代码产生的——`encodeURIComponent` 只是忠实编码它拿到的字符串；该 URL 出现的充要条件是 **DB 里的文件名已被上游写坏（含 U+FFFD）**。**DB 核查**：真实文件（防撞墙图.mxweb/个人图纸1.mxweb/TM8.780.10796 插针绝缘体.dwg 等）名字**全部是干净 UTF-8**（code points 正确）；全库**仅 1 条**名字含 U+FFFD = `E2E ������Ŀ`（原「E2E 测试项目」，**E2E 前缀表明是自动化测试制品**，非用户流）。**机制复现**：用 GBK 终端 curl 以 GBK 字节发 JSON 名（`乱码测试项目A_...`）→ 后端按 UTF-8 解码 → DB 落 `\uFFFD` 序列（**确认了「非 UTF-8 字节输入」是唯一腐败源**）；真实浏览器**恒发 UTF-8**（JSON 按规范、multipart 经 defParamCharset），不产生该输入。**结论**：分享链接 fileName 编码逻辑**正确**，正常用户流（浏览器上传/创建中文名 → 分享）不产生乱码；报告中的乱码 URL 是其「上游文件名已腐坏」的**下游症状**，而该腐坏只来自非 UTF-8 的测试工具输入（如 GBK curl/脚本），**非用户可达路径**。**清理**：删除实测创建的测试分享与 GBK 腐坏项目（已软删）、关闭浏览器。⚠️ 注：未改任何代码（编码正确，无需修复）；若未来要防「存量腐坏名传播到分享 URL」，可在 `encodeURIComponent` 前过滤 `\uFFFD` 或对名做 UTF-8 合法性校验——但按「无消费者/不可能场景不写防御」原则暂不添加。

---

## 三、文件系统（4 项）

### [BUG-FS-01] 新建文件夹时双击「创建」产生两个同名文件夹 — 中 · 反模式
- **复现**：项目文件树 →「新建文件夹」→ 填名称（如 `双击测试`）→ **快速双击**「创建」→ 列表出现两个同名文件夹，DB 有两条 `FOLDER` 记录。
- **预期**：一次点击创建一个（或第二次点击被禁用）。
- **实际**：两个同名文件夹。DB 硬验证两条记录（`cmvsz6ou6000...` / `cmvsz6ou7000...` 同名同 parent）。
- **根因**：`CreateFolderModal` 的「创建」按钮在提交中无 `disabled` 状态（无防抖/禁用），用户快速双击高频操作即重复创建。
- **✅ 已修复（2026-10-29）**：`CreateFolderModal` 增加 `submittingRef` 提交中防重锁（首次点击同步置位，`onCreate` 返回的 Promise 完成后释放），按钮与 Enter 双路径都走 `handleCreate` 守卫；`loading` 为 true 时同样拦截。**验证**：新增 `CreateFolderModal.spec.tsx` 4 例（快速双击只 1 次、Enter+按钮只 1 次、loading 拦截、完成后可再提交）全绿；`FileSystemManager.spec` + `useFileSystem.spec` 7 例绿；`tsc --noEmit` 0。**真实浏览器测试**：项目内快速双击「创建」→ DB 仅 1 条 `双击测试FS01` FOLDER（修复前 2 条）；UI 列表显示 1 个文件夹；已清理测试数据（DELETE SUCCESS）。

### [BUG-FS-02] 已删除文件仍可「下载成功」（提示与后端实际状态不一致，且已删内容可经缓存下载）— 中 · 反模式
- **复现**：上传文件并成功下载一次（建立浏览器 HTTP 缓存）→ 后端 `DELETE /nodes/{id}` 软删该文件（模拟其他会话删除；本会话 UI 无事件推送仍显示该文件）→ UI 点「下载」→ 前端 toast「文件下载成功（MXWEB 格式）」，但后端实际返回 404「节点不存在」。
- **根因（源码确认）**：`download.controller.ts:374` `downloadNodeWithFormat` 设 `Cache-Control: public, max-age=3600` —— 下载响应允许浏览器缓存 1 小时；文件删除后浏览器在 max-age 内直接命中旧缓存返回 200，不向后端重新验证。curl 直连后端与走代理均 404，证明是浏览器缓存命中。
- **证据**：network 软删后 `download-with-format?format=mxweb` 仍 200；curl 直连 3001 / 走 8000 代理均 404；DB 节点 `fileStatus=DELETED`。
- **影响**：跨会话/多用户场景下，已删文件内容仍可经浏览器缓存下载（一致性/合规隐患）。
- **建议**：下载响应改 `no-store`（或 `no-cache` + 强制 revalidate），或前端下载请求 `cache:'no-store'`；删除后事件/轮询刷新本会话列表。

### [BUG-FS-03] 搜索无结果时显示「项目中暂无文件」，误导用户以为项目为空 — 低
- **复现**：项目（含 `双击测试` 文件夹）→ 搜索框输入 `zzz不存在xyz` → 空态文案「项目中暂无文件」。
- **预期**：「未找到与搜索匹配的内容」类文案。
- **实际**：`FileSystemStates.tsx` 用 `isEmptyProject` 分支，未区分「项目本身为空」与「搜索无结果」。
- **✅ 已修复（2026-10-29）**：`FileSystemStates.tsx` 主标题增加 `searchTerm` 分支，搜索时显示「未找到匹配的内容」（i18n 4921），不再误显示「项目中暂无文件」；副标题「没有找到匹配的内容」保留。**验证**：新增 `FileSystemStates.spec.tsx` 4 例（项目搜索无结果标题、副标题、非搜索项目空仍显示项目中暂无文件、普通文件夹搜索无结果）全绿；`tsc --noEmit` 0。**真实浏览器测试**：项目内搜索 `zzz不存在xyz` → 空态主标题「未找到匹配的内容」+ 副标题「没有找到匹配的内容」（修复前主标题「项目中暂无文件」）；清空搜索后回到「项目中暂无文件」。

### [BUG-FS-04] 超长名称（100~255 字符）提示为英文 — 低
- **复现**：新建/重命名输入 100~255 字符 → toast 英文 `name must be shorter than or equal to 100 characters`。
- **根因（源码确认）**：`packages/platform/src/files/name-rules.ts` `checkFileName` 默认 `maxLength=255`，后端 DTO 上限 100，两端上限不一致；100~255 区间落入后端英文报错（未走 i18n 中文文案）。

---

## 四、用户账号 / 会员中心（2 项）

### [BUG-USER-01] 邮箱换绑「获取验证码」稳定 500，阻断改邮箱；且码已生成却被报失败、限流错误被误包装为 500 — 高（含环境因素）✅已修复
- **复现**：`/profile` →「邮箱地址」→「换绑邮箱」→「请输入原邮箱验证码」→ 点「获取验证码」→ 前端「发送验证码失败」，`POST /api/v1/auth/send-unbind-email-code` → **500** `{"code":"INTERNAL_SERVER_ERROR","message":"发送验证码失败，请稍后重试"}`。curl 直连后端稳定复现。
- **根因（两层）**：
  1. **直接根因 = 真实 SMTP 发送失败（环境依赖）**：`email.service.ts#sendVerificationEmail` 经 `smtp.qq.com` 发送，本沙箱环境无法连通/认证 → 抛错 → 500。生产 SMTP 正常时流程应能走通。（本机当前 SMTP 正常可发信，此路径不触发。）
  2. **真实 UX 缺陷（独立于环境）**：Redis 反查证实**验证码已生成入库**（`email_verification:code:...`=`360916`，TTL≈13min），但用户看到「发送验证码失败」且 UI 停在发送步、无任何重试/手动验证入口——**成功码被孤儿化，用户无法使用**。
- **错误分类不当（真实缺陷）**：`account-binding.service.ts#sendUnbindEmailCode` 的 catch 把「发送过于频繁」`BadRequestException`(400) 也一并吞掉重抛为 `InternalServerErrorException`(500)，限流场景同样显示 500——语义错误。
- **决策核对（用户铁律：先查决策再判 bug）**：ADRs/设计文档无专门条目；**对照短信兄弟** `SmsVerificationService.sendVerificationCode`（架构审查 ⑥ 收敛时确立的既定模式）——其在发送失败时**清理孤儿码 + 限流键**（`del(codeKey)/del(rateLimitKey)/decr 计数`）并返回 `{success:false}` 优雅文案，**不抛 500、不遗留孤儿码**。邮件服务未照此办理，属**对既定模式的偏离**。
- **真实缺陷（两个）**：
  1. **码孤儿化**：`EmailVerificationService.sendVerificationEmail` 先 `generateVerificationToken`（storeCode 入库）再 `emailService.sendVerificationEmail`（`mailerService.sendMail` **抛错**而非返回 success:false）；SMTP 失败时**不清理已入库码**，用户收不到邮件但 Redis 躺着有效码 → 卡死。
  2. **错误分类**：`AccountBindingService` 三个 send-code catch 块（`sendBindEmailCode`/`sendUnbindEmailCode`/`sendUnbindPhoneCode`）统一吞掉所有异常重抛 500，把验证码服务抛出的限流 `BadRequestException`(400) 也吞成 500。
- **修复（后端，前端零改动）**：
  1. `email-verification.service.ts#sendVerificationEmail`：SMTP 发信包 try/catch，失败时 `del(codeKey)` 清孤儿码后原样重抛（对齐短信兄弟清理模式）。
  2. `account-binding.service.ts` 三个 catch 块：`if (error instanceof HttpException) throw error;`——限流 400 原样透出；仅真正的发送失败（非 HttpException）落 500 友好文案。
- **验证**：
  - 单测：`email-verification.service.spec.ts` 新增「SMTP 失败删除孤儿码并重抛」；`account-binding.service.spec.ts` 新增「BUG-USER-01」describe 4 例（sendUnbindEmailCode/sendBindEmailCode/sendUnbindPhoneCode 限流 400 原样透出 + 真发送失败仍 500）。auth+notification 全量 **391 例绿**；`tsc --noEmit` 0 错；构建+api-sdk 重生成成功。
  - **API 级真实验证**（后端重建重启后 curl）：第 1 次 `POST /api/v1/auth/send-unbind-email-code` → **200**；立刻第 2 次 → **HTTP:400 `{"code":"BAD_REQUEST","message":"发送过于频繁，请稍后再试"}`**（此前为 **500** `{"message":"发送验证码失败，请稍后重试"}`）。Redis 反查：成功路径仍正确落码（`code`+`rate_limit` 双键 TTL 正常），修复未破坏发送成功路径。
  - 孤儿码清理路径本机不可用 API 触发（SMTP 当前可发信，不失败），由单测覆盖删除逻辑；前端经 `getErrorMessage`（BUG-USER-02 已证原样透出后端文案）展示修复后的 400 文案。

### [BUG-USER-02] 会员中心「立即升级」遇 500「payment is disabled」，UI 未按 `paymentEnabled` 门控 — 中 ✅已修复
- **复现**：`/member-center` → 方案对比区显示 VIP1/2/3 与「开通」按钮 → 选档位（如 VIP1）→「立即升级 · ¥15.00」→ `POST /api/v1/billing/orders` 返回 **500** `"payment is disabled"`；订单历史仍「暂无订单记录」。
- **实际**：`paymentEnabled=false`、`membershipEnabled=true`——UI 未按 `paymentEnabled` 门控，仍展示「开通/立即升级」入口，点击直接撞 500 原始错误、无友好提示。
- **决策核对（用户铁律：先查决策再判 bug）**：查询 **ADR-0068 第 14 行**——`paymentEnabled` 配置为 `isPublic:false`，前端**无法预判**开关状态，因此设计**有意不隐藏**支付入口（若隐藏则开关开启时入口消失、开关关闭时用户无感知），改为**后端 403 文案原样透出**、由下单失败的错误态承载提示。故「UI 未按 `paymentEnabled` 门控」**属设计意图（BY DESIGN），非缺陷**。
- **真实缺陷**：后端实际返回 **500**（`payment-gateway.factory.ts` 抛裸 `Error('payment is disabled')` → `GlobalExceptionFilter` 兜底成 500 INTERNAL_SERVER_ERROR），与设计要求的 **403** 不符，且文案为未本地化的原始英文。
- **修复（后端，前端零改动）**：
  1. `packages/backend/src/billing/gateway/payment-gateway.factory.ts` `resolveProvider()`：`!runtimeEnabled` 改为抛 `ForbiddenException`(403)，文案走 i18n `error.billing.payment_disabled`（不再抛裸 `Error`→500）。
  2. 4 个 `error.yml`（zh-CN/zh-TW/en-US/ko-KR）新增 `billing.payment_disabled` 键。
  3. 前端 `PlanSelectOverlay.handleBuy` 已用 `getErrorMessage(error)` 透传后端 403 文案——**无需前端改动**。
- **验证**：
  - 后端单测 `payment-gateway.factory.spec.ts` 断言 `rejects.toThrow(ForbiddenException)`；billing 全量 133 例绿；`tsc --noEmit` 0 错。
  - 前端回归 `errorHandler.spec.ts` 新增「403 响应原样透出后端本地化文案」用例，9/9 绿。
  - **浏览器端到端**（agent-browser）：admin 登录 → `/member-center` → 方案对比选 VIP2 → 「立即升级 · ¥30.00」→ 订单区**原样显示**「支付功能未开启，暂时无法购买或续费」（此前为 500「payment is disabled」）。
  - API 级（前置会话）：`POST /api/v1/billing/orders`（paymentEnabled=false）→ **HTTP:403** `{"code":"FORBIDDEN","message":"支付功能未开启，暂时无法购买或续费",...}`。

---

## 五、CAD 编辑器自实现命令与交互（6 项）

> 引擎为 MxCAD TryVersion 7.0，WebGL webgl2 正常。标注命令（面积/线性/箭头/云线/批注/角度/坐标/检查/打印）触发 + Esc 退出均无异常；文件队列（转换/下载/上传 tab、快速切换）无崩溃；分享（生成链接/撤销确认/无文件提示先保存）正常。

### [BUG-CAD-01] 附着图片对话框「关闭」按钮点击无效，必须按 Esc 才能关闭 — 中 · 反模式
- **复现**：ribbon「插入」→「插入图片」→ 弹出「附着图片」对话框 → 点「关闭」。
- **预期**：对话框关闭。
- **实际**：仍打开（`innerText` 仍含「附着图片」「插入点」），无报错；按 Esc 才关闭。对照：同 ribbon「创建块」对话框「关闭」按钮有效——说明是**独立失效**，非全局问题。
- **证据**：按钮 `disabled:false` `76x28 vis:true`，真实 ref 点击 `@e14` 后仍 `STILL-OPEN`。
- **⚠️ 复核结论（2026-10-30）：引擎黑盒问题，非本仓可修**。**先查设计决策**——「附着图片」经 `insertImageCommand.ts:112` `MxFun.sendStringToExecute('_InsertImage', …)` 派发给**引擎原生**命令，对话框（含「关闭」「插入点」字段）由 **mxcad-app 引擎资产（vendor 黑盒）** 渲染，仓内**无 React 侧「附着图片」对话框组件**（`grep 附着图片 *.tsx` 仅命中反馈/富文本无关处）。「关闭」按钮失效点在引擎原生 UI 内部（`_InsertImage` 对话框），**不在我方代码**；对照「创建块」对话框有效说明是引擎个别对话框的接线问题。按 ADR-0084 + cad-engine-integration「引擎黑盒不改内部」，**不修**（需引擎厂商修或我方以 React 自绘对话框替换——后者为架构级改造，非本次 bug 范围）。

### [BUG-CAD-02] 新建图纸确认框无法用 Esc 取消，必须点「取消」按钮 — 中 · 反模式
- **复现**：标题栏「新建」→ 弹出确认框「确定新建图纸吗？当前未保存的更改将丢失。」→ 按 Esc。
- **预期**：模态框惯例 Esc=取消。
- **实际**：按 2 次 Esc 后确认框仍在；必须点「取消」才关闭。键盘用户无法取消。
- **⚠️ 复核结论（2026-10-30）：BY DESIGN（刻意设计），非缺陷**。**先查设计决策**——`newFileCommand.ts:41` 经 `globalShowConfirm` → `ConfirmDialog.tsx:30` **硬编码 `mustChoose`**（`Modal.tsx:103` `if (e.key==='Escape' && !mustChoose) onClose()` 才关；`mustChoose` 连 Esc、遮罩、右上角 × 一起挡）。`ConfirmDialog.tsx:7-10` 注释记录**设计理由**：「必须做选择……否则删除确认被误触关掉＝静默取消（危险），未保存更改确认被误触关掉＝用户没决策过就丢了改动」。**产品决策已确认保留该行为**（本会话先前裁定：CAD 内 Esc=取消绘图命令，确认/输入三弹框统一 `mustChoose`；用户明确「保留」）。新建图纸确认框**确属必须做选择**（确定/取消二选一，且新建为破坏性动作——覆盖当前图纸），Esc 拦截是**有意为之**。**不修**（改=违背已确认的产品决策；键盘用户诉求可另议，但非回归缺陷）。

### [BUG-CAD-03] 保存到云图无任何用户可见反馈，且疑似未落库 — 中 · 反模式
- **复现**：打开已有云端文件（A1.dwg）→ 输出 tab →「保存到云图」→ 触发「命令: Mx_Save | Mx_SaveToCloud」提示但**无成功/失败 toast**；DB A1.dwg `updatedAt` 保存前后无变化（仍 `2026-10-28 02:18:11`），最近 30 分钟无任何文件落库更新。再验证：新建未保存 new.dwg →「保存到云图」**无任何反馈**（无另存为弹窗、无 toast）。
- **注**：图纸无改动时保存可能为 no-op（无 DB 写），但「无任何反馈」本身即 UX 缺陷；新建未保存图纸保存应弹「另存为」而未弹，疑似逻辑缺失。DB 落库部分建议在**有改动的图纸**上复核。
- **⚠️ 复核结论（2026-10-30）：需真实引擎环境复核；本仓代码路径显示应弹另存为，但派发是否达 React 命令未实证**。**先查设计决策**——ADR-0081（保存意图链）、`saveCommand.ts`（Mx_Save）：`!fileInfo`（新建未保存无云端身份）→ `showSaveAsDialog`（L50，**应当弹另存为**）；有 fileInfo → `ctx.saveFile`。`saveToCloud.ts`（Mx_SaveToCloud）仅 `MxFun.sendStringToExecute('Mx_Save')`。**关键疑点**：`Mx_SaveToCloud` 在仓内**无任何 React 组件/引擎 ribbon 映射引用**（`grep Mx_SaveToCloud` 仅命中 intentChain/saveToCloud），即「保存到云图」是**引擎原生 ribbon 按钮**（mxcad-app 黑盒），其点击派发 `Mx_SaveToCloud` 是否经 React 命令注册表（`SaveToCloudCommand`）还是直走引擎原生 `Mx_Save`——**决定了新建图纸是否真的走 React `showSaveAsDialog`**。**待验证**：需在真实引擎环境对「**有改动**」的云端图纸点保存（确认落库 + toast）、对新建未保存图纸点保存（确认弹另存为）。**未改码**（无法在不带真实引擎的浏览器会话里可靠复现/验证，按「确保修复成功才开始下一个」原则不宣称修复）。

### [BUG-CAD-05] 打开文件过程中按 Esc 无法取消打开，文件仍加载完成 — 低 · 反模式
- **复现**：左侧文件列表点「A1」→ 立即按 Esc → 4 秒后标题仍更新为 `A1.dwg`（Esc 未取消异步加载）。
- **注**：文件加载为异步不可中断，属低严重度 UX 观察。
- **⚠️ 复核结论（2026-10-30）：引擎固有异步不可中断，非缺陷**。`mxcadOpenFlow.ts` `sendOpenWebFile` 的打开是**异步引擎命令**（`__openWebFile__`，ADR-0084 引擎命令），发出后不可从 UI 侧取消（引擎已接管加载）；Esc 本就不绑定「取消打开」语义（CAD 内 Esc=取消**绘图命令**，见 BUG-CAD-02 的 mustChoose 设计理由）。**不修**（与引擎命令机制/既有 Esc 语义一致；低严重度 UX 观察，报告自注「属低严重度」）。

### [BUG-CAD-06] 打开文件过程中快速连点两个文件，后点被忽略 — 低 · 反模式
- **复现**：快速连点「temp_empty」→「A1」（间隔 <1s）→ 5 秒后标题为 `temp_empty`（后点的 A1 被忽略，打开的是先点的）。
- **注**：可能属防并发加载的合理保护，但无任何提示说明被忽略。
- **⚠️ 复核结论（2026-10-30）：BY DESIGN（串行队列防并发引擎打开），非缺陷；仅「被排队无提示」是轻微 UX 瑕疵**。`mxcadInstanceManager.ts:407` `enqueueOpen` 是**串行队列**（`openTail` 链式：第二次 `openFile` 的 `previous` = 第一次的 promise，`.then` **排队**而非丢弃）。故快速连点 temp_empty→A1 时 **A1 并未被忽略，而是排在 temp_empty 之后**：temp_empty 打开需 ~4s（引擎加载），5s 时 A1 可能尚未开始/仍在加载——报告的「被忽略」是**未等到排队结果**的观察。串行队列是**有意的防并发引擎打开保护**（引擎同一时刻只能处理一次打开，ADR-0084 引擎命令状态机）。**结论**：非缺陷；「排队期间无提示」属轻微 UX 瑕疵，可另议（如打开时置 UI busy 态），非本次 bug。

### [BUG-CAD-07] 创建协同（未保存图纸）静默无反馈 — 低 · 反模式
- **复现**：`/cad-editor` 当前 new.dwg 未保存 → 点「创建协同」→ 无任何浮层/提示/console 错误（静默无操作）。
- **注**：完整协同流程需双用户 + 已保存文件，本次单用户未走通；「点击后无反馈」本身即 UX 缺陷。
- **⚠️ 复核结论（2026-10-30）：需真实引擎 + 双用户复核；「未保存图纸不能建协同」属设计约束，缺的是反馈而非功能**。**先查设计决策**——ADR-0084：创建协同必须走引擎命令 `__createCollabWork__`（`dispatchCreateWork` 唯一入口，禁裸调 `cooperate.createWork`）；协同创建要求**已保存的云端图纸**（未保存 new.dwg 无云端身份，无法建立协同会话）。「未保存图纸 → 创建协同无操作」是**设计约束**（无身份无协同），**不是功能 bug**；真正缺陷是**无任何用户反馈**（应提示「请先保存图纸再创建协同」）。**待验证**：需真实引擎环境在**已保存图纸**上走通创建协同（双用户）确认正常路径；未保存图纸的「无反馈」应在 `dispatchCreateWork`/协同入口补一条提示。**未改码**（补提示涉及协同命令层 + 需真实引擎验证正常路径未破坏，按「确保修复成功才开始下一个」原则不宣称修复）。

---

## 六、认证模块（2 项）

> 登录（密码/手机验证码/停用/未验证邮箱/无邮箱/双击/超长特殊字符）、注册（正常/密码不一致/用户名重复/不勾协议模态/下一步双击/返回/刷新）、忘记密码→重置（正常/不存在邮箱/确认不一致/弱密码/验证码错误/双击发送）、邮箱验证（正确/错误/过期/重发）均通过。仅以下问题。

### [BUG-AUTH-01] 注册页弱密码提交无明确错误提示（重置页同场景有提示，两页不一致）— 低
- **复现**：注册 Step2 新密码填 `123`（<6 位策略）→ 点「立即注册」→ 停留 Step2，无明确错误文案，仅强度条显示「较弱 · 至少 6 位」（强度提示，非错误提示）。对比 `/reset-password` 同场景明确提示「密码至少 6 个字符」。
- **证据**：DB 无该用户；两页行为不一致。
- **✅ 已修复（2026-10-29）**：`PasswordStep.tsx` 密码字段增加 `FieldErrorMessage` 渲染（`id="password-error"`）+ `aria-describedby` 关联（此前仅确认密码字段有错误文案渲染，密码字段只变红无文字）。**验证**：`Register.spec.tsx` 新增 1 例「弱密码提交显示明确错误提示」（`#password-error` 文案「密码至少 N 个字符」+ `aria-describedby="password-error"` + `aria-invalid=true` + 停留 Step2），8/8 全绿；`tsc --noEmit` 0。**真实浏览器测试**：注册 Step2 填弱密码 `123` 提交 → `#password-error` 显示「密码至少 6 个字符」+ `aria-invalid=true`（修复前仅强度条无文字错误）。

### [BUG-AUTH-02] 未注册手机号登录跳 `/register`，但注册页无手机号字段导致 prefill 丢失 — 低（依赖配置组合）
- **复现**：`/login` 手机登录 tab → 输入未入库手机号（如 13800001234）+ 正确码 → 点登录 → 后端 `PHONE_NOT_REGISTERED` → 前端 `navigate('/register', { state: { prefillPhone, prefillCode } })`。
- **实际**：跳 `/register`，但当前 `requirePhoneVerification=false` 时注册页**不渲染手机号字段**，prefillPhone/prefillCode 无处落地，用户看不到也不能用该手机号继续注册（信息丢失）。
- **证据**：`useLoginForm.ts` handlePhoneSubmit 确实 navigate('/register',{state:{prefillPhone,prefillCode}})；注册页 Step1 仅用户名/昵称。
- **✅ 已修复（2026-10-29）**：**先查设计决策**——手机号注册严格依赖 `requirePhoneVerification=true`（后端 `local-auth.provider.ts:746` 抛「手机号注册未启用」；注册页 `BasicInfoStep.tsx:183` `smsEnabled && requirePhoneVerification` 才渲染手机字段；登录页手机 tab 仅按 `smsEnabled` 显示，`Login/index.tsx:315`）。**根因**：`handlePhoneSubmit` 对 `PHONE_NOT_REGISTERED` 无条件 `navigate('/register')` 带 prefill，而 `requirePhoneVerification=false` 时注册页无手机字段，prefill 静默丢失且无任何说明。**修复（对齐设计决策）**：`useLoginForm.ts` 读取 `requirePhoneVerification`，`PHONE_NOT_REGISTERED` 时仅当手机号注册已启用才跳 `/register` 携带 prefill；否则就地展示后端文案，避免跳到无手机字段的注册页。**验证**：`useLoginForm.spec.ts` 新增 2 例（true 分支断言 `navigate('/register',{state:{prefillPhone,prefillCode}})`；false 分支断言不跳转 + `error` 显示「手机号未注册，请先注册」），Login 目录 25/25 全绿；`tsc --noEmit` 0。**真实浏览器测试**（需配置组合 smsEnabled=true + requirePhoneVerification=false + allowAutoRegisterOnPhoneLogin=false + smsProvider=mock + Redis 注入验证码）：`/login` 手机 tab 填未注册号 13800001234 + 码 123456 提交 → 后端返回 `PHONE_NOT_REGISTERED` → **URL 保持 `/login`**（修复前跳 `/register`），页面就地显示「手机号未注册，请先注册」。**清理**：配置还原（smsEnabled=false/smsProvider=aliyun）、Redis 验证码键删除、admin 密码还原 .env 一致值。

---

## 七、测试制品 / 未确认（明确排除或待复验，非产品缺陷）

| 条目 | 定性 | 依据 |
|---|---|---|
| **BUG-PROJ-02** 重复项目名返回 201 | **测试制品** | 源码 `createNode` L103 + `checkNameUniqueness`（项目无 parentId 时按 ownerId 匹配 `nodeType=PROJECT` 且 `deletedAt=null`）会抛 400「已存在同名项目」；**实测**（本报告复核）：运行后端返回 `400 "已存在同名项目，请使用其他名称"`。子代理 201 系其测试方式错误（如 owner 作用域不符）。 |
| **BUG-PROJ-06** 过期分享链接仍返回 200 | **测试制品** | 源码 `share.service.ts` `assertShareUsable`（L107-118）对 `expiresAt < now` 抛 404「分享链接已过期」；`resolveShare`(L134)/`resolveShareNode`(L187) 均走该校验；**运行 dist 同样含该校验**（dist L114-115）。子代理 200 系其 SQL 更新未生效（列名为 `expiresAt` 驼峰，若用 `expires_at` 则 no-op，分享从未真正过期）。 |
| **BUG-AUTH-03** 注册点「同意并继续」偶发崩溃（useAuth must be used within AuthProvider） | **低置信，需干净环境复验** | 偶发 1/2 次，console 报 `PlanSelectOverlay` useAuth 错误。App 内 AuthProvider 理论可用；高度疑似 dev HMR / React 渲染竞态瞬态（测试期间并发会话频繁 HMR）。生产需复验。 |
| **BUG-CAD-04** 空模板标题显示 `new.dwg` 而非「新图纸」 | **符合设计** | 本仓库历史修复（2026-10-27，记忆：`kind none/new 都设 new.dwg + settleInitial`）**刻意**将空模板标题设为 `new.dwg`（浏览器实测确认过）。子代理「应为 新图纸」是错误预期。 |
| **OBS-USER-04** `GET /notices/current` 间歇 500 | **未确认** | 同会话 3~4 次后自愈 200；测试期间并发 HMR 污染，稳定性待复核。 |
| **OBS-FS-06** 移动/复制目标选择器首开「暂无可用文件夹」 | **未确认** | 首次空、重开正常；受多会话 HMR 干扰，稳定性待复核。疑似 `roots/projectId` 未就绪竞态。 |

### 观察项（设计待确认，非必然缺陷）
- **[OBS-FS-05]** 个人空间 `/personal-space` 无「新建文件夹/上传」按钮 + 空态文案「项目中暂无文件」——可能设计为只读，但空态文案不贴合个人空间语义。
- **[OBS-USER-01]** 「升级方案」模态 backdrop 点击与 Esc 均不关闭，只能点右上 X。
- **[OBS-USER-02]** 空昵称保存：表单静默关闭、无校验/错误提示，DB 值未变（静默拒绝）。
- **[OBS-USER-03]** 修改昵称后不保存直接导航离开：无「未保存更改」确认，改动静默丢弃。

### 信息性（非缺陷）
- 普通用户**无 2FA/TOTP 启用/禁用 UI**（仅 `/admin/mfa` 管理员专用，普通用户访问 403）——任务项「2FA 分支」对普通用户不适用。
- 弱密码（123456）与「新密码=旧密码」被接受——由运行时配置（MinLength=6/MinCategories=0/WeakCheck=false/HistoryCheck=false）门控，符合当前部署配置。
- 头像上传合法图成功、错误类型/超大(>5MB)有明确提示；超长昵称 maxLength=50 截断；特殊字符昵称可保存——均正常。

---

## 八、测试环境备注（重要，影响结论置信度）

1. **并发 AI 会话正在修改本仓库**（git status 大量未提交改动：api-sdk/backend/frontend/App.tsx/prisma schema 等）。测试中段 **API SDK 被并发重生成后与前端短暂不同步**（`useFeedbackSubmit.ts` 导入的 `feedbackControllerCreate` 在 api-sdk 中瞬态缺失）→ Vite `SyntaxError` → `/login` 空白。**此为环境瞬态，非产品 bug**（生产 build 重新解析；SDK 现已同步）。
2. **运行后端为 10:25 启动、加载 11:48 构建的 dist**——晚于多数源码提交，但早于并发会话后续改动，故**运行后端与最新源码可能存在小差异**（本报告复核结论均以源码 HEAD + 关键项运行实测双重印证）。
3. **转换服务 3100 已探活**（返回 JSON），但导出 PDF/DWG/DXF 的 UI 按钮未在引擎工具条/菜单找到（命令注册于引擎 `mMenuBarData`，`hasDaochu:true` 但无「导出」文本；MxFun 不暴露 window 无法 JS 触发）——导出命令 UI 入口定位需人工补测。
4. 协同完整流程（创建/加入）需双用户 + 已保存图纸，本次单用户无法走通。
5. 所有临时用户（authu_/memu_/fsu_/pru_/cadu_/adu_/dupchk_ 等）已删除，被改运行时配置/IP 黑名单已恢复，浏览器会话已关闭，工作区未改代码。

---

## 九、给修复的优先级建议

1. **P0（安全/数据一致性）**：BUG-PROJ-05（未登录访问 /cad-editor 路由守卫缺失）、BUG-FS-02（已删文件经缓存可下载）、BUG-ADMIN-001（把自己锁死）、BUG-PROJ-01（无法连续创建项目）、BUG-PROJ-04（项目重命名不生效）。
2. **P1（功能阻断）**：BUG-USER-01（邮箱换绑 500 + 码孤儿化 + 错误分类）、BUG-USER-02（billing 未按 paymentEnabled 门控）、BUG-PROJ-03（项目名非法字符）、BUG-ADMIN-002（唯一约束字段名丢失）、BUG-ADMIN-003（空名静默）、BUG-FS-01（双击重复创建）。⚠️ 注：BUG-PROJ-07 复核为**功能缺失（产品范围决策）**——分享密码/权限级别从未实现，非回归缺陷，移出修复队列（需产品立项）；BUG-CAD-01 复核为**引擎黑盒（引擎原生 `_InsertImage` 对话框关闭失效，本仓不可修，需引擎厂商/自绘替换）**、BUG-CAD-02 复核为**BY DESIGN（mustChoose 刻意拦截 Esc，产品已确认保留）**、BUG-CAD-03 复核为**需真实引擎环境验证**（Mx_SaveToCloud 为引擎原生 ribbon 按钮，是否达 React SaveCommand 未实证），三者移出本批次可修队列。
3. **P2（体验/文案）**：BUG-FS-03/04、BUG-AUTH-01/02、BUG-ADMIN-004。⚠️ 注：BUG-PROJ-08 复核为**非产品缺陷（测试制品，分享链接编码正确）**，已移出修复队列；BUG-CAD-05 复核为**引擎固有异步不可中断**、BUG-CAD-06 复核为**BY DESIGN（enqueueOpen 串行队列防并发，后点系排队非忽略）**、BUG-CAD-07 复核为**需真实引擎+双用户验证**（未保存建协同=设计约束，缺的是反馈提示），三者移出本批次可修队列。
