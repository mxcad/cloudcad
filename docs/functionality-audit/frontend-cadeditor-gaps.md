# CADEditorDirect.tsx 行为差异审计报告

对比分支：
- **main** – 重构前（行为真相，实现质量较差）
- **refactor/circular-deps** – 重构后（实现更清晰，但存在功能缺失）

审计日期：2026-05-08

---

## 总体评估

重构分支在代码组织、类型安全、副作用管理方面有明显改进，但存在几处关键行为差异和缺失功能，主要体现在 API 调用方式、权限检查、个人空间 ID 获取及部分错误处理路径。

| 维度 | main 分支行为 | refactor/circular-deps 分支行为 | 差异/风险 |
|------|--------------|--------------------------------|-----------|
| **API 服务导入** | 直接导入 `filesApi`, `projectsApi`, `libraryApi`, `publicFileApi` (基于 openapi-client-axios) | 使用函数式 API：`fileSystemControllerGetNode`, `fileSystemControllerCheckProjectPermission`, `libraryControllerGetDrawingNode` 等 (来自 `@/api-sdk`) | ✅ 类型更安全，但 API 路径前缀可能不一致（`/api/v1/...` vs `/api/...`） |
| **个人空间 ID 获取** | 通过 `projectsApi.getPersonalSpace()` 在 `useEffect` 中获取并存储到 state | 使用自定义 hook `usePersonalSpaceQuery` (基于 TanStack Query) | ✅ 更好的缓存和加载状态，但需要确保 hook 在所有场景下启用 |
| **CAD 权限检查** | `projectsApi.checkPermission(urlProjectId, permission)` | `fileSystemControllerCheckProjectPermission({ path: { projectId }, query: { permission } })` | ⚠️ 请求参数结构不同，需确认后端兼容性 |
| **文件打开（handleInsertFile）** | 使用 `filesApi.get()` 两次获取目标文件和当前文件，提取 `parentId`/`isRoot` | 使用 `fileSystemControllerGetNode` 统一获取节点信息 | ⚠️ 当前分支中 `handleInsertFile` 仍使用 `filesApi.get`（未完全迁移），导致类型不一致且可能缺少 `deletedAt` 等字段 |
| **下载文件** | `filesApi.downloadWithFormat()` 直接返回 blob | `fileSystemControllerDownloadNodeWithFormat` 返回 `{ response }`，需手动调用 `response.blob()` | ✅ 功能等价，但需确保错误处理一致 |
| **WebGL 上下文管理** | 使用 `visibility: hidden` + `z-index` 保持 canvas 存活 | 相同机制 | ✅ 无差异 |
| **初始化防抖（Home 模式）** | 使用全局 `window['mxcad_home_init_started']` 标志 | 使用组件级 `homeInitStartedRef` | ✅ 重构分支修复了 StrictMode 下重复初始化导致的 loading 卡死问题 |
| **主题同步** | 相似实现，但访问 `window.MxPluginContext` 时缺少异步等待 | 显式 `await` 获取 `serverConfig` | ✅ 重构分支更稳健 |
| **未登录时保存/另存为** | 通过 `mxcad-save-required` 事件触发登录弹窗 | 相同机制 | ✅ 无差异 |
| **外部参照上传后回调** | 支持 `openFileCallbackRef` 和 `public-file-uploaded` 事件 | 相同机制 | ✅ 无差异 |
| **错误处理与用户反馈** | 简单的 `setError` 和重试按钮 | 相同，但增加了 `isHomeMode` 时的刷新按钮 | ✅ 轻微改进 |

---

## 已确认的功能缺失 / 回归

### 1. `handleInsertFile` 中 API 调用未完全迁移

**位置**：`packages/frontend/src/pages/CADEditorDirect.tsx` 约第 1110-1160 行

**问题**：在 `handleInsertFile` 函数中，仍使用 `filesApi.get()` 而非新的 `fileSystemControllerGetNode`。这导致：
- 类型不一致（`filesApi.get` 返回结构为 `{ data: T }`，而 controller 直接返回 `T`）
- 可能缺少 `deletedAt`、`parentId`、`isRoot` 等字段的正确提取
- 若 `filesApi` 在重构中被移除，会导致运行时错误

**影响**：从侧边栏插入文件（打开另一个 CAD 文件）功能可能失败或行为异常。

**建议**：将 `handleInsertFile` 中的 `filesApi.get` 全部替换为 `fileSystemControllerGetNode`，并调整数据访问路径。

---

### 2. 个人空间 ID 缓存时机不一致

**位置**：`packages/frontend/src/pages/CADEditorDirect.tsx` 约第 210-226 行 (main) vs 第 207-222 行 (refactor)

**问题**：
- main 分支在获取 `personalSpaceId` 后立即调用 `setCachedPersonalSpaceId` 同步到 `mxcadManager`
- refactor 分支使用 `usePersonalSpaceQuery`，但在 `setCurrentFileInfo` 时依赖 `personalSpaceId` state，而 `usePersonalSpaceQuery` 的数据是异步的，可能导致首次打开文件时 `personalSpaceId` 为 `null`

**影响**：首次打开个人空间中的文件时，`personalSpaceId` 可能未就绪，导致侧边栏项目列表或保存路径错误。

**建议**：确保 `usePersonalSpaceQuery` 的 `enabled` 条件正确，并在数据加载完成前显示 loading 或禁用相关操作。

---

### 3. API 路径前缀差异

**问题**：
- main 分支：`/api/mxcad/filesData/...` 和 `/api/library/...`
- refactor 分支：`/api/v1/mxcad/filesData/...` 和 `/api/v1/library/...`

**风险**：如果后端未同时支持 `/api/v1/...` 和 `/api/...`，则重构分支的 CAD 文件加载会失败。

**建议**：确认后端路由配置，或统一使用无版本前缀的路径（根据项目规范，当前未启用 API 版本控制）。

---

### 4. 权限检查接口参数格式

**问题**：
- main：`projectsApi.checkPermission(projectId, permission)`
- refactor：`fileSystemControllerCheckProjectPermission({ path: { projectId }, query: { permission } })`

**风险**：若后端期望的请求体结构不同，权限检查会失败，导致保存/导出按钮被禁用。

**建议**：验证 OpenAPI 定义与实际后端行为一致，并确保前端生成的 SDK 正确。

---

## 可简单修复的问题

### ✅ 修复 1：统一 `handleInsertFile` 中的 API 调用

将 `filesApi.get` 替换为 `fileSystemControllerGetNode`，并调整数据提取逻辑。

**示例代码**（需适配实际类型）：
```typescript
// 替换前
const targetFileResponse = await filesApi.get(file.nodeId);
const targetFile = targetFileResponse.data;

// 替换后
const targetFile = await fileSystemControllerGetNode({ path: { nodeId: file.nodeId } });
```

同时移除不必要的类型断言。

### ✅ 修复 2：确保 `personalSpaceId` 在打开文件前就绪

在 `usePersonalSpaceQuery` 中增加 `enabled: isAuthenticated && !!fileId` 或在文件加载 effect 中等待 `personalSpaceId` 不为 `null`。

---

## 待决策项

### ❓ 是否保留 API 版本前缀 `/v1/`？

需要与后端团队确认：
- 当前生产环境是否接受 `/api/v1/...` 路径
- 如果统一使用无版本前缀，需修改 `mxcadFileUrl` 构造逻辑

### ❓ 是否完全移除 `filesApi` 依赖？

重构分支中部分地方（如 `handleInsertFile`、`handleDownloadWithFormat`）仍引用 `filesApi`，建议彻底迁移到新的 SDK 函数，避免维护两套 HTTP 客户端。

---

## 结论

`refactor/circular-deps` 分支在代码质量和可维护性上显著优于 `main`，但存在上述功能缺口。**建议优先修复 `handleInsertFile` 和 API 路径问题**，然后进行完整回归测试（打开文件、保存、另存为、导出、插入文件、外部参照上传）。修复完成后可合并。

---

## 审计方法

- 逐行对比两个版本的源文件
- 重点关注初始化流程、用户交互事件处理、API 调用、状态管理差异
- 参考 `packages/frontend/CLAUDE.md` 和项目规范
