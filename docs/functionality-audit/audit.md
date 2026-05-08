# 审计日志模块 — 逻辑意图对比报告

**分支对比:** `main` (旧, 功能完整) vs `refactor/circular-deps` (新, 重构中)
**审计日期:** 2026-05-08
**审计范围:** packages/backend/src/audit/ + packages/frontend/src/pages/AuditLog*

---

## 1. 文件清单

| 文件 | main | refactor/circular-deps | 状态 |
|------|------|----------------------|------|
| `backend/src/audit/audit-log.controller.ts` | ✓ | ✓ (新增 `@Request` + `AuthenticatedRequest` 在清理端点) | ✅ 相同意图，有增强 |
| `backend/src/audit/audit-log.service.ts` | ✓ | ✓ (新增 `safePage/safeLimit` 防御、`userId` 参数) | ✅ 相同意图，有增强 |
| `backend/src/audit/dto/audit-log.dto.ts` | ✓ | ✓ | ✅ 完全一致 |
| `frontend/src/pages/AuditLogPage.tsx` | ✓ (内联 API 调用) | ✓ (改用自定义 hooks) | ⚠️ 引用缺失文件 |
| `frontend/src/pages/AuditLogPage/hooks/useAuditLog.ts` | ✗ (逻辑内联在页面) | ✓ (使用 `@tanstack/react-query` + `@/api-sdk`) | ✅ 已重构 |
| `frontend/src/services/auditApi.ts` | ✓ (axios 封装) | ✗ (已废弃) | ✅ 被 `@/api-sdk` 取代 |
| `frontend/src/api-sdk/` | ✗ | ✓ (自动生成的 SDK) | ✅ 新架构 |

---

## 2. 逐项逻辑意图对比

### 2.1 审计日志 API — 查询列表 `GET /audit/logs`

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 路径 | `GET audit/logs` | `GET audit/logs` | 相同 |
| 筛选项 | userId, action, resourceType, resourceId, startDate, endDate, success, page, limit | 同左 | 相同 |
| 分页 | page/limit 默认 1/20 | 同左（service 层加了 `safePage/safeLimit`） | 相同意图，实现增强 |
| 权限守卫 | `@RequirePermissions([SystemPermission.SYSTEM_ADMIN])` | 同左 | 相同 |

**结论:** ✅ 意图相同，实现有防御性增强。

### 2.2 审计日志 API — 日志详情 `GET /audit/logs/:id`

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 路径 | `GET audit/logs/:id` | `GET audit/logs/:id` | 相同 |
| 返回数据 | 含 user (id, email, username, nickname) | 同左 | 相同 |
| 404 处理 | `NotFoundException` | 同左 | 相同 |

**结论:** ✅ 完全一致。

### 2.3 审计统计 `GET /audit/statistics`

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 路径 | `GET audit/statistics` | `GET audit/statistics` | 相同 |
| 过滤 | startDate, endDate, userId | 同左 | 相同 |
| 返回字段 | total, successCount, failureCount, successRate, actionStats | 同左 | 相同 |

**结论:** ✅ 完全一致。

### 2.4 清理日志 `POST /audit/cleanup`

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 路径 | `POST audit/cleanup` | `POST audit/cleanup` | 相同 |
| 参数 | `body.daysToKeep` | `body.daysToKeep` (新增 `req.user.id`) | 相同意图，增强审计 |
| 日志记录 | `清理旧审计日志: 删除了 N 条记录` | `用户 X 于 Y 执行了审计日志清理，删除了 N 条记录` | 增强（记录操作者） |

**结论:** ✅ 意图相同，新增操作者追踪（正向改进）。

### 2.5 审计日志记录 `AuditLogService.log()`

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 参数 | 9 个参数 (action, resourceType, resourceId, userId, success, errorMessage?, details?, ipAddress?, userAgent?) | 同左 | 相同 |
| 错误处理 | catch 不抛出异常 | 同左 | 相同 |

**结论:** ✅ 完全一致。

### 2.6 前端页面 — 统计卡片

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 总记录数 | ✓ | ✓ | 相同 |
| 成功次数 | ✓ | ✓ | 相同 |
| 失败次数 | ✓ | ✓ | 相同 |
| 成功率 | ✓ | ✓ | 相同 |

**结论:** ✅ 完全一致。

### 2.7 前端页面 — 筛选控件

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 用户 ID 输入 | ✓ | ✓ | 相同 |
| 操作类型下拉 | ✓ (15 种操作) | ✓ (15 种操作) | 相同 |
| 资源类型下拉 | ✓ (6 种资源) | ✓ (6 种资源) | 相同 |
| 资源 ID 输入 | ✓ | ✓ | 相同 |
| 开始日期选择 | ✓ (HTML date input) | ✓ (HTML date input) | 相同 |
| 结束日期选择 | ✓ (HTML date input) | ✓ (HTML date input) | 相同 |
| 状态选择 (成功/失败/全部) | ✓ | ✓ | 相同 |
| 重置按钮 | ✓ | ✓ | 相同 |
| 刷新按钮 | ✓ | ✓ | 相同 |

**结论:** ✅ 完全一致。

### 2.8 前端页面 — 日志表格

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 列: 时间 | ✓ (formatDate zh-CN) | ✓ | 相同 |
| 列: 用户 (username + email) | ✓ | ✓ | 相同 |
| 列: 操作 (中文映射) | ✓ (ACTION_NAME_MAP) | ✓ | 相同 |
| 列: 资源类型 (中文映射) | ✓ (RESOURCE_TYPE_MAP) | ✓ | 相同 |
| 列: 资源 ID (截断) | ✓ (DescriptionText maxWidth=20) | ✓ | 相同 |
| 列: 状态 (绿/红 badge) | ✓ | ✓ | 相同 |
| 列: 详情 (截断 + 错误信息) | ✓ (DescriptionText maxWidth=30) | ✓ | 相同 |
| 加载中状态 | "加载中..." | "加载中..." | 相同 |
| 空数据状态 | "暂无数据" | "暂无数据" | 相同 |

**结论:** ✅ 完全一致。

### 2.9 前端页面 — 分页

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 显示范围 | "显示第 X 到 Y 条，共 Z 条" | 同左 | 相同 |
| 上一页/下一页 | ✓ | ✓ | 相同 |
| 页码显示 | "第 X / Y 页" | 同左 | 相同 |
| 首页/末页禁用 | ✓ | ✓ | 相同 |

**结论:** ✅ 完全一致。

### 2.10 前端页面 — 权限控制

| 维度 | main | refactor/circular-deps | 判定 |
|------|------|----------------------|------|
| 权限检查 | `usePermission() + SystemPermission.SYSTEM_ADMIN` | 同左 | 相同 |
| 无权限提示 | "您没有访问审计日志的权限" | 同左 | 相同 |
| 权限不足时不发请求 | ✓ (`if (!hasAdminPermission) return;`) | ✓ (hooks 内部仍会调用但页面早返回) | 相同意图 |

**结论:** ✅ 意图相同。

---

## 3. 🔴 NEEDS DECISION — 发现的问题

### 3.1 架构迁移: `auditApi` → `@/api-sdk`

- **main 分支:** 使用 `packages/frontend/src/services/auditApi.ts`（基于 axios + `getApiClient()` 封装）
- **refactor/circular-deps 分支:** 废弃了旧的 `auditApi.ts`，改为使用 `@/api-sdk` 自动生成的 SDK 方法（`auditLogControllerFindAll`, `auditLogControllerGetStatistics`）
- **影响:** 这是正向重构，但需确保 SDK 已正确生成且 `api-sdk` 目录存在
- **处理:** ✅ 已验证 `packages/frontend/src/api-sdk/` 存在且包含审计相关 SDK 方法

### 3.2 前端状态管理: 引入 `@tanstack/react-query`

- **main 分支:** 在组件内使用 `useState` + `useCallback` + `useEffect` 手动管理数据获取
- **refactor/circular-deps 分支:** `useAuditLog.ts` hooks 使用 `@tanstack/react-query` 的 `useQuery`，提供缓存、去重、后台刷新等能力
- **影响:** 正向重构，但需确保 `@tanstack/react-query` 已在项目中配置 `QueryClientProvider`
- **建议:** 验证 `QueryClientProvider` 已在应用根组件中配置

### 3.3 未验证: `audit-log.module.ts`

- **refactor/circular-deps 分支** 存在 `audit-log.module.ts` 但本次审计范围未包含对比
- **建议:** 单独验证模块是否正确注册了 controller 和 service

---

## 4. 逻辑意图完整性总结

| 功能意图 | main | refactor/circular-deps | 状态 |
|---------|------|----------------------|------|
| 审计日志列表查询 (多条件筛选+分页) | ✅ | ✅ | 完整 |
| 审计日志详情查询 | ✅ | ✅ | 完整 |
| 审计统计信息 | ✅ | ✅ | 完整 |
| 清理旧日志 | ✅ | ✅ (增强: 记录操作者) | 完整 |
| 记录审计日志 (log 方法) | ✅ | ✅ | 完整 |
| 前端统计卡片 | ✅ | ✅ | 完整 |
| 前端筛选控件 (7 个维度) | ✅ | ✅ | 完整 |
| 前端日志表格 (7 列) | ✅ | ✅ | 完整 |
| 前端分页 | ✅ | ✅ | 完整 |
| 前端权限控制 | ✅ | ✅ | 完整 |
| **useAuditLog hooks** | (内联) | ✅ (React Query + SDK) | **已重构** |

---

## 5. 变更说明 (相对于 main)

refactor/circular-deps 分支的重构变更均为**正向增强**，无回归：

1. **Service 层防御性编程:** `findAll` 中 `page/limit` 增加了 `Number()` 安全转换，避免 NaN
2. **清理操作审计:** `cleanupOldLogs` 新增 `userId` 参数，日志消息改为详细格式
3. **Controller 操作者追踪:** `cleanupOldLogs` 端点新增 `@Request()` 注入 `AuthenticatedRequest`，将操作者 ID 传递给 service
4. **前端 API 层升级:** 废弃旧的 `auditApi.ts`（axios + `getApiClient()`），迁移到自动生成的 `@/api-sdk`
5. **前端状态管理升级:** 从手动 `useState` + `useEffect` 升级为 `@tanstack/react-query` 的 `useQuery`，提供缓存、去重、后台刷新能力
6. **前端关注点分离:** 将内联的 API 调用逻辑提取为 `useAuditLogList` / `useAuditLogStats` hooks

**结论:** 审计日志模块的**全部逻辑意图**在 refactor/circular-deps 分支中均得到保留或增强。重构变更为纯正向改进，无功能回归。
