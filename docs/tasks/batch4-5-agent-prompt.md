# 前端迁移 Batch 4-5 Agent 启动提示词

## 你的任务

继续完成前端架构迁移。Batch 1-3 已全部完成（见 `docs/tasks/migration-task-list.md`）。你需要完成 Batch 4 和 Batch 5。

## 开始前必读

1. `docs/tasks/migration-task-list.md` — 任务列表和进度
2. `docs/tasks/frontend-migration-guide.md` — 迁移指南（模式、gotchas、模板）
3. 读一个已完成的 hook 作为模板：`src/hooks/useRoleCRUD.ts`

## 关键规则

1. **queryFn 必须检查错误**：`if (result.error) throw result.error`
2. **组件不直接 import `@/api-sdk` 或 `@/services`** — 所有 API 调用必须在 hook 里
3. **MSW URL 必须匹配 `sdk.gen.ts` 中的实际 URL**
4. **每个任务一个 commit**，方便回滚
5. **完成后跑测试**：`node /d/web/MxCADOnline/cloudcad/node_modules/.pnpm/vitest@4.1.0_@opentelemetry+api@1.9.0_@types+node@22.19.15_@vitest+ui@4.1.0_happy-dom@20.8.4__7tymwnfyehaoz7jnfiyozuyqrm/node_modules/vitest/vitest.mjs run --config /d/web/MxCADOnline/cloudcad/packages/frontend/vitest.config.ts --root /d/web/MxCADOnline/cloudcad/packages/frontend`

## Batch 4: 复杂页面

### T4.1 FileSystemManager
- **文件**: `src/pages/FileSystemManager/index.tsx` + hooks 目录
- **已有 hook**: `useFileSystemCRUD.ts`, `useFileSystemData.ts`, `useFileSystemNavigation.ts` 等
- **操作**: 将现有 hook 接入 TanStack Query（替换内部 useState + useEffect）
- **注意**: `useFileSystemData.ts` 仍 import `@/services/projectApi`，需替换为 SDK

### T4.2 LibraryManager
- **文件**: `src/pages/LibraryManager.tsx`
- **SDK**: 大量 library API
- **操作**: 创建 `hooks/useLibraryCRUD.ts` → 组件瘦身

### T4.3 CADEditorDirect
- **文件**: `src/pages/CADEditorDirect.tsx`, `src/pages/CADEditorDirect/index.tsx`
- **已有 hook**: `usePersonalSpace.ts`, `useFileLoader.ts`, `useCadPermissions.ts`
- **操作**: 已有 hook 接入 TanStack Query
- **注意**: 涉及 mxcad-app 通信，小心处理，不要改动 mxcadManager.ts

## Batch 5: 清理 services（最后做）

### T5.1 删除 services 文件
- **前提**: Batch 4 完成
- **删除**: `src/services/` 下所有 API 文件（保留 `mxcadManager/` 目录）
- **文件列表**: apiClient.ts, authApi.ts, usersApi.ts, rolesApi.ts, filesApi.ts, libraryApi.ts, publicFileApi.ts, projectApi.ts, fontsApi.ts, runtimeConfigApi.ts, auditApi.ts, versionControlApi.ts, healthApi.ts, index.ts, projectsApi.ts.bak

### T5.2 清理 `@/services` import
- 涉及文件见 `migration-task-list.md` T5.2 部分
- 所有 `@/services/xxxApi` 替换为 `@/api-sdk` 对应函数

### T5.3 ProjectFilterType 类型迁移
- `ProjectFilterType` 从 `@/services/projectApi` 迁移到本地定义或 SDK types

## 运行测试的命令

```bash
# 从项目根目录运行
node /d/web/MxCADOnline/cloudcad/node_modules/.pnpm/vitest@4.1.0_@opentelemetry+api@1.9.0_@types+node@22.19.15_@vitest+ui@4.1.0_happy-dom@20.8.4__7tymwnfyehaoz7jnfiyozuyqrm/node_modules/vitest/vitest.mjs run --config /d/web/MxCADOnline/cloudcad/packages/frontend/vitest.config.ts --root /d/web/MxCADOnline/cloudcad/packages/frontend

# 类型检查
node /d/web/MxCADOnline/cloudcad/node_modules/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc --noEmit --project /d/web/MxCADOnline/cloudcad/packages/frontend/tsconfig.json
```

## 进度追踪

完成后更新 `docs/tasks/migration-task-list.md` 的进度表。
