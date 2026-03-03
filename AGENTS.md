# AGENTS.md - CloudCAD 核心约束与陷阱

> **违反即任务失败 | 精简版 - 只包含不可从代码推断的关键知识**

---

## 📋 文档自维护规则（LLM 必读）

当执行任务时，如果满足以下条件，**自动添加新规则到此文档**：

### 添加触发条件
- ✅ 发现新的"陷阱"，解决耗时超过 3 步
- ✅ 同一类错误出现 2 次以上
- ✅ 用户明确指示"记住这个规则"
- ✅ 代码审查发现高频错误模式
- ✅ 不可从代码直接推断的 domain knowledge

### 添加前自检（必须全部通过）
```
□ 是否不可从代码直接推断？
□ 是否会导致反复踩坑？
□ AGENTS.md 中是否已存在类似规则？
□ 描述是否具体（带代码/命令示例）？
□ 是否属于本项目特有的约束？
```

### 添加位置规范
| 规则类型 | 添加章节 | 示例 |
|----------|----------|------|
| 强制约束 | 第 1 章 元约束 | 新的硬性规范 |
| 架构原则 | 第 2 章 架构铁律 | 代码组织方式 |
| 常见错误 | 第 3 章 常见陷阱 | 踩坑及规避 |
| 任务入口 | 第 4 章 任务路由 | 新类型任务 |
| 类型规范 | 第 5 章 类型规则 | TS 使用规范 |

### 添加后动作
1. 在"更新日志"中记录新增规则（日期 + 简述）
2. 如果文档超过 300 行，将旧规则归档到 `AGENTS.md.archive`
3. 向用户简要说明新增的规则

---

## 1. 元约束（Meta Constraints）

| 约束 | 说明 |
|------|------|
| 100% 中文回复 | zh-CN 简体，技术术语可保留英文 |
| 100% 使用 pnpm | 禁止使用 npm 或 yarn |
| 100% PowerShell | Windows 环境，命令必须符合 PowerShell 规范 |
| 100% 禁止 any 类型 | TypeScript 严格模式，代码质量检查必须通过 |
| 100% Express 平台 | 后端 NestJS 开发必须使用 Express 平台 |
| 100% 前端包名 | 前端包名为 `cloudcad-manager`，非 `frontend` |

---

## 2. 架构铁律（不可违反）

### 2.1 权限检查必须在 Controller 层完成

```
❌ 错误：Service 层检查权限
✅ 正确：Controller 层使用 Guard + 装饰器

请求 → Controller → Guard（权限检查）→ Service（纯业务逻辑）
```

**必须使用装饰器**：`@RequirePermissions()` / `@RequireProjectPermission()`

### 2.2 API 服务层必须使用类型安全风格

```typescript
// ❌ 禁止：axios 风格
apiClient.get(`/file-system/nodes/${id}`)

// ✅ 正确：getApiClient() 风格
getApiClient().FileSystemController_getNode({ nodeId: id })
```

### 2.3 MxCAD IndexedDB 缓存管理

**关键变量生命周期**：
```typescript
// 必须在 createInstance 中提前设置，因为 openFileComplete 事件在 create() 时触发
if (openFile) {
  currentMxwebUrl = openFile;  // 必须在监听器设置前赋值
}
```

**缓存清理策略**：
```typescript
// 模糊匹配：key 包含 filePath，且带 ?t= 参数但不是当前时间戳
if (
  keyStr.includes(filePath) &&
  keyStr.includes('?t=') &&
  !keyStr.includes(`?t=${keepTimestamp}`)
) {
  await objectStore.delete(key);
}
```

---

## 3. 常见陷阱（Pitfalls）

### 3.1 Prisma 原生 SQL 列名错误

**陷阱**：使用蛇形命名 `parent_id` 而非实际列名 `parentId`

**后果**：PostgreSQL 报错 `column "xxx" does not exist`

**规避**：
- 优先使用 Prisma ORM 方法（`findMany`、`findFirst`）
- 如必须用原生 SQL，先用 Prisma Studio 确认实际列名

### 3.2 Prisma 单条操作 vs 批量操作

**陷阱**：使用 `delete()` / `update()` 操作可能不存在的记录

**后果**：抛出 P2025 错误

**规避**：
- 删除：`deleteMany()` 替代 `delete()`
- 更新：`updateMany()` 替代 `update()`

### 3.3 API Client 初始化时序

**陷阱**：在 `initApiClient()` 完成前调用 `getApiClient()`

**后果**：`API client not initialized. Call initApiClient() first.`

**规避**：
- 应用入口使用 `AppInitializer` 组件先初始化
- 所有 API 调用必须在初始化完成后执行

### 3.4 Swagger 路径 /api 重复

**陷阱**：`swagger_json.json` 路径已含 `/api`，但 `API_BASE_URL` 也含 `/api`

**后果**：请求 URL 变成 `/api/api/auth/login`，返回 404

**规避**：
```typescript
const baseURL = API_BASE_URL.replace(/\/api$/, '');
```

### 3.5 Axios 与 OpenAPIClientAxios 兼容性

**陷阱**：使用 `axiosConfigDefaults` 配置 `OpenAPIClientAxios`

**后果**：`axios.create is not a function`

**规避**：
```typescript
const axiosInstance = axios.create({ baseURL, timeout });
new OpenAPIClientAxios({ definition, axiosInstance });
```

### 3.6 缓存错误结果

**陷阱**：异常处理中返回空结果并缓存

**后果**：权限检查等关键逻辑因缓存空结果而失效

**规避**：
- 异常时不缓存返回值
- 使用 `forceRefresh` 在关键初始化时强制刷新缓存

### 3.7 MxCAD openWebFile 参数顺序

**陷阱**：`fetchAttributes` 参数传错位置

**后果**：文件无法正确加载到 IndexedDB 或内存

**正确用法**：
```typescript
mxcad.openWebFile(
  fileUrl,        // 文件 URL（带 ?t= 时间戳）
  undefined,      // retCall: 回调函数
  true,           // isWorkThread: 是否使用工作线程
  objParam,       // obj_param: { requestHeaders: {...} }
  0               // fetchAttributes: 0=IndexedDB+内存, 1=仅内存
);
```

### 3.8 IndexedDB 缓存 Key 格式不匹配

**陷阱**：清理缓存时只匹配 `/mxcad/filesData/...` 格式

**后果**：emscripten 实际存储完整 URL `http://localhost:3000/mxcad/filesData/...`，导致清理失败

**规避**：使用模糊匹配 `keyStr.includes(filePath)` 而非精确匹配

---

## 4. 任务路由（Task Routing）

| 任务类型 | 入口文件/模块 |
|----------|---------------|
| 新增 API | `dto/` → `controller/` → `service/` |
| 权限相关 | `decorators/` → `guards/` |
| 数据库变更 | `prisma/schema.prisma` → 生成迁移 |
| 前端 API 调用 | `services/apiClient.ts` → `types/api-client.ts` |
| 权限检查 | 使用 `usePermission` / `useProjectPermission` Hooks |
| MxCAD 缓存清理 | `services/mxcadManager.ts` → `clearOldMxwebCache()` |

---

## 5. 类型规则（TypeScript）

| 场景 | 类型来源 |
|------|----------|
| Body DTO | `import type { XxxDto } from '../types/api-client'` |
| Query/Path 参数 | `Parameters<OperationMethods['XxxController_method']>[0]` |
| Response 类型 | `Paths.XxxControllerMethod.Responses.$200` |

**禁止**：
- ❌ `as` 类型断言
- ❌ `Record<string, any>` 或 `any` 类型
- ❌ 手动维护 API 类型（必须从 Swagger 生成）

---

## 6. 开发命令

### 根目录
```powershell
pnpm dev                               # 启动所有服务
pnpm build                             # 构建所有包
pnpm check:fix                         # 检查并自动修复
pnpm type-check                        # TypeScript 类型检查
pnpm backend:dev                       # 仅启动后端
pnpm backend:verify                    # 后端完整验证
pnpm frontend:verify                   # 前端完整验证
pnpm generate:frontend-permissions     # 生成前端权限常量
```

### 后端（packages/backend）
```powershell
pnpm dev                               # 启动基础设施 + 后端
pnpm dev:infra                         # 仅启动基础设施
pnpm dev:infra:stop                    # 停止基础设施
pnpm cooperate                         # 启动协作服务
pnpm start:dev                         # 仅后端（热重载）
pnpm build                             # 构建项目
pnpm start                             # 启动生产服务器
pnpm test                              # 运行所有测试
pnpm test:unit                         # 单元测试
pnpm test:integration                  # 集成测试
pnpm test:permission                   # 权限测试
pnpm db:generate                       # 生成 Prisma Client
pnpm db:migrate                        # 运行数据库迁移
pnpm db:studio                         # 打开 Prisma Studio
pnpm verify                            # 完整验证
```

### 前端（packages/frontend）
```powershell
pnpm dev                               # 启动开发服务器
pnpm build                             # 构建生产版本
pnpm preview                           # 预览生产版本
pnpm test                              # 运行测试
pnpm test:ui                           # 打开 Vitest UI 界面
pnpm test:coverage                     # 覆盖率报告
pnpm check:fix                         # 检查并自动修复
pnpm generate:types                    # 生成 API 类型
pnpm verify                            # 完整验证
```

---

## 7. 验证流程

```
代码修改 → type-check → lint → test → code-reviewer → [frontend-tester] → 完成
```

**命令**：
```powershell
pnpm check:fix    # 检查并自动修复
pnpm type-check   # TypeScript 类型检查
pnpm test         # 运行测试
```

---

## 8. 工具使用优先级

| 优先级 | 工具 | 用途 |
|--------|------|------|
| 1 | `read_file` | 读取文件内容 |
| 2 | `replace` | 小范围代码修改 |
| 3 | `write_file` | 创建新文件或大规模重写 |
| 4 | `run_shell_command` | 执行系统命令 |
| 5 | `glob` / `search_file_content` | 搜索文件或内容 |
| 6 | `task` | 复杂多步骤任务 |

---

## 9. 延伸阅读

- 完整文档：[IFLOW.md](./IFLOW.md)
- 架构文档：[documents/shared/architecture.md](./documents/shared/architecture.md)
- 开发规范：[documents/shared/guidelines.md](./documents/shared/guidelines.md)
- MxCAD 集成：[docs/MXCAD_UNIFIED_UPLOAD_IMPLEMENTATION.md](./docs/MXCAD_UNIFIED_UPLOAD_IMPLEMENTATION.md)

---

## 10. 更新日志

| 日期 | 类型 | 简述 |
|------|------|------|
| 2026-03-03 | 创建 | 从 IFLOW.md 提炼核心约束，创建 AGENTS.md |
| 2026-03-03 | 元指令 | 添加文档自维护规则，支持 LLM 自动添加新规则 |
| 2026-03-03 | 架构铁律 | 添加 MxCAD IndexedDB 缓存管理最佳实践 |
| 2026-03-03 | 常见陷阱 | 添加 MxCAD openWebFile 参数顺序和 IndexedDB Key 格式陷阱 |
| 2026-03-03 | 开发命令 | 更新前后端完整命令列表 |