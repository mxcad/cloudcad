# AGENTS.md - CloudCAD 项目上下文

> **稳定规则 | 不随项目变动而改变**
> 最重要规则:
> 一、**只要有1%的可能性适用，就必须调用Skill(强制性)**
> 技能触发流程: 1.收到用户消息2.判断是否有相关Skill 3.调用Skill工具加载内容4.严格遵循Skill指导执行5.如需检查清单->创建Todo 6.如需求不明确，信息不足，反问用户

二、**当了解用户需求后，应该考虑这个需要是否可以用什么技能解决用户需求，如果当前拥有的技能无法满足需求，调用find-skills技能搜索技能安装新技能**
技能始终安装在.iflow/skills/xxx技能

---

## 1. 元约束

| 约束            | 说明                                   |
| --------------- | -------------------------------------- |
| 100% 中文       | zh-CN 简体，技术术语可保留英文         |
| 100% pnpm       | 禁止 npm/yarn                          |
| 100% PowerShell | Windows 环境，命令符合 PowerShell 规范 |
| 100% Express    | NestJS 后端必须使用 Express 平台       |
| 100% 禁止 any   | TypeScript 严格模式                    |

---

## 2. 行为准则

| 准则     | 说明                             |
| -------- | -------------------------------- |
| 技术优先 | 优先考虑技术准确性，而非迎合用户 |
| 不猜测   | 仅回答基于事实的信息，不进行推测 |
| 保持一致 | 不轻易改变已设定的行为模式       |
| 承认局限 | 在不确定时主动承认局限性         |
| 专注执行 | 专注于解决问题，而非解释过程     |

---

## 3. 架构铁律

### 3.1 权限检查 → Controller 层

```
请求 → Controller → Guard（权限检查）→ Service（纯业务逻辑）
```

- 使用 `@RequirePermissions()` / `@RequireProjectPermission()`
- **禁止**在 Service 层检查权限

### 3.2 API 调用 → 类型安全

```typescript
// ✅ 正确
getApiClient().FileSystemController_getNode({ nodeId: id });

// ❌ 禁止
apiClient.get(`/file-system/nodes/${id}`);
```

### 3.3 TypeScript 类型规则

| 场景     | 类型来源                                                  |
| -------- | --------------------------------------------------------- |
| Body DTO | `import type { XxxDto } from '../types/api-client'`       |
| 参数类型 | `Parameters<OperationMethods['XxxController_method']>[0]` |

**禁止**：`as` 断言、`any` 类型、`Record<string, any>`

---

## 4. 常见陷阱

### 4.1 Prisma

| 陷阱                             | 规避                                 |
| -------------------------------- | ------------------------------------ |
| 原生 SQL 列名错误                | 优先用 ORM 方法，原生 SQL 先确认列名 |
| `delete()`/`update()` 不存在记录 | 用 `deleteMany()`/`updateMany()`     |
| 修改 schema.prisma               | 必须使用标准迁移流程，禁止直接修改后部署 |

### 4.2 API Client

| 陷阱                | 规避                                                |
| ------------------- | --------------------------------------------------- |
| 未初始化调用        | 用 `AppInitializer` 先初始化                        |
| Swagger `/api` 重复 | `baseURL.replace(/\/api$/, '')`                     |
| Axios 兼容性        | 用 `axiosInstance` 参数，不用 `axiosConfigDefaults` |

### 4.3 缓存

| 陷阱         | 规避                            |
| ------------ | ------------------------------- |
| 缓存错误结果 | 异常时不缓存，用 `forceRefresh` |

### 4.4 前端

| 陷阱           | 规避                                                       |
| -------------- | ---------------------------------------------------------- |
| 响应空值未检查 | 用可选链 `data?.exists`                                    |
| 原生弹框       | 用 `useModal()`/`useMessage()` 替代 `window.confirm/alert` |

---

## 5. 验证流程

```
代码修改 → type-check → lint → test → code-reviewer → [frontend-tester] → 完成
```

---

## 6. 文档索引

| 类型     | 位置                                                     |
| -------- | -------------------------------------------------------- |
| 共享文档 | [documents/shared/](documents/shared/)                   |
| 后端核心 | [documents/backend/core/](documents/backend/core/)       |
| 后端功能 | [documents/backend/modules/](documents/backend/modules/) |
| 前端文档 | [documents/frontend/](documents/frontend/)               |

---

## 7. 更新日志

| 日期       | 简述                                 |
| ---------- | ------------------------------------ |
| 2026-03-09 | 添加 Prisma schema 迁移流程规则      |
| 2026-03-04 | 精简为稳定规则，动态内容移至分层文档 |
| 2026-03-03 | 从 IFLOW.md 提炼核心约束             |
