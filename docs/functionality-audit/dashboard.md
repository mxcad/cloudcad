# Dashboard / Health 功能审计

> **分支对比**: `main` (旧, messy, 功能完整) vs `refactor/circular-deps` (新, 重构中)
> **审计日期**: 2026-05-08
> **审计范围**: 后端健康检查 + 前端仪表盘页面

---

## 1. 后端: AppController / AppService

| 端点 | main | refactor/circular-deps | 判定 |
|------|------|------------------------|------|
| `GET /` | `"Hello World!"` (Public) | `"Hello World!"` (Public) | ✅ 完全一致 |

**结论**: 无差异，无需处理。

---

## 2. 后端: HealthController

### 2.1 端点对比

| 端点 | main | 当前分支 | 意图差异 |
|------|------|----------|----------|
| `GET /health/live` | 简单存活检查 `{ status, timestamp }` (Public) | **增强** — 额外返回 `uptime`, `memory.heapUsed/Total`, `checks.database`, `checks.redis` (Public) | ✅ 意图相同，功能增强 |
| `GET /health` | 受保护，需要 `SYSTEM_MONITOR` 权限，使用 `@HealthCheck()` 装饰器 | 🔴 **改为 Public**，方法名变为 `publicHealth()`，响应格式不同（`{ status, info, error, details }` 而非 `HealthCheckResult`） | 🔴 **NEEDS DECISION** |
| `GET /health/full` | ❌ 不存在 | **新增** — 受保护，需要 `SYSTEM_MONITOR`，使用 `@HealthCheck()` 装饰器 | ✅ 这是原 `/health` 受保护逻辑的保留 |
| `GET /health/db` | 受保护 `SYSTEM_MONITOR` | 受保护 `SYSTEM_MONITOR` | ✅ 一致 |
| `GET /health/storage` | 受保护 `SYSTEM_MONITOR` | 受保护 `SYSTEM_MONITOR` | ✅ 一致 |

### 2.2 🔴 NEEDS DECISION — `/health` 端点权限变更

**变更描述**: 
- `main` 分支: `GET /health` 需要 `SYSTEM_MONITOR` 权限 + `@HealthCheck()` 装饰器
- 当前分支: `GET /health` 改为 `@Public()`，方法更名为 `publicHealth()`，手动实现健康检查逻辑（不使用 `@HealthCheck()` 装饰器）

**原 `/health` 的受保护行为已迁移到新端点 `GET /health/full`**

**需要决策的问题**:
1. `/health` 公开化是否是故意的架构决策？（例如用于负载均衡器健康检查）
2. 如果是故意的，那么原 `/health` 的消费者（如有依赖 `SYSTEM_MONITOR` 权限的内部监控系统）是否需要迁移到 `/health/full`？
3. 如果不是故意的，应恢复 `/health` 的 `SYSTEM_MONITOR` 权限保护，将公开检查保留在 `/health/live`

### 2.3 其他 HealthController 差异

| 项目 | main | 当前分支 | 判定 |
|------|------|----------|------|
| Redis 注入 | `@InjectRedis()` 装饰器 | `@Inject(Redis)` 手动注入 | ✅ 等价，实现细节差异 |
| `/health/live` 内容 | 仅 `{ status: 'ok', timestamp }` | 增加 uptime、memory、database、redis | ✅ 增强，意图相同 |
| `/health/full` | 不存在 | 新增（受保护） | ✅ 保留原受保护检查能力 |

---

## 3. 后端: HealthModule

| 项目 | main | 当前分支 | 判定 |
|------|------|----------|------|
| imports | `TerminusModule, StorageModule, CommonModule, AuthModule` | 同 main | ✅ 完全一致 |

---

## 4. 前端: Dashboard 页面

### 4.1 数据加载方式

| 方面 | main | 当前分支 | 判定 |
|------|------|----------|------|
| 状态管理 | 3 个 `useState` + 1 个手动 `useEffect` | `useDashboardStats()` + `useDashboardProjects()` 自定义 hooks | ✅ 意图相同，架构更清晰 |
| API 调用层 | `projectsApi` / `usersApi` (openapi-client-axios) | `@/api-sdk` (hey-api SDK 生成) | ⚠️ 见 4.2 |
| 缓存策略 | 无缓存，每次挂载重新请求 | `@tanstack/react-query` 缓存 + 自动失效 | ✅ 增强 |
| 项目创建 | 手动 try/catch + `setProjectCreating` | `useMutation` + `onSuccess` 自动刷新 | ✅ 意图相同 |

### 4.2 ⚠️ `@/api-sdk` 依赖状态

**当前状态**: 
- `useDashboardStats.ts` 和 `useDashboardProjects.ts` 文件中导入 `@/api-sdk`
- `@/api-sdk` 目录 **不存在**（需要运行 `pnpm generate:sdk` 生成）
- `package.json` 中已配置 `"generate:sdk": "npx @hey-api/openapi-ts"`
- `frontend/tsconfig.json` 中 **没有** `@/api-sdk` 的路径别名（它解析到 `./src/api-sdk/`，符合 `@/*` → `./src/*` 规则）

**判定**: 这不是代码缺陷，而是 **构建步骤尚未执行**。`@/api-sdk` 是 `@hey-api/openapi-ts` 的生成产物，在开发/构建前运行 `pnpm generate:sdk` 即可生成。无需修复代码，但需要在开发流程文档中注明。

### 4.3 UI 组件 & 交互对比

| 功能 | main | 当前分支 | 判定 |
|------|------|----------|------|
| 问候语（时段适配） | ✅ | ✅ | 一致 |
| 欢迎横幅（渐变背景） | ✅ | ✅ | 一致 |
| 统计卡片 ×4（项目/文件/今日上传/存储） | ✅ | ✅ | 一致 |
| 加载骨架屏 | ✅ | ✅ | 一致 |
| 错误横幅 | ✅ + createError | ✅ (error 与 createError 合并) | 一致 |
| 成功横幅（项目创建） | ✅ | ✅ | 一致 |
| 最近文件列表（FileItem） | ✅ | ✅ | 一致 |
| 最近项目列表（FileItem） | ✅ | ✅ | 一致 |
| 空状态提示 | ✅ | ✅ | 一致 |
| 快捷操作面板 | ✅ | ✅ | 一致 |
| "新建项目" 按钮（横幅 + 快捷操作） | ✅ | ✅ | 一致 |
| "上传图纸" 按钮（横幅 + 快捷操作） | ✅ | ✅ | 一致 |
| 项目创建弹框（ProjectModal） | ✅ | ✅ | 一致 |
| URL 参数 `?action=create-project` | ✅ | ✅ | 一致 |
| 点击统计卡片跳转 | ✅ | ✅ | 一致 |
| 文件点击 → 新标签页 CAD 编辑器 | ✅ | ✅ | 一致 |
| 项目点击 → 项目文件页 | ✅ | ✅ | 一致 |

### 4.4 微小差异（无功能影响）

| 项目 | main | 当前分支 |
|------|------|----------|
| `formatRelativeTime` 导入 | ✅（但 JSX 中未使用） | ❌ 未导入 |
| 类型导入来源 | `../types/api-client` (swagger 生成) | `../types/filesystem` (本地定义) + `@/api-sdk` |
| `loading` 状态来源 | 单一 `loading` state | 聚合自多个 hook（`statsLoading \|\| projectsLoading`） |

---

## 5. 总结

| 分类 | 数量 | 详情 |
|------|------|------|
| ✅ 意图一致 | 大部分 | app.controller, health.module, health/db, health/storage, Dashboard UI 全部组件 |
| ✅ 功能增强 | 2 | `/health/live` 增强, Dashboard 引入 react-query 缓存 |
| 🔴 NEEDS DECISION | 1 | `/health` 端点从受保护改为公开 |
| ⚠️ 构建依赖 | 1 | `@/api-sdk` 需要运行 `pnpm generate:sdk` 生成 |

### 待决策项

1. **`/health` 公开化** — 确认是否是故意的架构决策，还是重构过程中的遗漏。如果是故意的，需更新文档说明 `/health` (公开) vs `/health/full` (受保护) 的用途区分。

### 构建前置条件

```bash
# Dashboard 页面正常运行前需要执行：
pnpm generate:sdk    # 生成 @/api-sdk（需要后端运行或本地 swagger_json.json）
```
