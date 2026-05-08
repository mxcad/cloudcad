# Cross-Cutting 层跨分支逻辑意图审计

**分支**: `main` (旧) vs `refactor/circular-deps` (新)  
**日期**: 2026-05-08  
**范围**: Guards / Interceptors / Decorators / Filters / Pipes / Services / Controllers / Schedulers / Modules / Storage / PersonalSpace / PolicyEngine

---

## 🔵 Guards（守卫层）

### permissions.guard.ts
- **状态**: ✅ 一致（IDENTICAL）
- **差异**: 仅 import 路径变更 `permission.util` → `permission.utils`（文件重命名）
- **逻辑**: 相同 — 装饰器提取权限 → getHandler/getClass → AND/OR 模式检查 → checkSystemPermissionWithContext
- **结论**: 无功能影响

### require-project-permission.guard.ts
- **状态**: ✅ 一致，但新分支有增强
- **差异**:
  - 新增 `NotFoundException` import + `FileTreeService` 导入路径变更
  - `extractNodeId()`: 新增 `itemIds` 数组支持（批量操作如 trash/restore）
  - `extractProjectIdFromNode()`: 新增错误日志捕获
  - 节点不存在时返回 404 而非 null
- **逻辑**: 意图一致 — 智能节点类型判断（公开资源库 vs 项目节点） → 权限检查
- **结论**: 不需要决策，新分支兼容旧分支逻辑

### roles.guard.ts
- **状态**: ✅ 一致（IDENTICAL）
- **结论**: 无功能影响

---

## 🟢 Interceptors（拦截器层）

### response.interceptor.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: 相同 — 统一 `{ code, message, data, timestamp }` 响应格式
- **结论**: 无功能影响

### storage-quota.interceptor.ts
- **状态**: ✅ 一致（IDENTICAL）
- **差异**:
  - 类型定义: 旧分支用 `any`，新分支用 `MulterRequest` 类型
  - 导入路径: `quota-enforcement.service` 路径从 `../../file-system/services/` → `../../file-system/storage-quota/`
- **逻辑**: 意图完全一致 — 跳过认证/配额查询路由 → 检查 enforceQuota 开关 → 提取文件大小（支持 7 种上传方式）→ 提取父节点 ID → 执行配额检查
- **结论**: 无功能影响，纯结构重构

---

## 🟡 Decorators（装饰器层）

### require-permissions.decorator.ts
- **状态**: ✅ 一致（IDENTICAL）
- **结论**: 无功能影响

### require-project-permission.decorator.ts
- **状态**: ✅ 一致（IDENTICAL）
- **结论**: 无功能影响

### roles.decorator.ts
- **状态**: ✅ 一致（IDENTICAL）
- **结论**: 无功能影响

### validation.decorators.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: IsMatch / IsStrongPassword / IsUsername / IsEmailField / IsNickname — 完全相同的验证规范
- **结论**: 无功能影响

---

## 🔴 Filters（异常过滤器层）

### exception.filter.ts
- **状态**: ✅ 一致（IDENTICAL）
- **差异**: 日志调用 `console.log` → `this.logger.debug`（改进）
- **逻辑**: 相同 — HttpException 处理 → 敏感信息过滤 → 统一错误响应格式
- **结论**: 无功能影响

---

## 🟣 Pipes（验证管道层）

### validation.pipe.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: 相同 — whitelist + forbidNonWhitelisted + transform + custom exceptionFactory
- **结论**: 无功能影响

---

## 🔵 Common Services（公共服务层）

### permission.service.ts
- **状态**: ⚠️ 意图一致，但依赖注入变更
- **差异**:
  - 增加 `IPERMISSION_STORE` 接口注入（支持定制权限存储）
  - 移除 `AuditLogService` 依赖
  - `checkSystemPermission()`: 新增 `permissionStore` 快速路径
  - `clearUserCache()`: 新增 `permissionStore` 快速路径
  - `checkSystemPermissionsBatch()`: 新增 `permissionStore` 快速路径
  - `prisma.user.findUnique()`: 新分支增加 `deletedAt: null` 过滤
- **逻辑**: 意图一致（缓存优先 → 角色继承检查），新分支增加了 IPermissionStore 抽象层支持
- **结论**: 不需要决策。新分支兼容旧分支逻辑，`deletedAt: null` 增强是 Bug 修复

### permission-cache.service.ts
- **状态**: ✅ 基本一致（538 行 vs 536 行）
- **差异**: `CacheKeyUtil` 导入路径 `cache-key.util` → `cache-key.utils`
- **逻辑**: 完全一致 — 三级缓存（L1/L2/L3）+ Redis 发布/订阅失效 + 版本控制
- **结论**: 无功能影响

### role-inheritance.service.ts
- **状态**: ✅ 一致（IDENTICAL，615行 vs 615行）
- **逻辑**: 相同 — 角色继承树 → 权限聚合 → 缓存预热 → 递归清理
- **结论**: 无功能影响

### roles-cache.service.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: 相同 — Map<string, string> 内存缓存系统角色，onModuleInit 加载
- **结论**: 无功能影响

### redis-cache.service.ts
- **状态**: ✅ 一致（IDENTICAL，276行 vs 276行）
- **差异**: 新分支使用 SCAN 游标迭代替代旧分支的 SCAN 也同样使用（无 KEYS 命令阻塞）
- **逻辑**: 相同 — setex/get/del + SCAN 游标模式匹配
- **结论**: 无功能影响

### storage-cleanup.service.ts
- **状态**: ⚠️ 一致 + 功能增强
- **差异**:
  - 新增 `cleanupExpiredTrash()` — 回收站过期清理
  - 新增 `cleanupFolderRecursive()` — 递归文件夹清理
  - 新增 `manualCleanup(delayDays?)` — 管理员手动触发
  - 新增 `getPendingCleanupStats()` — 待清理统计
- **逻辑**: 旧分支已有过期存储清理核心逻辑，新分支增强
- **结论**: 新分支功能增强，向后兼容

### storage-manager.service.ts
- **状态**: ⚠️ 一致 + 功能增强
- **差异**: 新增 `copyNodeDirectory()` / `getFullPath()` / `getNodeDirectoryPath()` / `getNodeDirectoryRelativePath()`
- **逻辑**: 核心分配/删除/统计逻辑一致
- **结论**: 新分支功能增强，向后兼容

### 其余 Services（一致）
- `directory-allocator.service.ts` — IDENTICAL
- `disk-monitor.service.ts` — IDENTICAL（WMIC/PowerShell/df 跨平台磁盘监控）
- `file-copy.service.ts` — IDENTICAL
- `file-extensions.service.ts` — IDENTICAL
- `file-lock.service.ts` — IDENTICAL（文件级锁，过期检测 + 重试机制）

---

## 🟠 Common Controllers（公共控制器层）

### cache-monitor.controller.ts
- **状态**: 🔴 需要决策 — 控制器迁移
- **差异**: 
  - 旧分支 `common.module.ts` 中包含 `CacheMonitorController`（端点：`/api/cache/stats`, `/api/cache/clear`, `/api/cache/warmup` 等）
  - 新分支 `common.module.ts` 中已移除 `CacheMonitorController`
  - `cache-architecture` 模块有独立的 `CacheMonitorController`（相同的实现）
- **决策**: 确认新分支中 `/api/cache/*` 端点是否仍可访问（移至 cache-architecture 模块路由前缀 `cache` 保持不变）

### user-cleanup.controller.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: 相同 — GET /stats, POST /trigger（管理员功能，需 SYSTEM_USER_DELETE 权限）
- **结论**: 无功能影响

---

## 🟠 Common Schedulers（定时任务层）

- **cache-cleanup.scheduler.ts**: ✅ IDENTICAL（每 10 分钟清理 L3 过期缓存，每小时记录统计，每天记录健康状态）
- **storage-cleanup.scheduler.ts**: ✅ IDENTICAL（凌晨 3 点存储清理，凌晨 4 点回收站清理，每周过期锁清理，每小时磁盘监控）
- **user-cleanup.scheduler.ts**: ✅ IDENTICAL（凌晨 4 点清理过期用户数据）

---

## 🟠 Common Module（模块配置）

### common.module.ts
- **状态**: 🔴 需要决策 — 模块配置变更
- **差异汇总**:

| 条目 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| imports | 含 `AuditLogModule`, `UsersModule`, `StorageModule`, `CacheArchitectureModule` | 含 `StorageModule`, `CacheArchitectureModule` |
| providers | 含 `RedisCacheService` | 不含 `RedisCacheService` |
| controllers | 含 `CacheMonitorController`, `UserCleanupController` | 仅含 `UserCleanupController` |
| exports | 含 `RedisCacheService` | 不含 `RedisCacheService` |

- **决策项**:
  1. `RedisCacheService` 移除 — 确认是否有其他模块引用 `CommonModule` exports 中的 `RedisCacheService`（已迁移到 CacheArchitectureModule）
  2. `AuditLogModule` / `UsersModule` 移除 — 确认 Circular Dependency 解决方案是否移除了双向依赖
  3. `CacheMonitorController` 移除 — 端点已迁移到 `cache-architecture` 模块

---

## 🔴 Storage（存储模块）

### storage.service.ts
- **状态**: 🔴 需要决策 — 架构重构
- **差异汇总**:

| 方面 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| 依赖 | `LocalStorageProvider` 直接依赖 | `IStorageProvider` 接口注入 |
| 方法数 | 6 个 | 13 个 |
| getFileInfo | 自建 Content-Type 映射表 | 委托 storageProvider.getMetaData() |
| 新增方法 | — | writeFile/writeStream/copyFile/moveFile/deleteAll/copyFromFs/getFile/getFileBytes/getUrl/getProvider |

- **决策项**:
  1. 确认旧分支中所有 `StorageService` 调用在新分支接口下能正常工作
  2. `getFileInfo` Content-Type 解析逻辑从 Service 移到 Provider — Provider 的 `getMetaData()` 实现需要覆盖所有必要的 MIME 类型

### storage-check.service.ts
- **状态**: ✅ 一致（114行 vs 114行）
- **差异**: `checkInLocal` 中错误日志增加详细信息
- **结论**: 无功能影响

---

## 🔵 Personal Space（个人空间）

### personal-space.service.ts
- **状态**: ✅ 一致（IDENTICAL）
- **逻辑**: 相同 — createPersonalSpace / getPersonalSpace（不存在则自动创建）/ isPersonalSpace
- **结论**: 无功能影响

---

## 🟣 Policy Engine（策略引擎）

### policy-engine.module.ts
- **状态**: 🔴 需要决策 — 模块配置变更
- **差异汇总**:

| 条目 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| imports | `DatabaseModule`, `CommonModule` | `DatabaseModule`, `forwardRef(() => CommonModule)` |
| controllers | `PolicyConfigController` | 无 |
| providers | `PolicyEngineService`, `PolicyConfigService` | `PolicyFactoryService`, `PolicyEngineService`, `PolicyConfigService` |
| exports | `PolicyEngineService`, `PolicyConfigService` | `PolicyFactoryService`, `PolicyEngineService`, `PolicyConfigService` |

- **决策项**:
  1. `PolicyConfigController` 移除 — 策略配置 CRUD API 端点是否丢失？
  2. `PolicyFactoryService` 新增 — 确认其功能是否在旧分支中由 PolicyEngineService 内部提供（代码重组？）
  3. `forwardRef` 引入 — Circular Dependency 解决方案的一部分

---

## 🟠 Cache Architecture（缓存架构）

### cache-architecture.module.ts
- **状态**: 🔴 需要决策 — 模块配置变更
- **差异汇总**:

| 条目 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| imports | `forwardRef(() => CommonModule)` | 无 `forwardRef` |
| providers | 不含 `RedisCacheService` | 含 `RedisCacheService` |
| exports | 不含 `RedisCacheService` | 含 `RedisCacheService` |

- **决策**: `RedisCacheService` 从 CommonModule 移到 CacheArchitectureModule — 确认 DI 依赖链完整，且 `@Global()` 装饰器确保全局可用

---

## 📊 总结

### 按层级统计

| 层级 | 一致 | 增强 | 需要决策 | 小计 |
|------|------|------|----------|------|
| Guards | 2 | 1 | 0 | 3 |
| Interceptors | 2 | 0 | 0 | 2 |
| Decorators | 4 | 0 | 0 | 4 |
| Filters | 1 | 0 | 0 | 1 |
| Pipes | 1 | 0 | 0 | 1 |
| Services (Common) | 9 | 2 | 0 | 11 |
| Controllers | 1 | 0 | 1 | 2 |
| Schedulers | 3 | 0 | 0 | 3 |
| Modules | 0 | 0 | 4 | 4 |
| Storage | 1 | 0 | 1 | 2 |
| PersonalSpace | 1 | 0 | 0 | 1 |
| PolicyEngine | 0 | 0 | 1 | 1 |
| **总计** | **25** | **3** | **7** | **35** |

### 🔴 需要决策的事项（7 项）

1. **CacheMonitorController 迁移** — `/api/cache/*` 端点确认在 cache-architecture 模块中可访问
2. **CommonModule 依赖精简** — `AuditLogModule`/`UsersModule`/`RedisCacheService` 移除后需确认无引用断裂
3. **Storage 接口抽象** — `IStorageProvider.getMetaData()` 的 Content-Type 覆盖 MIME 类型确认
4. **PolicyConfigController 移除** — 策略配置 CRUD API 端点需要补齐
5. **PolicyFactoryService 新增** — 确认是代码重组还是新功能
6. **RedisCacheService 模块迁移** — CacheArchitectureModule 直接提供 RedisCacheService 的 DI 链完整性
7. **ForwardRef 双向解除** — CommonModule ↔ CacheArchitectureModule ↔ PolicyEngineModule 的循环依赖已解决

### ✅ 结论

Guards、Interceptors、Decorators、Filters、Pipes、Schedulers、PersonalSpace 全部 **IDENTICAL**，重构未引入功能损失。Services 层差异属于功能增强（storage-cleanup + storage-manager）或接口抽象（permission + storage），均向后兼容。

核心关注点是 **模块间的依赖重组**（4 个 Module 配置变更）和 **PolicyConfigController 端点的恢复**，这是唯一明确的功能缺失风险点。