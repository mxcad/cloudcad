# PRD: 前端架构迁移 — SDK API + Hooks + TanStack Query

## Problem Statement

当前前端代码存在以下维护性问题：

- **两套 API 系统并存**：旧的 `services/` 层（openapi-client-axios，已标 `@deprecated`）和新的 `api-sdk/`（@hey-api/openapi-ts）同时存在，13 个文件仍在 import 旧 services
- **29 个页面直接 import SDK 函数**，在组件内用 `useState` + `useEffect` + `useCallback` 手动管理数据请求、加载态、错误态、AbortController，每个页面重复 50-100 行模板代码
- **AuthContext 是"上帝 Context"**（452 行），混合了登录/注册 API 调用、token 管理、用户状态、微信 OAuth 跨窗口通信、token 刷新回调
- **没有数据请求库**：所有 hook 手动管理 `useState` + `useCallback` + `useEffect` + `AbortController`，30+ 个 hook 重复造轮子
- **表单用手动 useState 管理**：Login、Register、RoleManagement 等表单密集页面手动管每个字段、校验、touched/dirty 状态
- **12 个组件直接 import SDK**，业务逻辑内联在组件中而非抽到 hooks

这些问题导致：新页面开发需要大量复制粘贴、重构困难、新人上手成本高。

## Solution

统一前端架构为 **SDK API + TanStack Query + React Hooks + react-hook-form** 的分层模式，实现"业务逻辑全部收敛在 hooks 中，组件只负责展示"的目标。

## User Stories

1. 作为开发者，我想所有 API 调用都通过 `@/api-sdk` 的自动生成函数，这样不需要维护手写的 service 层
2. 作为开发者，我想删除所有 `@/services/` 下的废弃文件，这样不会被误导去使用旧的 API 封装
3. 作为开发者，我想用 TanStack Query 管理所有服务端数据请求，这样不需要手动管理 loading/error/caching/refetch
4. 作为开发者，我想每个业务域有一个标准的 CRUD hook（如 `useUserCRUD`），这样新页面开发只需要照模板写
5. 作为开发者，我想 hook 的标准接口是 `{ data, loading, error, create, update, delete, reload }`，这样团队有一致的心智模型
6. 作为开发者，我想 AuthContext 只负责共享 user 状态，认证逻辑（登录/注册/微信 OAuth/token 刷新）抽到 `useAuth` hook 中
7. 作为开发者，我想表单页面用 react-hook-form + zod 管理，这样不需要手动管每个字段的 useState、校验、错误消息
8. 作为开发者，我想简单的 Modal 表单（如 RenameModal）保持 useState，不引入 react-hook-form，这样不会过度工程化
9. 作为开发者，我想组件变成纯展示层，通过 props 接收数据和回调，这样组件可以被复用和独立测试
10. 作为开发者，我想全局 hooks 放 `src/hooks/`，页面专属 hooks 放页面目录下，这样可以清楚区分复用范围
11. 作为开发者，我想 Zustand stores 保持原样只管 UI 状态，这样不会引入不必要的变更
12. 作为开发者，我想从 UserManagement 页面开始做迁移模板，这样有一个可参考的标准实现
13. 作为开发者，我想迁移一个页面时同时完成：删除 services import → 改 TanStack Query → 组件瘦身，这样不会产生中间状态
14. 作为开发者，我想迁移后的页面保持完全相同的功能和 UI，这样不需要额外的回归测试
15. 作为开发者，我想每个迁移的 hook 都有对应的测试，用 TDD 方式验证行为
16. 作为开发者，我想新 hook 使用 `useMutation` 的 `onSuccess` 回调自动 invalidate 相关 query 缓存，这样数据变更后自动刷新
17. 作为开发者，我想 `useQuery` 的 `queryKey` 按业务域组织（如 `['users', params]`），这样缓存管理清晰
18. 作为开发者，我想删除旧的 axios 版 `apiClient.ts`，这样只保留一个 HTTP 客户端
19. 作为开发者，我想迁移是渐进式的（按页面逐个迁移），这样随时可以暂停和恢复
20. 作为新加入的开发者，我想通过 `src/hooks/` 目录就能找到所有业务逻辑，不需要在组件中搜索 API 调用

## Implementation Decisions

### 新增依赖

| 包 | 用途 | 体积 |
|---|---|---|
| `@tanstack/react-query` | 服务端数据请求管理（缓存、loading、error、refetch） | ~12KB gzip |
| `react-hook-form` | 表单状态管理（字段注册、校验、提交） | ~9KB gzip |
| `zod` | 表单校验 schema 定义（与 TypeScript 类型共享） | ~12KB gzip |

### 架构分层

```
┌─────────────────────────────────────────────────┐
│  组件层（纯展示）                                  │
│  props 接收数据和回调，不 import SDK               │
├─────────────────────────────────────────────────┤
│  Hook 层（业务逻辑）                               │
│  useQuery / useMutation → SDK 函数                │
│  react-hook-form → 表单逻辑                       │
├─────────────────────────────────────────────────┤
│  SDK 层（自动生成）                                │
│  @/api-sdk → 类型安全的 HTTP 调用                  │
├─────────────────────────────────────────────────┤
│  HTTP 层（已配置）                                 │
│  client-setup.ts → token 注入、401 刷新、响应解包   │
└─────────────────────────────────────────────────┘
```

### 标准 CRUD Hook 模板

每个业务域（用户、角色、项目等）遵循统一模式：

- `useQuery` 负责数据查询（列表、详情）
- `useMutation` 负责数据变更（创建、更新、删除）
- `onSuccess` 回调中调用 `queryClient.invalidateQueries()` 自动刷新缓存
- 返回值统一：`{ data, isLoading, error, create, update, remove, reload }`

### AuthContext 拆分

- **AuthContext（薄层）**：只存储 `user` 状态，通过 `useQuery({ queryKey: ['user'], queryFn: getProfile })` 驱动
- **useAuth hook（业务层）**：封装 login / register / logout / 微信 OAuth / token 刷新等全部认证流程
- 两层分离后 AuthContext 变成 ~50 行的 Provider

### Zustand stores

保持不变。`fileSystemStore`、`uiStore`、`notificationStore` 继续管理客户端 UI 状态，与 TanStack Query 的服务端缓存互补。

### 删除范围

| 删除项 | 原因 |
|---|---|
| `src/services/` 整个目录 | 全部标 `@deprecated`，仅为 SDK 薄包装，无业务逻辑 |
| `src/services/apiClient.ts` | 旧 axios 客户端，已被 `api-sdk/client-setup.ts` 替代 |
| 13 个文件对 `@/services` 的 import | 改为直接 import `@/api-sdk` |

### 迁移顺序

1. **基础设施**：安装依赖、配置 QueryClient Provider
2. **模板页面**：UserManagement（已有半成品 `useUserCRUD`）
3. **简单 CRUD 页面**：RoleManagement、Dashboard
4. **表单密集页面**：Login、Register（引入 react-hook-form）
5. **复杂页面**：FileSystemManager、CADEditorDirect
6. **组件瘦身**：12 个直接 import SDK 的组件
7. **AuthContext 拆分**
8. **清理**：删除 services 目录

### 组件规范

迁移后的组件必须满足：
- 不 import `@/api-sdk` 或 `@/services`
- 所有数据通过 props 或 hook 获取
- 所有用户操作通过回调 props 传递
- 简单 Modal 表单（单字段）可保留 useState

## Testing Decisions

### 测试策略

- 遵循 TDD 流程：先写行为测试，再写最小实现
- 测试关注**行为**而非实现：测试 hook 返回的函数能正确调用 SDK、状态正确切换
- 使用 Vitest + `@testing-library/react-hooks` 测试 hooks
- Mock SDK 函数（`vi.mock('@/api-sdk')`），不 mock 内部实现

### 需要测试的模块

| 模块 | 测试重点 |
|---|---|
| 标准 CRUD hooks | query 加载、mutation 调用、cache 失效、错误处理 |
| useAuth hook | 登录流程、token 存储、401 刷新、登出清理 |
| react-hook-form schemas | zod schema 校验逻辑（必填、格式、长度等） |
| TanStack Query 配置 | QueryClient 缓存策略、全局 error 处理 |

### 参考先例

- 现有 `useFileSystem` 系列 hook 的测试模式
- 后端 `*.controller.spec.ts` 的 `Test.createTestingModule()` 模式（仅参考 mock 思路）

## Out of Scope

- **后端改动** — 本次只涉及前端
- **SDK 重新生成** — `api-sdk/` 目录由 `@hey-api/openapi-ts` 自动生成，不在本次范围
- **Zustand stores 重构** — 保持原样
- **UI 组件库变更** — Radix UI / Tailwind CSS 不变
- **路由结构变更** — React Router 配置不变
- **新功能开发** — 本次只做架构迁移，不增加新功能
- **CollaborateSidebar 等 Vue 混合组件** — 涉及 mxcad-app（Vue）通信逻辑，需要单独评估

## Further Notes

### 风险点

- **TanStack Query 的 staleTime 配置**：需要根据各页面数据变化频率调整，默认 `staleTime: 0` 可能导致频繁请求
- **react-hook-form 的 controlled/uncontrolled 选择**：复杂表单（如动态字段列表）可能需要 controlled 模式，性能需关注
- **AuthContext 拆分时机**：微信 OAuth 的 `StorageEvent` 监听需要在 hook mount 时注册，确保跨窗口通信不中断
- **迁移期间的双轨运行**：部分页面迁移后、部分未迁移，需要确保不出现 import 混乱

### 执行建议

- 每迁移一个页面，确保 `pnpm type-check` 和 `pnpm lint` 通过
- UserManagement 作为模板页面，完成后先 review 再推广到其他页面
- 每个迁移提交独立 commit，方便回滚
