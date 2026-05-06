# 前端迁移验证 & 清理 Agent 启动提示词

## 你的任务

验证上一轮迁移（commit `b90426b`）的正确性，并完成剩余清理工作。

## 开始前必读

1. `docs/tasks/migration-task-list.md` — 任务列表和进度（含阻塞项说明）
2. `docs/tasks/frontend-migration-guide.md` — 迁移指南
3. 当前分支: `refactor/circular-deps`

## 上一轮完成的改动

commit `b90426b` 完成了以下迁移：
- `ProjectFilterType` 从 `@/services/projectApi` 迁移到 `src/types/project.ts`
- `projectApi.getDeleted()` → `fileSystemControllerGetTrash()` SDK 调用
- `versionControlApi.getFileHistory()` → `versionControlControllerGetFileHistory()` SDK 调用
- `libraryApi` 动态导入 → SDK `libraryController*` 函数
- 新增 `src/utils/libraryApi.ts`（封装 SDK 未覆盖的图书馆删除端点）

## 任务清单

### T6.1 验证构建和类型检查
```bash
pnpm install
pnpm type-check
pnpm build
```
如果有类型错误，修复它们。

### T6.2 运行测试并修复
```bash
pnpm test
```
测试可能因为 mock 了旧的 `@/services` 模块而失败。需要更新测试 mock。

### T6.3 更新测试文件中的 @/services mock
以下测试文件 mock 了 `@/services` 模块，需要改为 mock `@/api-sdk`：

- `src/hooks/file-system/useFileSystemCRUD.spec.ts` — mock `projectApi`, `nodeApi`, `projectTrashApi`, `trashApi`
- `src/hooks/file-system/useFileSystemData.spec.tsx` — mock `projectApi`
- `src/pages/FileSystemManager.spec.tsx` — mock `projectApi`, `versionControlApi`
- `src/hooks/useProjectPermission.spec.ts` — mock `projectPermissionApi`
- `src/services/mxcadManager/__tests__/mxcadSave.spec.ts` — mock `filesApi`

**mock 替换规则：**
- `projectApi.list` → mock `fileSystemControllerGetProjects`
- `projectApi.getDeleted` → mock `fileSystemControllerGetTrash`
- `versionControlApi.getFileHistory` → mock `versionControlControllerGetFileHistory`
- `nodeApi.*` → mock `fileSystemControllerGetNode` / `fileSystemControllerGetChildren`
- SDK mock 使用 MSW handler，URL 格式见 `src/api-sdk/sdk.gen.ts`

### T6.4 清理 services 目录（如果所有测试通过）
删除 `src/services/` 下已无引用的 API 文件：
- `src/services/apiClient.ts`
- `src/services/authApi.ts`
- `src/services/usersApi.ts`
- `src/services/rolesApi.ts`
- `src/services/filesApi.ts`
- `src/services/publicFileApi.ts`
- `src/services/projectApi.ts`
- `src/services/fontsApi.ts`
- `src/services/runtimeConfigApi.ts`
- `src/services/auditApi.ts`
- `src/services/versionControlApi.ts`
- `src/services/healthApi.ts`
- `src/services/index.ts`
- `src/services/projectsApi.ts.bak`

**保留：**
- `src/services/mxcadManager/` 目录（CAD 引擎管理，非 API 服务）
- `src/services/libraryApi.ts`（SDK 缺少写操作端点，仍有引用）
- `src/services/nodeApi.ts`（如有引用）
- `src/services/projectTrashApi.ts`（如有引用）
- `src/services/trashApi.ts`（如有引用）
- `src/services/projectPermissionApi.ts`（如有引用）

**删除前先确认：** 用 `grep -r "from '@/services/xxx"` 确认无活跃代码引用。

### T6.5 libraryApi 完全移除（仅在 SDK 补齐端点后）
如果 `src/api-sdk/sdk.gen.ts` 中已有以下端点，可以移除 `libraryApi.ts`：
- `libraryControllerDeleteDrawingNode` / `libraryControllerDeleteBlockNode`
- `libraryControllerRenameDrawingNode` / `libraryControllerRenameBlockNode`
- `libraryControllerMoveDrawingNode` / `libraryControllerMoveBlockNode`
- `libraryControllerCopyDrawingNode` / `libraryControllerCopyBlockNode`
- `libraryControllerCreateDrawingFolder` / `libraryControllerCreateBlockFolder`

如果 SDK 仍缺少这些端点，跳过此任务。

## 关键规则

1. **queryFn 必须检查错误**：`if (result.error) throw result.error`
2. **组件不直接 import `@/api-sdk` 或 `@/services`** — 所有 API 调用必须在 hook 里
3. **MSW URL 必须匹配 `sdk.gen.ts` 中的实际 URL**
4. **每个任务一个 commit**，方便回滚
5. **完成后跑测试**：`pnpm test` + `pnpm type-check`

## 运行测试的命令

```bash
pnpm test
pnpm type-check
pnpm build
```

## 完成后

更新 `docs/tasks/migration-task-list.md` 的进度表。
