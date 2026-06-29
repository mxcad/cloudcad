# CloudCAD 全仓库优化重构 TODO List

> 最后更新: 2026-06-29

---

## 目录
- [CloudCAD 全仓库优化重构 TODO List](#cloudcad-全仓库优化重构-todo-list)
  - [目录](#目录)
  - [1. 根 / 基础设施](#1-根--基础设施)
    - [🔴 P0 — 安全 / 阻塞](#-p0--安全--阻塞)
    - [🟠 P1 — 高优先级](#-p1--高优先级)
    - [🟡 P2 — 中优先级](#-p2--中优先级)
    - [🟢 P3 — 低优先级](#-p3--低优先级)
  - [2. Frontend — packages/frontend](#2-frontend--packagesfrontend)
    - [🔴 P0 — 阻塞](#-p0--阻塞)
    - [🟠 P1 — 高优先级](#-p1--高优先级-1)
    - [🟡 P2 — 中优先级](#-p2--中优先级-1)
    - [🟢 P3 — 低优先级](#-p3--低优先级-1)
  - [3. Frontend Mobile — packages/frontend\_mobile](#3-frontend-mobile--packagesfrontend_mobile)
    - [🔴 P0 — 阻塞](#-p0--阻塞-1)
    - [🟠 P1 — 高优先级](#-p1--高优先级-2)
    - [🟡 P2 — 中优先级](#-p2--中优先级-2)
    - [🟢 P3 — 低优先级](#-p3--低优先级-2)
  - [4. Backend — packages/backend](#4-backend--packagesbackend)
    - [🔴 P0 — 阻塞](#-p0--阻塞-2)
    - [🟠 P1 — 高优先级](#-p1--高优先级-3)
    - [🟡 P2 — 中优先级](#-p2--中优先级-3)
    - [🟢 P3 — 低优先级](#-p3--低优先级-3)
  - [5. Config Service — packages/config-service](#5-config-service--packagesconfig-service)
    - [🔴 P0 — 阻塞](#-p0--阻塞-3)
    - [🟠 P1 — 高优先级](#-p1--高优先级-4)
    - [🟡 P2 — 中优先级](#-p2--中优先级-4)
    - [🟢 P3 — 低优先级](#-p3--低优先级-4)
  - [6. mxVersionTool — packages/mxVersionTool](#6-mxversiontool--packagesmxversiontool)
    - [🔴 P0 — 阻塞](#-p0--阻塞-4)
    - [🟠 P1 — 高优先级](#-p1--高优先级-5)
    - [🟡 P2 — 中优先级](#-p2--中优先级-5)
    - [🟢 P3 — 低优先级](#-p3--低优先级-5)
  - [执行批次总览](#执行批次总览)

---

## 1. 根 / 基础设施

### 🔴 P0 — 安全 / 阻塞

- [x] **`temp/` 中被 git 跟踪的 1571 个文件（含 71MB node.exe）** — 添加 `temp/` 到 `.gitignore`，清理 git 历史
- [x] **`uploads/` 中被 git 跟踪的 DWG 文件（33MB+）** — 添加 `uploads/` 到 `.gitignore`
- [x] **`packages/mxcadassembly/` 中被 git 跟踪的 56MB 二进制文件** — 添加 `.gitignore` 规则
- [x] **QWEN_API_KEY 泄露** — `.claude/settings.local.json:64-67` → 轮换密钥，`.claude/` 加入 `.gitignore`
- [ ] **QQ 邮箱 SMTP 密码泄露** — `docker/.env:82-83`
- [ ] **微信支付密钥泄露** — `packages/backend/.env:459-462`
- [ ] **JWT_SECRET / SESSION_SECRET 泄露** — `docker/.env:38`, `packages/backend/.env:97`
- [x] **CI 数据库名拼写错误 `cloucad`** — `.github/workflows/ci.yml:23`, `test.yml:23` → 改为 `cloudcad`
- [x] **CI pnpm 版本 9.15.4 与根 package.json 要求的 9.15.9 不匹配** — 两个 workflow 文件
- [ ] **`ci.yml` 与 `test.yml` 重叠运行** — 合并为单一 workflow 或调整触发条件
- [ ] **CI 不运行前端测试** — `ci.yml` 中只有 `type-check`，缺少 `pnpm test`
- [ ] **Dockerfile 容器以 root 运行** — 从未设置 `USER` 指令，违反最小权限原则
- [ ] **Dockerfile 数据目录权限过大** — `chmod -R 755 /app/data`（全局可读），应仅为 700
- [x] **`batch-import-library.js:8` 硬编码管理员密码 `'Admin123!'`** — 源代码中明文凭据
- [x] **`.npmrc` 缺少 `registry=` 和 `strict-ssl=true`** — 无安全锁定
- [x] **`scripts/` 中 `autotest.bat:10` 硬编码仓库路径** — `D:\project\cloudcad` 与工作目录不符

### 🟠 P1 — 高优先级

- [x] **`CLAUDE.md:29` 端口号写 5173 但实际是 3000** — 统一为 3000
- [x] **`README.md` 端口号也写 5173** — 同样需要修正
- [x] **`AGENTS.md` 与 `CLAUDE.md` 端口号不一致** — 统一为 3000
- [x] **`CONTEXT.md:243` i18n 描述错误** — 说"暂无基础设施"但 VoerkaI18n 已完全集成
- [x] **`CLAUDE.md:33` 列出包时遗漏 `frontend_mobile`**
- [ ] **`README.md` 损坏的图片引用** — 指向不存在的 `documents/user-guide/imgs/`
- [ ] **根 `tsconfig.json` 开启 `strict: true` 但后端故意是宽松类型** — 需确认覆盖是否正确
- [x] **根 `package.json` 中 `check` 脚本使用 `;` 而非 `&&`** — `lint` 失败后仍继续执行
- [ ] **ESLint `custom-rules/no-prisma-enum-in-api-property` 被注释掉** — 重要架构约束未生效
- [ ] **`.prettierrc` 设置 `endOfLine: "lf"`** — 在 Windows 上可能导致 git 行尾问题
- [ ] **Dockerfile 中 pnpm 硬编码 9.15.4** — 与要求的不一致
- [ ] **Docker entrypoint 使用 `prisma db push --accept-data-loss`** — 生产环境可能产生破坏
- [ ] **nginx 配置缺少 `Content-Security-Policy` 头部**
- [ ] **nginx 配置仅 HTTP 无 HTTPS** — 所有流量明文传输
- [x] **Docker entrypoint `nginx -t 2>/dev/null` 语法错误** — 抑制了 test 输出而非 stdout
- [ ] **无 Husky / git hooks** — 无 pre-commit 验证，开发人员可能提交无效代码
- [x] **Docker entrypoint `svnadmin create` / `svn switch` 错误被 `2>/dev/null` 抑制** — 静默吞错误
- [ ] **Docker entrypoint background 协同进程可能变孤儿** — `exec` 替换 shell 后无法管理

### 🟡 P2 — 中优先级

- [ ] **`check` 脚本运行顺序** — `lint` → `format:check` → `type-check`，当前用 `;` 忽略失败
- [ ] **`.eslintrc.js` 中后端规则几乎完全禁用了所有 TS 规则** — ESLint 对后端代码几乎无约束
- [ ] **忽略模式列表冗长且存在重叠** — `.eslintrc.js:129` 有 29 个 ignorePatterns
- [ ] **`pnpm-workspace.yaml` 极简（2 行）** — 缺少对 `packages/config-service` 的显式声明
- [ ] **`vitest.workspace.ts` 不存在** — 无法跨包协调测试
- [ ] **`config-service/AGENTS.md` 与代码不符** — 描述 NestJS/TypeScript 结构但实际是纯 JS
- [ ] **打包脚本代码重复（~150 行）** — `pack-docker.js`(448 行) / `pack-offline.js`(1217 行) / `pack-linux-deploy.js`(439 行) 间大量重复，应提取 `scripts/shared/pack-utils.js`
- [ ] **`pack-linux-deploy.js` 与 `verify-linux-deploy.js` 中 `OS_BASE_IMAGES` 映射重复** — 需保持同步
- [ ] **`extract-linux-runtime.js` 大量硬编码路径** — Node.js/PG 版本、系统库路径等
- [x] **`scripts/` 中 `generate-frontend-permissions.js` 用 ESM 而其他脚本用 CJS** — 不一致
- [ ] **`autotest.bat:25` 硬编码分支名 `refactor/circular-deps`** — 功能分支不应硬编码
- [ ] **Docker compose 中 `INITIAL_ADMIN_PASSWORD` 默认值 `Admin123!`** — 安全风险

### 🟢 P3 — 低优先级

- [ ] **`docker/.env` 与 `docker/.env.example` 配置漂移** — 行数和键不一致

---

## 2. Frontend — packages/frontend

### 🔴 P0 — 阻塞

- [x] **TypeScript 编译报错：`SvnLogEntryDto` 不存在（应为 `MxLogEntryDto`）** — `VersionHistoryDropdown.tsx:8`, `VersionHistoryModal.tsx:4`
- [x] **`vite.config.ts:26` 在 ESM 上下文使用 `require('fs')`** — 构建时可能崩溃
- [x] **`mxcadSave.ts:1` 未使用的导入 `saveControllerSaveMxwebToNode`** — 函数体内使用的是 `fetch`

### 🟠 P1 — 高优先级

- [ ] **`mxcadManager/index.ts` (2484 行) 拆分**：
  - [ ] `containerManager.ts` — MxCADContainerManager 类
  - [ ] `instanceManager.ts` — MxCADInstanceManager 类
  - [ ] `manager.ts` — MxCADManager 核心类
  - [ ] `commands/` — 各 CAD 命令独立文件
  - [ ] `file-operations.ts` — 打开/保存/导出逻辑
  - [ ] `collaboration.ts` — 协同逻辑
- [ ] **模块级变量迁移到 Zustand Store**（违反单一数据源原则）：
  - [ ] `documentModified` → `useCADEditorStore`
  - [ ] `pendingImages` → `useCADEditorStore`
  - [ ] `cachedPersonalSpaceId` → 删除，改用 React Query
  - [ ] `navigateFunction` → 改为事件驱动或 React Context
  - [ ] `isLeavingPageRef` → `useCADEditorStore`
  - [ ] `loadingRefCount` / `loadingSource` → `useUIStore`
  - [ ] `cachedBrandConfig` → RuntimeConfigContext 或 React Query
- [ ] **`CADEditorDirect.tsx` (1647 行) 拆分**：
  - [ ] 导出模态框逻辑抽成独立组件
  - [ ] 初始化逻辑抽成自定义 hook
  - [ ] 7 个导出格式逻辑合并
- [ ] **`CollaborateSidebar.tsx` (928 行) 拆分**：
  - [ ] auto-join 逻辑抽成 hook
  - [ ] 三个过滤列表抽成子组件
- [ ] **硬编码中文未走 i18n `t()`**：
  - [ ] `mxcadManager/index.ts:1087` — `"不支持的文件格式"`
  - [ ] `mxcadManager/index.ts` + `CADEditorDirect.tsx` + `CollaborateSidebar.tsx` 中所有硬编码字符串
- [ ] **合并 `styles/theme.css` (915 行) 与 `styles/app.css` (961 行)** — 消除重复主题变量
- [ ] **消除两处重复的 `@keyframes` 动画定义** — `theme.css:663-727` 与 `app.css:143-207`
- [ ] **`app.css` 中硬编码 `rgba(255,255,255,0.8)` 等值** — 应使用 CSS 变量
- [ ] **`mxcadManager/index.ts:1953` 硬编码 `z-index: -1`** — 应使用 `Z_LAYERS` 常量
- [ ] **仅 1 个根级 `<ErrorBoundary>`，无页面级边界** — CADEditorDirect、Profile、FontLibrary 等复杂页面无独立错误边界
- [ ] **竞态条件：多处 useEffect 无 AbortController**：
  - [ ] `CADEditorDirect.tsx:235-260` — 多个异步操作无中止信号
  - [ ] `Profile.tsx:79-86` — 会员数据提取无 AbortController
  - [ ] `useFileSystemChildren.ts:53-89` — 快速导航时可能 setState 到已卸载组件
- [x] **`mxcadManager/index.ts:159` `beforeunload` 事件监听器从不清理** — 未调用 `removeEventListener`
- [ ] **`Profile.tsx:895` `setTimeout` 在 `logout` 中的定时器未在卸载时清除**
- [ ] **`ProfileMembershipTab.tsx:134` `setInterval(loadBillingData, 30000)` 轮询无清除** — 组件卸载后仍运行
- [ ] **`BreadcrumbNavigation.tsx:52` `setTimeout(() => {...}, 5000)` 未保存 ref 也不清理**
- [ ] **`CollaborateSidebar.tsx:125` setTimeout 保存为局部变量** — 快速重入可能泄漏

### 🟡 P2 — 中优先级

- [ ] **Zustand Store 选择器优化** — 所有组件直接解构整个 store（如 `CollaborateSidebar.tsx:79` 一行解构 15 个字段）→ 改为 `useStore(selector)`
- [ ] **`notificationStore.ts` 与 `uiStore.ts` 功能重叠** — 两个机制都显示 toast/通知
- [ ] **`useFileSystemStore.refresh` 空函数** — `fileSystemStore.ts:122` 从未实现
- [ ] **重复逻辑抽取**：
  - [ ] `saveToCurrentFile()` 与 `saveLibraryFile()` 合并
  - [ ] `openLibraryDrawing()` 与 `openLibraryBlock()` 合并
  - [ ] `Mx_ExportPDF` / `Mx_ExportDWG` / `Mx_ExportDXF` 合并
- [ ] **`FileItem.tsx:42-129` 深度 prop drilling（40+ props）** — 应整合到 `FileItemConfig` Context 或单一 `PermissionMap`
- [ ] **`Profile.tsx:103-150` 手动表单 state 无 react-hook-form** — 密码/邮箱/手机表单无验证框架
- [ ] **`FontLibrary.tsx:283` render 中 `new Set(fonts.map(f => f.name))` 无 useMemo**
- [ ] **`useFileItemProps.ts:103` `useMemo` 返回 `Map`** — 每次创建新 Map 引用，破坏 memo 目的
- [ ] **`TourStartModal.tsx:100` 使用 `key={index}`** — 静态列表可接受但应使用稳定 ID
- [ ] **`ExternalReferenceModal.tsx:216` 使用 `key={index}`**
- [ ] **内联 `style={}` 共 19 处** — `ViewToggle`(4), `MultiSelectBar`(6), `EmptyContextMenu`(3), `FileListGrid`(2) 等
- [ ] **`ResourceList.tsx:152` 子组件 `CascadeCategorySelector` 定义在父组件内部** — 每次渲染重建函数组件
- [ ] **`Dashboard.tsx:312-315` 过度获取** — 获取全量数据但只用 `slice(0,5)`
- [ ] **缺失 Loading/Empty/Error 状态**：
  - [ ] `LoginPrompt` — 无 loading 状态 UI
  - [ ] `FileItem.tsx:193` — node 为 null 时静默返回 null 无错误 UI
  - [ ] `SelectFileModal` — `treeLoading` 无超时 fallback
- [ ] **测试修复**：
  - [ ] `TourStartModal.spec.tsx` — variant 从 `ghost` 改 `secondary` 未同步测试（18 个失败）
  - [ ] `useFileSystemCRUD.spec.ts` — 缺少 `QueryClientProvider`
  - [ ] `UserManagement.spec.tsx` — ResizeObserver mock 非构造函数（7 个失败）
  - [ ] `mxcadSave.spec.ts` — SDK mock 不完整（5 个失败）
  - [ ] `mxcadCheck.spec.ts` — `setTimeout` 测试超时（4 个失败）
  - [ ] `useUserCRUD.spec.ts` — MSW handler 未命中（5 个失败）
  - [ ] `mxcadThumbnail.spec.ts` — FormData 实例检查失败
  - [ ] `test/setup.ts` 中 `@ts-nocheck` — 绕过类型检查
  - [ ] 5 个测试文件使用 `@ts-nocheck` — 完全绕过类型检查
- [ ] **依赖清理**：
  - [ ] 删除未使用：`recharts`, `webuploader`, `openapi-client-axios`, `cross-env`
  - [ ] 移除 `jsdom`（仅用 `happy-dom`）
  - [ ] 升级依赖：eslint 8→10, vite 6→8, `@hey-api/client-fetch` 已弃用
  - [ ] 修复 24 个高级 npm 安全漏洞
- [ ] **`appConfig.ts:82` 与 `fileSystemStore.ts:73` 默认 pageSize 冲突**（20 vs 30）
- [x] **`mxcadManager/index.ts:1118` 参数名 `ages` 应为 `args`** — 拼写错误
- [ ] **魔数散落** — 需抽取为命名常量：
  - [ ] `5000` brand config timeout (`index.tsx:55`)
  - [ ] `30000` queryClient staleTime (`index.tsx:33`)
  - [ ] `30000` fetchWorks timeout (`CollaborateSidebar.tsx:127`)
  - [ ] `15000` auto-join safety timeout (`CollaborateSidebar.tsx:386`)
  - [ ] `8000` poll interval (`CollaborateSidebar.tsx:313`)
  - [ ] `10000` ResourceList loading timeout (`ResourceList.tsx:602`)

### 🟢 P3 — 低优先级

- [ ] **仅 3 处 `React.memo`** — 大型列表页面（用户管理、文件系统）需补充
- [ ] **调试日志**：`CADEditorDirect.tsx:394`、`CollaborateSidebar.tsx:407` 的 `console.log`
- [x] ~~**`CollaborateSidebar.module.css` 导入但文件不存在** — `CollaborateSidebar.tsx:47`~~（文件实际存在且被 4 个组件使用，TODO 记录有误）
- [ ] **后端 API 调用直接使用 `fetch` 而非 SDK** — `mxcadManager/index.ts` 中 `/api/v1/mxcad/savemxweb/` 多处
- [ ] **`useMxCadEditor.ts` 中注释掉的 serverConfig 代码** — 第 43-83 行可能已废弃
- [ ] **`@ts-ignore` / `@ts-expect-error` 共 8 处** — 尤其业务代码（非测试文件）中的应修复
- [ ] **导入路径不一致** — 混用 `@/` 别名和 `../../` 相对路径
- [ ] **Hook 导出/返回值不一致** — `export function` vs `export const` 混用，返回值形状各异
- [ ] **`app.css` 中可能未使用的 CSS 类** — `.loader`、`@keyframes skeleton-loading` 等
- [ ] **`Profile.css` 中可能未使用的样式** — `.benefits`、`.status-icon.success` 等
- [ ] **缺失 ARIA 属性** — Modal 无 `role="dialog"`、Toast 无 `role="alert"`、图标按钮无 `aria-label`

---

## 3. Frontend Mobile — packages/frontend_mobile

### 🔴 P0 — 阻塞

- [x] **`src/plugins/axios/` 整个插件是死代码** — 项目使用 hey-api SDK 而非 axios
  - [x] **`appPostApi.ts:37` 硬编码安全 token `"yjd0VY6sWG6B4pLuQ5eZ5Q=="`** — 明文凭据，应立即移除
- [x] **`vite.config.ts:28` 使用已弃用的 `reactivityTransform: true`** — Vue 3.5 将移除

### 🟠 P1 — 高优先级

- [ ] **`index.vue` (1039 行) 拆分**：
  - [ ] `useAutoJoinSetup.ts` — 协同自动加入逻辑
  - [ ] `useFileOpenSetup.ts` — 文件打开逻辑
  - [ ] 将 417 行 `<style>` 移到独立 `.scss` 文件
- [ ] **硬编码中文未走 i18n `t()`**：
  - [ ] `index.vue` — 30+ 处（"未保存的更改"、"协同中"、"公开文件不支持保存"等）
  - [ ] `CooperatePopup.vue` — 20+ 处（"未知图纸"、"分享"、"退出"等）
  - [ ] `SaveAsSheet.vue` — 20+ 处（"我的图纸"、"请输入文件名"等）
  - [ ] `WorkCard.vue` — 5 处（"暂无参与者"、"分享"等）
  - [ ] `CollabShareModal.vue` — 5 处（"链接已复制"等）
  - [ ] `VersionHistoryPopup.vue` — 2 处
  - [ ] `ShareLanding.vue` — 10+ 处
- [ ] **模块级 ref 应进 Pinia 或统一管理**：
  - [ ] `useSave.ts:22` — `saving` 在 composable 外声明为模块级
  - [ ] `useFileLoader.ts:32-34` — `loading/error/progress`
  - [ ] `useVersionHistory.ts:14-16` — `loading/entries/error`
  - [ ] `useUser.ts:55-56` — `user/isAuthenticated`
  - [ ] `pendingImageService.ts:9` — `pendingImages` 模块级数组
  - [ ] `permissionService.ts:21` — `permissionCache` 模块级 Map
- [ ] **命令文件大量重复逻辑**：
  - [ ] `m_mx_trim.ts` 与 `m_mx_extend.ts` 重复 ~25 行窗交/栏选/撤销处理逻辑
  - [ ] `m_mx_fillet.ts`(1707 行) 与 `m_mx_chamfer.ts`(1199 行) 重复 ~400 行几何计算逻辑
  - [ ] `m_mx_copy/move/rotate/mirror` 中包围盒绘制模式重复
- [x] **`src/plugins/mxcad/command/CommandManager.ts` (149 行) 死代码** — 从未被任何文件导入
- [ ] **零测试覆盖** — 整个 mobile 包无任何测试文件或测试基础设施
- [ ] **`useUser.ts:64-66` 事件监听器泄漏** — `onMounted` 中的 `storage` 监听器无 `onBeforeUnmount` 清理
- [ ] **`m_mx_polyline.ts:73-74,923` keydown 事件监听器可能泄漏** — `return` 分支未调用 `removeEventListener`

### 🟡 P2 — 中优先级

- [ ] **重复 URL 构建逻辑（4 个文件）**：
  - [ ] `fileService.ts:16-28` / `useFileLoader.ts:111-136` / `publicFileService.ts:47-57` / `shareFileLoad.ts:30`
- [ ] **`getApiBaseOrigin()` 重复（4 处）** — `apiConfig.ts:77-79`, `saveService.ts:57-58`, `fileService.ts:20-23`, `publicFileService.ts:50-53`
- [ ] **API 错误处理模式不一致（4 种策略）**：
  - [ ] `saveService` / `fileService` — 抛出错误
  - [ ] `extRefService` / `thumbnailService` / `mxwebCacheService` — 静默 null
  - [ ] `checkService` / `permissionService` — 降级默认值
  - [ ] `mobileUploadService` — 用户可见 toast
- [ ] **导出选项对话框重复** — `showDwgOptionsDialog` 与 `showPdfOptionsDialog` 几乎相同
- [ ] **令牌过期检查重复** — `useSave.ts:31-41` 与 `useMenu.ts:12-22`
- [ ] **库权限检查重复** — `useSave.ts:43-59` 与 `permissionService.ts:94-99`
- [ ] **死代码**：
  - [ ] `AvatarGroup.vue` — 从未被使用
  - [ ] `exportService.ts` 中 `showExportDialog()` / `showExportMenu()` — 未被引用
  - [ ] `index.vue:15` 中 `import { drawArc }` — 未在文件中使用
- [x] `main.scss:64-119` 注释掉的 `.van-dialog` 样式（~55 行）
- [x] `main.scss:1-12` 空的 `@media` 查询块
- [ ] **类型安全**：
  - [ ] `m_mx_polyline.ts` 中 `any` 严重滥用（16+ 处 `data: any` / `nextData: any`）
  - [ ] 6 处 `as any` 强制类型转换
  - [ ] `saveService.ts` / `mobileUploadService.ts` 多处 `as unknown as`
- [ ] **统一 `@/` 路径别名** — 当前混用 `@/` 和相对路径
- [ ] **`import.meta.globEager` 替换** — `plugins/globalComponents/index.ts:5`，Vite 4 已弃用
- [ ] **`m_mx_fillet.ts:849` 与 `m_mx_chamfer.ts:37` localStorage key 命名不一致** — `Mx_Fillet_radius` vs `mx_chamfer_dist`
- [ ] **`stores/collab.ts:53-58` `startCadCheck` 的 `setInterval` 需手动 `stopCadCheck`** — 可能泄漏
- [ ] **`useFileLoader.ts` (490 行)** — 可拆分为 `useUrlResolver`、`useNodeLoader`、`useFileOpener`、`useExtRefChecker`
- [ ] **`m_mx_find_text.tsx` 命令中包含完整 Vue 浮层面板 UI** — UI 逻辑应分离

### 🟢 P3 — 低优先级

- [ ] **`hooks/` 与 `composables/` 职责边界模糊** — 两个目录都是 Vue 组合式逻辑
- [ ] **协同状态分散在 3 处** — `stores/collab.ts` + `stores/editor.ts` + `composables/useCooperate.ts`
- [ ] **`CooperatePopup.vue` 用 `setInterval(fetchWorks, 8000)` 轮询** — 而非事件驱动
- [ ] **`index.vue` 中 30+ 硬编码颜色值** — 应使用 `tokens.scss` CSS 变量
- [ ] **`ShareLanding.vue` 样式风格不一致** — 完全未使用 CSS 变量
- [ ] **`variables.scss:2,9` 在 `:root` 和 `body` 上重复设置 `touch-action: none`**
- [ ] **`FloatingPopup.vue` 硬编码 z-index** — 应使用统一常量
- [ ] **`usePopup.ts` 仅 15 行** — 可能不值得独立成 composable
- [ ] **`useEditorState.ts` 仅是 `useEditorStore()` 的冗余封装器**
- [ ] **`paramsFromUrl.ts` 与 `useUrlParams.ts` 功能重叠**
- [ ] **`main.ts:55` 中 `i18nPlugin as any`** — 应添加类型定义
- [ ] **协作类型定义 `useCooperate.ts:8-50` 应移至 `src/types/collaboration.ts`** — 与 PC 前端对齐

---

## 4. Backend — packages/backend

### 🔴 P0 — 阻塞

- [ ] **`mxcad.controller.ts` (2041 行) 拆分** — 按职责拆分为 Upload/Conversion/ExtRef/FileAccess Controller
- [ ] **Billing controller 使用 `req: any`** — 应使用 `AuthenticatedRequest` 类型
- [ ] **`auth.controller.ts:759` 硬编码 `'http://localhost:3000'`** — 应使用 `ConfigService`
- [ ] **`public-file.controller.ts:53-71` 文件路径遍历风险** — 手动黑名单校验，应用 `path.resolve` + 前缀检查
- [ ] **N+1 递归树查询**：
  - [ ] `file-tree.service.ts:890-906` `getAllProjectNodeIds()` — 递归遍历每层发一次 `findMany`
  - [ ] `file-tree.service.ts:1082-1106` `collectFileIds()` — 同上递归逐层
  - [ ] `file-tree.service.ts:1009-1024` `resolvePath()` — 路径每段一次查询
  - [ ] `file-tree.service.ts:651-674` `getProjectId()` — 递归爬父链每层一次 DB 往返
- [ ] **缺失事务的多步操作**：
  - [ ] `users.service.ts:1042-1049` `changePassword()` — update password 与 delete refreshToken 不在同一事务
  - [ ] `users.service.ts:710-715` `deleteImmediately()` — cleanupUser 与 user.delete 不在事务中
  - [ ] `users.service.ts:852-867` `deactivate()` — update deletedAt 与 delete refreshToken 不在事务中
  - [ ] `billing.service.ts:310-363` `refund()` — 手动回滚模式存在竞态条件
  - [ ] `runtime-config.service.ts:182-213` `set()` — upsert + 审计日志 + redis.del 不在事务中
- [ ] **用户事件发出但无人消费** — `users.service.ts` 发射 `user.created`/`restored`/`deactivated`，但全项目无任何 `@OnEvent` 监听器

### 🟠 P1 — 高优先级

- [ ] **巨型 service 拆分**：
  - [ ] `file-operations.service.ts` (1550 行) — 按 Copy/Move/Rename/Batch 拆分
  - [ ] `file-system.controller.ts` (1242 行) — 46 个端点需拆分为多个 controller
  - [ ] `users.service.ts` (1109 行) — 用户 CRUD + 搜索 + 注销 all-in-one
  - [ ] `auth.controller.ts` (920 行) — 34 个端点，需拆分为多个 controller
- [ ] **`users.controller.ts:170-237` — controller 直接操作数据库** — 应移到 service 层
- [ ] **重复逻辑抽取**：
  - [ ] 文件名去重逻辑（3+ 处） → `FileNameService`
  - [ ] 文件哈希计算（3 处） → `HashUtil.computeMD5`
  - [ ] `validateFileName` — `public-file.controller.ts` 与 `mxcad.controller.ts` 重复
  - [ ] 分片上传验证逻辑 — `file-merge.service.ts` 与 `file-conversion-upload.service.ts` 重复
- [ ] **Controller 使用 `@Res()` 直接处理响应（13+ 处）** — 绕过 NestJS 拦截器管道
- [ ] **`as any` 类型断言** — 尤其是 `FileStatus.PROCESSING/COMPLETED/FAILED as any`（10+ 处）
- [ ] **内存泄漏**：
  - [ ] `l1-cache.provider.ts:42-44` `setInterval` 未实现 `OnModuleDestroy` — 热重载时堆积
  - [ ] `l2-cache.provider.ts:55-69` Redis 事件监听器在 `onModuleDestroy` 中未显式移除
- [ ] **Admin 端点缺失 `ValidationPipe`** — `billing.controller.ts:121-137` `updatePlan`/`deactivatePlan`/`refund` 无校验
- [ ] **Version Control 端点使用原始 `@Query('projectId')`** — 无 DTO、无校验、无类型转换
- [ ] **错误传播不当**：
  - [ ] `mx-version-control.provider.ts:323-332` `isFirstCommit` 吞所有异常返回 `true`
  - [ ] `file-tree.service.ts:442-447` 搜索失败静默降级 LIKE，无法区分错误类型
  - [ ] `billing.service.ts:290-292` `refreshOrder` 查单失败只记 warn
  - [ ] `runtime-config.service.ts:305` `catch { return value; }` 空 catch 块
- [ ] **`clearNodeCache` 逐个清除缓存** — `file-permission.service.ts:342-365` 先查成员再逐个 `await clearUserCache`

### 🟡 P2 — 中优先级

- [ ] **Prisma 缺失索引**：
  - [ ] `FileSystemNode[ownerId, deletedAt]`
  - [ ] `FileSystemNode[name, parentId]`
  - [ ] `FileSystemNode[parentId, deletedAt, isFolder]`
  - [ ] `User[roleId]`
  - [ ] `User[email, deletedAt]`
  - [ ] `User[phone, deletedAt]`
  - [ ] `AuditLog[createdAt, action]`
  - [ ] `PaymentOrder[userId, status]`
  - [ ] `RefreshToken[userId, expiresAt]`
- [ ] **Prisma 级联删除缺失**：
  - [ ] `FileShare.creator`
  - [ ] `PaymentOrder.user`
  - [ ] `UserMembership.user`
- [ ] **关联关系问题**：
  - [ ] `UploadSession.status` 为 `String` 而非枚举
  - [ ] `Asset.category` 为 `String` 而非枚举或引用表
  - [ ] `ProjectRole.projectId` 声明为 `String?`（可选但应必填）
- [ ] **测试覆盖率过低** — spec/non-spec 比例 11.8%（行业标准 30-50%）
  - [ ] `file-system/` — 15 个源文件，几乎无 spec
  - [ ] `mxcad/` — 20+ 源文件，无 spec
  - [ ] `billing/` — 12 个源文件，无 spec
  - [ ] `storage/` — 6 个源文件，无 spec
  - [ ] `cache-architecture/` — 12+ 源文件，无 spec
  - [ ] `mx-version-control.provider.ts` (849 行) 无对应 spec 文件
- [ ] **全局 API 响应格式不一致** — 部分返回 `Dto`，部分返回 `{ success: true }`
- [ ] **Swagger 文档 coverage 不一致** — auth: 完整、billing: 最小、public-file: 无
- [ ] **静默吞异常** — `auth.controller.ts:770` 微信回调 catch 块仅 log 不处理
- [ ] **`mxcad.controller.ts:96-97` 无限制内存缓存** — `preloadingDataCache` Map 可能内存泄漏
- [ ] **`getChildren()` findMany 无 select 限制** — 返回 20+ 字段，列表 API 浪费
- [ ] **`getTrashItems()` 全列返回** — 同上
- [ ] **`l3-cache.provider.ts:408-410` `getMemoryUsage` 全表扫描** — 大量缓存条目时影响 DB 性能
- [ ] **`l2-cache.provider.ts:45-53` 创建独立 Redis 连接** — 而非共享 `@InjectRedis()` 实例
- [ ] **`multi-level-cache.service.ts:238-245` `getMany` 顺序 `for` 循环 L1 获取** — 而非 `Promise.all`
- [ ] **版本控制 7 处重复"MX 未初始化"守卫模式** — `mx-version-control.provider.ts` 各方法重复相同检查
- [ ] **`mx-version-control.provider.ts:611-677` 基于正则的 XML 解析** — 对嵌套/CDATA 脆弱，应使用专用解析器
- [ ] **`mx-version-control.provider.ts:814-816` 方法内 `require('child_process')`** — 应文件顶部静态导入
- [ ] **`billing.refund()` 方法脆弱** — 手动乐观锁 + 网关重试 + 手动回滚，服务器崩溃时状态不一致
- [ ] **`billing.refreshOrder()` 职责过多** — 处理 4 种网关状态 + 嵌套条件 + 事务 + 循环
- [ ] **异步方法中同步阻塞** — 多处 `fs.existsSync` / `readFileSync` 在 async 方法中阻塞事件循环：
  - [ ] `mx-version-control.provider.ts` — 5 处
  - [ ] `mxcad.core/mxcad.service.ts` — 4 处
  - [ ] `mxcad.core/mxcad.controller.ts` — 3 处
  - [ ] `public-file.service.ts` — 4 处
- [ ] **未 catch 的 Promise 链** — `mx-version-control.provider.ts:117` `.then(() => {...})` 无 `.catch`
- [ ] **`file-permission.service.ts:300,332` `clearUserCache` 调用无 `await`** — fire-and-forget 模式有风险

### 🟢 P3 — 低优先级

- [ ] **`import type` 与常规 import 混用** — 同一文件同时存在两种用法
- [ ] **Controller 中包含内联函数** — `auth.controller.ts:775-788` 在 handler 内定义函数
- [ ] **直接访问 `process.env`** — `version-control/provider:111-112` 应经 `ConfigService`
- [ ] **`auth-facade.service.spec.ts` (1286 行) 过大** — 反映被测试对象职责过多
- [ ] **测试文件使用双引号，源文件使用单引号** — 风格不一致
- [ ] **`l3-cache.provider.ts` — 用 PostgreSQL 做第三级缓存的架构反模式**
- [ ] **`billing/enums/billing.enum.ts` 与 Prisma schema 枚举重复** — 同步负担
- [ ] **`l1-cache.provider.ts:252` `estimateMemoryUsage` 在循环引用上 JSON.stringify 会抛异常**
- [ ] **`runtime-config.service.ts:252-270` `getAllConfigs()` 无缓存** — 每次命中 DB

---

## 5. Config Service — packages/config-service

### 🔴 P0 — 阻塞

- [x] **`public/frontend-config.js` 中 6 个函数定义了两次** — 后定义覆盖前定义（`collectComplexItems`, `saveUiConfig`, `importUiConfig`, `exportUiConfig`, `resetUiConfig`, `refreshUiConfig`）
- [ ] **`server.js` (1961 行) 拆分** — 所有路由 + 认证 + 数据库操作集中在一个文件

### 🟠 P1 — 高优先级

- [ ] **6 个 public JS 文件中 `setButtonLoading`/`showToast` 函数重复 6 次** — 应提取为共享模块
- [ ] **5 个配置模块的 `getConfig()` 函数模板完全一致** — 应创建工厂函数
- [ ] **CRUD 路由模板化** — 5 组配置 × 4 个方法 = 20 个模式相同的端点
- [ ] **`sms-config.js` 死代码** — 导出但未被任何文件引用
- [ ] **`testDatabase` 与 `testRedis` 功能相同** — 可合并为 `testTcpConnection`

### 🟡 P2 — 中优先级

- [ ] **`server.js:551-553` 内存会话未持久化** — 服务重启后所有会话丢失
- [ ] **`server.js:1933` 所有静态文件 `Cache-Control: no-store`** — 每次刷新重新下载 84KB
- [ ] **`server.js:875` 回退管理员密码硬编码 `'Admin123!'`**
- [ ] **`server.js:46-49` 自定义日志用 `console.log`** — 无日志轮转、级别过滤
- [ ] **无错误处理中间件** — 每个路由方法需自行 try/catch
- [ ] **SPA 架构为 3002 行单 HTML 文件** — 内联 CSS+JS，难以维护

### 🟢 P3 — 低优先级

- [ ] **`AGENTS.md:13-21` 描述 NestJS 结构但实际是纯 JS** — 完全不相关
- [ ] **`server.js:1070-1095` CLI 参数中传递数据库密码** — 进程列表中可见

---

## 6. mxVersionTool — packages/mxVersionTool

### 🔴 P0 — 阻塞

- [ ] **命令注入（10 个文件）** — 通过字符串拼接构建 shell 命令，用户输入直接拼接
  - [ ] `mxcheckout.js:5`, `mxadd.js:14-15`, `mxdelete.js:14`, `mximport.js:8`
  - [ ] `mxupdate.js:5`, `mxswitch.js:5`, `mxresolve.js:10`, `mxcleanup.js:5`
  - [ ] `mxlist.js:5`, `mxlog.js`
- [ ] **明文密码通过 CLI 参数传递（7 个文件）** — 进程列表中可见
  - [ ] `mxcheckout.js:10`, `mxlist.js:16`, `mxupdate.js:9`, `mxswitch.js:10`
  - [ ] `mxdelete.js:26`, `mxcommit.js:41`, `mxlog.js:23`

### 🟠 P1 — 高优先级

- [ ] **`mxpath.js` 与 `mxadminpath.js` 中路径解析代码几乎完全一致** — 应提取共享模块
- [ ] **回调样板代码重复（12 个文件）** — `.then(callback(null, stdout)).catch(callback)` 应抽取为 `wrapCallback`
- [ ] **临时文件清理模式重复（3 个文件）** — 创建临时文件 → 执行 → 清理

### 🟡 P2 — 中优先级

- [ ] **回调 API 风格过时** — 所有命令用 callback 而非 Promise/async，但内部 `mx-executor.js` 用 Promise
- [ ] **执行策略不一致** — 10 个文件用 `executeCommand`（不安全 shell），2 个用 `executeSpawn`/`executeExecFile`
- [ ] **`mxadd.js:5-12` 参数重载存在缺陷** — 传 `mxAdd(paths, cb)` 时 `isRecursive=cb`（true 值）
- [ ] **`mxresolve.js:5-8` 同样参数问题**
- [ ] **`test.js` 为手动脚本** — 仅测试 5/14 命令，无断言，需人工判读

### 🟢 P3 — 低优先级

- [ ] **`index.d.ts` (122 行) 中所有函数用 callback 签名** — 与回调 API 一致但过时
- [ ] **`mxcat.js:4` 与 `mxlog.js:29` 的 `maxBuffer` 默认值不一致**（50MB vs 10MB）
- [ ] **不一致的错误消息** — 部分 catch 直接传递原始 error 对象

---

> 统计：**共 252 个条目**（P0: 49, P1: 67, P2: 88, P3: 48）

---

## 执行批次总览

> 按 **修复风险 + 可验证性** 分组，优先做边界清晰、可快速验证的，需要调查的靠后。

| 批次 | 名称 | 条目数 | 原则 | 典型条目 |
|------|------|--------|------|----------|
| **1** | 即刻可修（安全+边界清晰） | ~35 | 修复结论明确，验证简单，零/低回归风险 | CI 拼写/版本、.gitignore 补充、编译错误、硬编码凭证替换、`require('fs')` 修复、`config-service` 重复函数、死代码移除 |
| **2** | 需测试验证的安全修复 | ~20 | 修复正确但需覆盖测试确认无副作用 | 路径遍历、mxVersionTool 命令注入/明文密码、缺失事务、timer/event 泄漏、AbortController 补全、前端硬编码 localhost |
| **3** | 需先调查再动手 | ~8 | 修复前必须 grep 全仓库确认影响范围 | `appPostApi.ts:37` 硬编码 token（找调用方）、模块变量→Zustand（逐项 grep）、`navigateFunction` 迁移、`isLeavingPageRef` 守卫逻辑 |
| **4** | 基础设施加固 | ~10 | 生产环境改进，不影响开发/测试 | Dockerfile root→普通用户、数据目录权限、nginx HTTPS/CSP、Docker entrypoint 错误处理 |
| **5** | 纯重构（不改行为） | ~180 | 拆分文件、抽取变量、CSS 合并、格式化、文档修正 | `mxcadManager` 拆分、CSS 变量抽取、Z_LAYERS 常量化、索引补充、测试修复、文档更新 |

**注意**：批次之间可以并行，但批次内建议按「P0 → P1 → P2」顺序执行，即每个批次内优先处理高严重度的条目。


**开始修复一个todo或者几个关联的todo 修复后子代理审查，审查后再修复，最后没有问题了文档勾选todo**