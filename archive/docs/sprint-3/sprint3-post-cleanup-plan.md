# 冲刺三后清理工作分析报告

**日期**: 2026-05-02
**分支**: refactor/circular-deps
**基于**: 代码审计 + 文档分析（api-inventory.md, api-final-status.md）
**状态**: 分析完成，待执行

---

## 执行摘要

对四项清理工作的实际代码审计结果表明，**原始判断与实际情况存在显著偏差**：

| 项目 | 原始描述 | 实际发现 | 优先级 |
|------|---------|---------|--------|
| **① LibraryModule 对齐** | 可能使用了旧的文件系统内部路径 | **基本已对齐**，仅有死代码残留 | 🟢 低 |
| **② 权限检查收敛** | 权限逻辑分散在各处 | **6 种独立机制并存**，但 AuthFacade 无内联检查 | 🔴 高 |
| **③ 135 个废弃端点** | 全部可能废弃 | **4 个确认废弃**，62 个确认使用中，69 个不确定 | 🟡 中 |
| **④ API 版本化** | 缺少 /v1/ 前缀 | 确实没有版本前缀 | 🔵 最后做 |

---

## 一、LibraryModule 对齐

### 实际发现

LibraryModule（3 个文件：`library.module.ts`、`library.service.ts`、`library.controller.ts`）已经正确使用了冲刺二拆分后的子模块路径：

- `../file-system/file-tree/file-tree.service` ✓
- `../file-system/file-download/file-download-handler.service` ✓
- `../file-system/file-system.service`（Facade 入口）✓

**没有**引用旧的 `../file-system/services/...` 路径。所有文件系统依赖均指向当前子模块。

### 发现的唯一问题

`library.service.ts:24-25` 存在未使用的导入：

```typescript
import * as fs from 'fs';
import * as path from 'path';
```

这两个模块在任何方法中均未被引用，属于冲刺二拆分前写操作遗留的死代码。

### 结论

**不需要结构性对齐工作**。LibraryModule 已经正确使用了新的子模块边界。清理工作仅限于移除两行死导入。

### 工作量估算

| 任务 | 时间 | 风险 |
|------|------|------|
| 移除未使用的 fs/path 导入 | 0.5 小时 | 无风险 |
| 验证模块无编译警告 | 0.5 小时 | 无风险 |
| **合计** | **1 小时** | **极低** |

---

## 二、权限检查收敛

### 实际发现

当前代码中存在 **6 种独立的权限检查机制**：

| # | 机制 | 作用域 | 使用位置 |
|---|------|--------|---------|
| A | `@RequireProjectPermission` + `RequireProjectPermissionGuard` | 项目级 | file-system.controller (26处), mxcad.controller (4处), version-control.controller (2处) |
| B | `@RequirePermissions` + `PermissionsGuard` | 系统级 | roles.controller (18处), users.controller (9处), runtime-config (5处), 等 |
| C | `RolesGuard` | 角色级 | 通用 guard |
| D | `FileSystemPermissionService.checkNodePermission()` | 文件/节点级 | 从 service 层直接调用 |
| E | `PermissionService.checkSystemPermission()` | 系统级 | 声明式调用 |
| F | `ProjectPermissionService.checkPermission()` | 项目级 | 从 service/guard 层调用 |

### 关键问题

1. **分散的 enforcement 策略**：部分权限在 Controller 层通过 Guard 施加（机制 A/B），部分在 Service 层通过方法调用施加（机制 D/F）。一个 Controller 方法可能依赖 Guard，但内部调用的 Service 方法又有自己的检查，导致双重检查或遗漏。

2. **没有统一的权限检查入口**：目前没有一个单一的 `checkPermission(context, action, resource)` 方法贯穿所有检查场景。6 种机制各自独立实现，增减权限策略需要修改多处。

3. **AuthFacadeService 没有内联权限逻辑**：这一点是好的——认证和授权在代码层面是分离的。

4. **FileSystemService（Facade）内部可能有隐式检查**：需要通过 FileSystemPermissionService 间接调用 ProjectPermissionService，调用链长且不透明。

### 建议执行步骤

**Phase 1（审计）**：
- 对每一个 controller 方法 + 每一个 public service 方法，枚举其权限检查方式
- 标记"有 Guard 但 Service 没检查"和"没 Guard 但 Service 有检查"的位置

**Phase 2（分层明确）**：
- 明确分层策略：Controller Guard 负责"要不要放行这个请求"，Service 层不再重复检查
- 或反方向：所有在 Controller 层拦截，Service 层假设调用者已通过检查

**Phase 3（收敛简化）**：
- 合并 `ProjectPermissionService` 和 `PermissionService` 到统一接口
- 或至少明确两者的职责边界（项目级 vs 系统级是合理的区分，不需要强融）

### 工作量估算

| 阶段 | 时间 | 风险 |
|------|------|------|
| Phase 1：审计所有 Controller + Service 方法 | 2-3 小时 | 无风险（只读分析） |
| Phase 2：明确定义分层策略 | 1-2 小时 | 决策风险，需团队对齐 |
| Phase 3：收敛实现（合并接口、重构 Guard） | 3-4 小时 | 中风险，涉及所有 Controller |
| **合计** | **6-9 小时** | **中等** |

---

## 三、废弃 API 端点清理

### 实际发现

`api-inventory.md` 报告的"135 个可能废弃端点"是**高估的**。实际分类如下：

| 分类 | 数量 | 说明 |
|------|------|------|
| ✅ **确认使用中** | 62 | 前端或管理后台有明确调用 |
| ❌ **确认废弃（可删除）** | 4 | Session 模块 (3) + 根路径 (1) |
| ❓ **不确定** | 69 | 需要进一步追踪 |

**可安全删除的 4 个端点**：

| 端点 | 所在文件 | 原因 |
|------|---------|------|
| `POST /api/session/create` | 无（Controller 已不存在） | JWT 替代 Session，Controller 已删除 |
| `GET /api/session/user` | 无 | 同上 |
| `POST /api/session/destroy` | 无 | 同上 |
| `GET /api` | `app.controller.ts` | 无实际功能 |

**需要追踪的 69 个不确定端点**主要分布在：

| 模块 | 数量 | 处理策略 |
|------|------|---------|
| cache-monitor | 21 | 管理后台监控页面可能使用→确认后整体保留或删除 |
| file-system | 15 | 部分被前端间接调用→需要逐条追踪 |
| library (mutation) | 11 | 公共图纸库写操作→前端是否真的不再调用？ |
| policy-config | 7 | 管理后台策略配置→确认后整体保留或删除 |
| users/roles | 7 | 部分为内部调用→逐条确认 |
| mxcad | 3 | 缩略图检查、原始文件访问 |
| other | 5 | 零散端点 |

### 建议执行顺序

1. **立即删除 4 个确认废弃的端点**（`app.controller.ts` 的根路径）
2. **对 69 个不确定端点做前端源码追踪**：在 `packages/frontend/src/` 中搜索对应 route path
3. **整体判断模块级保留/删除**：对于 cache-monitor、policy-config 这类整模块不确定的，如果管理后台确实需要就整体保留，不再逐条纠结
4. **Library 写操作端点**：需要确认业务决策——公共图纸库是否还允许通过 API 写入

### 工作量估算

| 阶段 | 时间 | 风险 |
|------|------|------|
| 删除 4 个确认废弃端点 | 0.5 小时 | 无风险 |
| 前端追踪 69 个不确定端点 | 3-5 小时 | 无风险（只读搜索） |
| 模块级决策 + 代码清理 | 2-4 小时 | 低风险 |
| **合计** | **5.5-9.5 小时** | **低** |

---

## 四、API 版本化

### 实际发现

当前所有路由使用 `app.setGlobalPrefix('api')`，没有任何版本前缀：

```
/api/auth/login
/api/users
/api/file-system/nodes
/api/mxcad/upload
...
```

没有任何 Controller 使用 `/v1/` 路径。

### 方案选择

| 方案 | 改动量 | 优点 | 缺点 |
|------|--------|------|------|
| A. 全局前缀改为 `api/v1` | 1 行 | 最简单，一次性改动 | 所有路由同时变化，无法渐进式迁移 |
| B. 逐模块加 `/v1` | 17 个 Controller 各改 1 行 | 可逐步迁移 | 手动工作多，容易漏 |
| C. 不做 URL 版本化，用 Header 协商 | 无路由改动 | 不破坏现有 URL | NestJS 支持较弱，需要自定义机制 |

### 建议

**方案 A（全局前缀）**，但在以下条件满足时再做：
1. 废弃端点清理完成（减少后续版本迭代的噪音）
2. 前端同步更新所有 API 调用路径
3. 与前端 Vue 3 迁移计划对齐——最好在前后端版本同时发布时切换

### 工作量估算

| 任务 | 时间 | 风险 |
|------|------|------|
| 修改全局前缀 `api` → `api/v1` | 0.5 小时 | 高（破坏性变更） |
| 前端同步更新所有 API 路径 | 2-4 小时 | 必须协调发布 |
| **合计** | **2.5-4.5 小时** | **高** |

---

## 五、优先级排序与执行顺序

### 最终排序

```
第一优先：权限检查收敛（6-9 小时）    ← 安全/正确性，技术债
  └─ 先审计，再分层，后收敛
  └─ BEFORE 任何新功能开发

第二优先：废弃端点 Phase 1（0.5 小时）  ← 快速见效
  └─ 删除 4 个确认废弃的端点
  └─ 为版本化扫清障碍

第三优先：LibraryModule 清理（1 小时）  ← 顺手修复
  └─ 移除死代码导入

第四优先：废弃端点 Phase 2（5-9 小时）  ← 前端协作，时间取决于不确定性
  └─ 追踪 69 个端点，确认后清理
  └─ 可以拆分为多个子任务

最后：API 版本化（2.5-4.5 小时）         ← 破坏性变更，等所有清理完成后再做
  └─ 需要与前端 Vue 3 迁移协调发布时间
  └─ 等废弃端点清理完成后再做，避免在 v1 中包含已废弃的路由
```

### 执行顺序时间线

```
Week 1          Week 2          Week 3          Week 4
│               │               │               │
├─ 权限审计 ──→ │               │               │
│  (2-3h)       │               │               │
├─ 权限收敛 ──→ │               │               │
│  (4-6h)       │               │               │
               ├─ 废弃端点 P1 ─→│               │
               │  (0.5h)        │               │
               ├─ Library 清理 ─→│               │
               │  (1h)          │               │
                              ├─ 废弃端点 P2 ─→│
                              │  (5-9h)        │
                                             ├─ API 版本化 ─→
                                             │  (2.5-4.5h)
                                             │  需要前端同步
```

### 工作量总计

| 项目 | 最短 | 最长 |
|------|------|------|
| 权限检查收敛 | 6h | 9h |
| 废弃端点 Phase 1 | 0.5h | 0.5h |
| LibraryModule 清理 | 1h | 1h |
| 废弃端点 Phase 2 | 5h | 9h |
| API 版本化 | 2.5h | 4.5h |
| **总计** | **15h** | **24h** |

---

## 六、不做什么的建议

| 被排除的方案 | 原因 |
|------------|------|
| **LibraryModule 重构** | 经过代码审计，模块已经正确对齐，不需要重构 |
| **6 种权限机制强融为 1 种** | 项目级、系统级、角色级、节点级有合理的分层需求。强融为 1 种会导致 Guard 和 Service 的逻辑耦合。目标应是**职责明确**而非**数量最少** |
| **废弃端点逐条删除代替模块级决策** | 对于 cache-monitor（21 条）、policy-config（7 条）这类整模块不确定的，如果确认是管理后台使用，整体保留比逐条标注更高效 |
| **Header 版本协商** | NestJS 生态对 URL 版本化支持更好（全局 prefix），Header 方案需要自定义中间件，增加复杂度而少有收益 |
| **v1/v2 双版本并行** | 当前不存在多版本需求。先加 v1，等真正需要 v2 时再考虑并行方案 |

---

*分析版本: 1.0.0 | 基于实际代码审计，非纯文档分析*
