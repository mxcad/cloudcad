# Phase 1: API 迁移 + Uppy 上传

> 唯一数据源。状态由任务报告的完成情况驱动更新。

## 状态

| # | 任务 | 子组 | 状态 | 报告 | 阻塞于 |
|---|------|------|------|------|--------|
| T15 | API 批1: auth/users/roles/health/runtimeConfig | 并发 | ✅ | `T15-report` | — |
| T16 | API 批2: files/fonts/audit/versionControl/project | 并发 | ✅ | `T16-report` | — |
| T17 | libraryApi + publicFileApi → @/api-sdk | 顺序 | ✅ | `T17-report` | T16 |
| T18 | FileSystemManager → Uppy | 并发 | ✅ | `T18-report` | — |
| T19 | LibraryManager → Uppy | 并发 | ✅ | `T19-report` | — |
| T20 | 外部参照直调 SDK | 顺序 | ✅ | `T20-report` | T17 |
| T21 | 删旧上传代码 | 顺序 | ✅ | — | T20 |

## 大方向

将 CloudCAD 前端从旧 API 层（`getApiClient()`）和自定义上传方案迁移到新架构（`@/api-sdk` + Uppy）。

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| API 客户端 | `@/api-sdk` (hey-api) | Swagger 自动生成，类型安全 |
| 上传协议 | Uppy + Tus | 开源标准，后端已部署 |
| 迁移顺序 | API 优先，上传第二 | 回归边界清晰 |

## Known Issues（审查时自动排除）

> 这些是已知的预存问题，不视为 Phase 1 审查的缺陷。

- T00-T14 迁移的 `trashApi`/`nodeApi`/`searchApi`/`projectMemberApi`/`projectPermissionApi`/`projectTrashApi` 等文件已被删除，消费者断链。记入 Phase 2
- `libraryApi` + `publicFileApi` 部分写操作因 SDK 未覆盖仍用 `getApiClient()`
- `services/index.ts` 中仍有多条指向已删文件的导出——暂无人使用，Phase 2 清理
