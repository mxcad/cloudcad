# 前端迁移任务列表

> 每个任务可独立执行。执行前先读 `docs/tasks/frontend-migration-guide.md`。
> 完成后跑 `pnpm test` 和 `pnpm type-check` 确认无回归。

---

## Batch 1: 简单页面迁移（低风险）

### T1.1 RoleManagement
- **文件**: `src/pages/RoleManagement.tsx`
- **SDK**: `rolesControllerFindAll/Create/Update/Remove`, `rolesControllerCreateProjectRole/GetSystemProjectRoles/UpdateProjectRole/DeleteProjectRole`, `authControllerGetProfile`
- **操作**: 创建 `hooks/useRoleCRUD.ts` + `hooks/useRoleForm.ts`（如需要）→ 组件瘦身
- **测试**: 创建 `hooks/useRoleCRUD.spec.ts`
- **预估**: ~50 行新代码

### T1.2 Dashboard
- **文件**: `src/pages/Dashboard.tsx`
- **SDK**: `usersControllerGetDashboardStats` + 其他统计 API
- **操作**: 只读查询，创建 `hooks/useDashboardStats.ts` 用 `useQuery`
- **测试**: 创建 `hooks/useDashboardStats.spec.ts`
- **预估**: ~30 行新代码

### T1.3 FontLibrary
- **文件**: `src/pages/FontLibrary.tsx`
- **SDK**: `fontsControllerGetFonts/UploadFont/DeleteFont/DownloadFont`
- **操作**: 创建 `hooks/useFontCRUD.ts` → 组件瘦身
- **测试**: 创建 `hooks/useFontCRUD.spec.ts`
- **预估**: ~40 行新代码

### T1.4 AuditLogPage
- **文件**: `src/pages/AuditLogPage.tsx`
- **SDK**: `auditLogControllerFindAll/GetStatistics`
- **操作**: 只读查询，创建 `hooks/useAuditLog.ts` 用 `useQuery`
- **测试**: 创建 `hooks/useAuditLog.spec.ts`
- **预估**: ~25 行新代码

---

## Batch 2: Auth 页面（中风险，react-hook-form）

### T2.1 Login
- **文件**: `src/pages/Login.tsx`, `src/pages/Login/hooks/useLoginForm.ts`
- **SDK**: `authControllerSendSmsCode`
- **操作**: 已有 `useLoginForm.ts`，需接入 react-hook-form + zod schema → 组件瘦身
- **测试**: 创建 `hooks/loginFormSchema.spec.ts`
- **预估**: ~60 行新代码

### T2.2 Register
- **文件**: `src/pages/Register.tsx`, `src/pages/Register/hooks/useRegisterForm.ts`
- **SDK**: `authControllerCheckFieldUniqueness/SendSmsCode/RegisterByPhone`
- **操作**: 已有 `useRegisterForm.ts`，需接入 react-hook-form + zod schema → 多步表单处理
- **测试**: 创建 `hooks/registerFormSchema.spec.ts`
- **预估**: ~70 行新代码

### T2.3 ForgotPassword / ResetPassword
- **文件**: `src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`
- **SDK**: `authControllerForgotPassword/ResetPassword`
- **操作**: 简单表单，创建 schema + hook
- **测试**: 基本校验测试
- **预估**: ~30 行新代码

### T2.4 EmailVerification / PhoneVerification
- **文件**: `src/pages/EmailVerification.tsx`, `src/pages/PhoneVerification.tsx`
- **SDK**: `authControllerResendVerification/BindEmailAndLogin/BindPhoneAndLogin/VerifyEmailAndRegisterPhone`
- **操作**: 简单调用，创建 `useVerification.ts` hook
- **预估**: ~20 行新代码

---

## Batch 3: 组件瘦身（低风险，纯 import 替换）

### T3.1 ProfileInfoTab
- **文件**: `src/pages/components/ProfileInfoTab.tsx`
- **SDK**: `usersControllerUpdateProfile`
- **操作**: 提取到 `hooks/useProfileUpdate.ts`，组件不直接 import SDK

### T3.2 Profile（完整页面）
- **文件**: `src/pages/Profile.tsx`, `src/pages/Profile/hooks/useEmailTab.ts`
- **SDK**: 多个 profile 相关 API
- **操作**: 创建 `hooks/useProfile.ts` → 组件瘦身

### T3.3 SelectFolderModal
- **文件**: `src/components/modals/SelectFolderModal.tsx`
- **SDK**: `fileSystemControllerGetChildren`
- **操作**: 提取到 hook，组件通过 props 接收数据

### T3.4 SaveAsModal
- **文件**: `src/components/modals/SaveAsModal.tsx`
- **SDK**: `fileSystemControllerGetProjects`, `mxCadControllerSaveMxwebAs`
- **操作**: 提取到 hook

### T3.5 ProjectRolesModal
- **文件**: `src/components/modals/ProjectRolesModal.tsx`
- **SDK**: `rolesControllerGetProjectRolesByProject/CreateProjectRole/UpdateProjectRole/DeleteProjectRole`
- **操作**: 创建 `hooks/useProjectRoleCRUD.ts`

### T3.6 LibrarySelectFolderModal
- **文件**: `src/components/modals/LibrarySelectFolderModal.tsx`
- **SDK**: `libraryControllerGetDrawingLibrary/DrawingChildren/BlockLibrary/BlockChildren`
- **操作**: 提取到 hook

### T3.7 SidebarContainer
- **文件**: `src/components/sidebar/SidebarContainer.tsx`
- **SDK**: `fileSystemControllerGetNode/GetRootNode/GetPersonalSpace`
- **操作**: 提取到 hook

---

## Batch 4: 复杂页面（高风险）

### T4.1 FileSystemManager
- **文件**: `src/pages/FileSystemManager/index.tsx` + hooks 目录
- **SDK**: 大量 file system API
- **已有 hook**: `useFileSystemCRUD.ts`, `useFileSystemData.ts`, `useFileSystemNavigation.ts` 等
- **操作**: 将现有 hook 接入 TanStack Query（替换内部 useState）
- **依赖**: `useFileSystemData.ts` 仍 import `@/services/projectApi`（T1）
- **预估**: ~100 行改动

### T4.2 LibraryManager
- **文件**: `src/pages/LibraryManager.tsx`
- **SDK**: 大量 library API
- **操作**: 创建 `hooks/useLibraryCRUD.ts` → 组件瘦身

### T4.3 CADEditorDirect
- **文件**: `src/pages/CADEditorDirect.tsx`, `src/pages/CADEditorDirect/index.tsx`
- **SDK**: `fileSystemControllerGetNode/GetRootNode/DownloadNodeWithFormat/GetPersonalSpace/CheckProjectPermission`
- **已有 hook**: `usePersonalSpace.ts`, `useFileLoader.ts`, `useCadPermissions.ts`
- **操作**: 已有 hook 接入 TanStack Query
- **注意**: 涉及 mxcad-app 通信，小心处理

---

## Batch 5: 清理 services（最后做）

### T5.1 删除 services 文件
- **前提**: 所有 Batch 1-4 完成
- **删除**: `src/services/` 下所有 API 文件（保留 `mxcadManager/` 目录）
- **文件列表**:
  - `src/services/apiClient.ts`
  - `src/services/authApi.ts`
  - `src/services/usersApi.ts`
  - `src/services/rolesApi.ts`
  - `src/services/filesApi.ts`
  - `src/services/libraryApi.ts`
  - `src/services/publicFileApi.ts`
  - `src/services/projectApi.ts`
  - `src/services/fontsApi.ts`
  - `src/services/runtimeConfigApi.ts`
  - `src/services/auditApi.ts`
  - `src/services/versionControlApi.ts`
  - `src/services/healthApi.ts`
  - `src/services/index.ts`
  - `src/services/projectsApi.ts.bak`

### T5.2 清理 `@/services` import
- **文件**:
  - `src/hooks/file-system/useFileSystemData.ts` — `projectApi` → SDK
  - `src/hooks/file-system/useFileSystem.ts` — `ProjectFilterType` → SDK types
  - `src/pages/FileSystemManager/index.tsx` — `ProjectFilterType` → SDK types
  - `src/pages/FileSystemManager/FileSystemHeader.tsx` — `ProjectFilterType` → SDK types
  - `src/pages/FileSystemManager/hooks/useVersionHistory.ts` — `versionControlApi` → SDK
  - `src/pages/components/ProjectFilterTabs.tsx` — `ProjectFilterType` → SDK types
  - `src/components/ProjectDrawingsPanel/ProjectDrawingsPanelMain.tsx` — `libraryApi` → SDK
  - `src/components/ProjectDrawingsPanel/components/ProjectListView.tsx` — `ProjectFilterType` → SDK types
  - 测试文件中的 `@/services` mock 替换

### T5.3 ProjectFilterType 类型迁移
- `ProjectFilterType` 从 `@/services/projectApi` 迁移到本地定义或 SDK types
- 涉及 5 个文件，统一替换

---

## 执行规则

1. **每个任务一个 commit**，方便回滚
2. **先写测试再写实现**（TDD），参考 `frontend-migration-guide.md`
3. **queryFn 必须检查 `result.error`**：`if (result.error) throw result.error`
4. **MSW URL 必须匹配 `sdk.gen.ts` 中的实际 URL**
5. **组件不直接 import `@/api-sdk` 或 `@/services`**
6. **完成后跑 `pnpm test` 和 `pnpm type-check`**

## 进度追踪

| Task | 状态 | 分支 |
|---|---|---|
| UserManagement (模板) | ✅ 完成 | refactor/circular-deps |
| T1.1 RoleManagement | ✅ 完成 | refactor/circular-deps |
| T1.2 Dashboard | ✅ 完成 | refactor/circular-deps |
| T1.3 FontLibrary | ✅ 完成 | refactor/circular-deps |
| T1.4 AuditLogPage | ✅ 完成 | refactor/circular-deps |
| T2.1 Login | ✅ 完成 | refactor/circular-deps |
| T2.2 Register | ✅ 完成 | refactor/circular-deps |
| T2.3 ForgotPassword/ResetPassword | ✅ 完成 | refactor/circular-deps |
| T2.4 EmailVerification/PhoneVerification | ✅ 完成 | refactor/circular-deps |
| T3.1 ProfileInfoTab | ✅ 完成 | refactor/circular-deps |
| T3.2 Profile | ✅ 完成 | refactor/circular-deps |
| T3.3 SelectFolderModal | ✅ 完成 | refactor/circular-deps |
| T3.4 SaveAsModal | ✅ 完成 | refactor/circular-deps |
| T3.5 ProjectRolesModal | ✅ 完成 | refactor/circular-deps |
| T3.6 LibrarySelectFolderModal | ✅ 完成 | refactor/circular-deps |
| T3.7 SidebarContainer | ✅ 完成 | refactor/circular-deps |
| T4.1 FileSystemManager | ✅ 完成 | refactor/circular-deps |
| T4.2 LibraryManager | ✅ 完成 | refactor/circular-deps |
| T4.3 CADEditorDirect | ✅ 完成 | refactor/circular-deps |
| T5.1-5.3 清理 services | ✅ 完成 | refactor/circular-deps |
| Batch 6 验证 & 清理 | ✅ 完成 | refactor/circular-deps |

## 阻塞项

### libraryApi 无法完全移除
`src/services/libraryApi.ts` 被以下 hook 深度使用：
- `useLibrary.ts` — 图纸库/图块库 CRUD
- `useLibraryOperations.ts` — 下载、删除、重命名、移动、复制
- `useLibraryPanel.ts` — 面板数据加载
- `useDirectoryImport.ts` — 批量导入
- `useSaveAs.ts` — 另存为

**原因**: SDK (`sdk.gen.ts`) 缺少图书馆写操作端点：
- `deleteDrawingNode` / `deleteBlockNode`
- `renameDrawingNode` / `renameBlockNode`
- `moveDrawingNode` / `moveBlockNode`
- `copyDrawingNode` / `copyBlockNode`
- `createDrawingFolder` / `createBlockFolder`
- `saveDrawingAs` / `saveBlockAs`

**解决方案**: 后端添加对应的 library CRUD 端点后，SDK 会自动生成，届时可移除 `libraryApi`。
