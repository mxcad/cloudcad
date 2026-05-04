# 权限收敛 Phase 2 方案设计

**汇报人**: Claude Code
**日期**: 2026-05-02
**基于**: `docs/permission-audit.md`（Phase 1 审计报告）
**分支**: refactor/circular-deps

---

## 一、分层策略：Controller Guard 全权负责，Service 层零权限检查

### 方案

采用 **"Controller Guard 负责放行请求，Service 层不再重复检查"** 方向。

这是 NestJS 官方推荐的做法，与当前项目中 Roles/Users/RuntimeConfig 等 5 个模块的成功实践一致。核心原则：

```
┌─ Controller Layer ──────────────────────┐
│  @UseGuards(JwtAuthGuard, PermissionsGuard)  │  ← 唯一权限检查点
│  @RequirePermissions(SYSTEM_CONFIG_READ)      │
│  handler() {                                   │  ← 纯业务逻辑
│    return this.service.method();               │
│  }                                             │
└──────────────────────────────────────────────┘
         │ 仅调用，不检查
         ▼
┌─ Service Layer ─────────────────────────┐
│  method() {                               │  ← 零权限检查
│    // 纯业务逻辑                           │
│  }                                         │
└──────────────────────────────────────────┘
```

### 理由

| 维度 | 当前状态（混用） | 目标（Guard 统一） |
|------|-----------------|-------------------|
| 职责分离 | Controller 做权限，Service 也做权限 | Controller 只做权限，Service 只做业务 |
| 可测试性 | Service 测试需要 mock 权限逻辑 | Service 测试只需 mock 数据依赖 |
| 权限变更 | 改权限规则需要改 Controller + Service | 改权限规则只需改 Controller/Guard |
| 审计路径 | 权限检查散落在两端，难以枚举 | 只看 Controller 装饰器即可枚举 |

### 例外规则

以下两种情况允许保留 Service 层权限检查：

1. **供多方调用的工具方法**（如 `FileDownloadExportService.checkFileAccess()`）：被多个 Controller 内联调用，移除检查会导致调用方都必须自己实现。这种情况下保留 Service 检查，但需用注释标注 `// INTERNAL CHECK: called from multiple controllers`
2. **定时任务/Scheduler 调用**：不走 HTTP 路由，没有 Controller Guard。需要在 Service 方法内部保留检查或由 Scheduler 自己做权限判断。

---

## 二、MxcadController 缺失 Guard 路由的权限保护方案

### 2.1 当前问题矩阵

审计发现 MxcadController 存在三种模式，12 个路由中只有 4 个使用了标准 Guard：

```
标准模式 (4):  chunkisExist, preloading, savemxweb, up_ext_reference_dwg
混合模式 (3):  fileisExist, checkDuplicate, uploadFiles  ← 只有JwtAuthGuard+内联
无保护   (5):  check-reference, refresh-external-refs, checkThumbnail,
               uploadThumbnail, getFile, up_ext_reference_image, getNonCadFile,
               getFilesDataFile
```

### 2.2 具体方案

#### 混合模式 → 标准模式（3 个路由）

将 `buildContextFromRequest` 中的内联权限检查提升为 Guard。

| 当前路由 | 当前保护 | 建议 Guard | 建议 `@RequireProjectPermission` | 操作 |
|---------|---------|-----------|-------------------------------|------|
| `fileisExist` | `JwtAuthGuard` + 内联 `buildContextFromRequest` | `RequireProjectPermissionGuard` | `FILE_OPEN` | 添加 Guard，移除内联检查 |
| `checkDuplicate` | `JwtAuthGuard` + 内联 `buildContextFromRequest` | `RequireProjectPermissionGuard` | `FILE_OPEN` | 添加 Guard，移除内联检查 |
| `uploadFiles` | `JwtAuthGuard` + 内联 `buildContextFromRequest` | `RequireProjectPermissionGuard` | `FILE_UPLOAD` | 添加 Guard，移除内联检查 |

**关键改动**：将 `buildContextFromRequest` 方法中的权限检查逻辑（`projectPermissionService.checkPermission` / `systemPermissionService.checkSystemPermission`）迁移到一个新的自定义 Guard 中，命名为 `ProjectContextGuard`。此 Guard 从请求参数/body 中提取 projectId 或 nodeId，然后调用 `ProjectPermissionService.checkPermission`。

#### 无保护 → 标准模式（8 个路由）

| 当前路由 | 当前保护 | 建议 Guard | 建议 `@RequireProjectPermission` | 风险 |
|---------|---------|-----------|-------------------------------|------|
| `check-reference` | 无 | `RequireProjectPermissionGuard` | `CAD_EXTERNAL_REFERENCE` | 低—外部参照操作需项目权限 |
| `refresh-external-refs` | 无 | `RequireProjectPermissionGuard` | `CAD_EXTERNAL_REFERENCE` | 低 |
| `up_ext_reference_image` | 无（但内联 `checkFileAccessPermission`） | `RequireProjectPermissionGuard` | `CAD_EXTERNAL_REFERENCE` | 低—与 up_ext_reference_dwg 对齐 |
| `checkThumbnail` | 无 | `JwtAuthGuard` + 内联 resource 检查 | `FILE_OPEN`（只读） | 中—缩略图不需要强权限，但需防信息泄露 |
| `uploadThumbnail` | 无 | `RequireProjectPermissionGuard` | `FILE_EDIT` 或 `FILE_UPLOAD` | 中 |
| `getNonCadFile` | 无（内联 `checkFileAccessPermission`） | `RequireProjectPermissionGuard` | `FILE_DOWNLOAD` | 低—内联检查已存在 |
| `getFile` | 无（内联 `checkFileAccessPermission`） | `RequireProjectPermissionGuard` | `FILE_DOWNLOAD` | 🔴 高—返回 mxweb 文件内容 |
| `getFilesDataFile` | `JwtAuthGuard`（内联 `checkFileAccessPermission`） | `RequireProjectPermissionGuard` | `FILE_DOWNLOAD` | 低 |

**关于 `checkThumbnail` 的特殊说明**：

缩略图端点有其特殊性：前端在文件列表中批量请求缩略图，每次都要做完整权限检查会带来性能开销。审计报告中 file-system.controller.ts 的缩略图端点同样存在此问题。建议方案：
- 保留当前内联检查（轻量级的 `checkFileAccess`）不移除
- 同时添加 `JwtAuthGuard` 确保至少已登录
- 不在缩略图端点使用 `RequireProjectPermissionGuard`（防止 Guard 层做全量权限查询拖慢列表加载）

### 2.3 `buildContextFromRequest` 提取策略

当前 `buildContextFromRequest` 是一个内联 helper 方法，从 request 中解析 projectId → 调用权限检查。建议：

**不提取为独立 Guard**，而是改为标准装饰器 + Guard 组合。原因：
- `buildContextFromRequest` 的功能分散在各个 handler 中，提取需要改动 3 个 handler 的签名
- 改为标准 Guard 后，每个 handler 的参数提取方式不同（有的从 query 取，有的从 body 取），不能复用同一个 Guard
- 最简洁的方案：为这 3 个 handler 各自添加 `@RequireProjectPermission(X)` + 对应 Guard，然后移除内联检查

---

## 三、消除双重检查

### 3.1 需要修改的 2 处双重检查

#### T1: SearchService.searchProjectFiles()

| 维度 | 值 |
|------|-----|
| **文件** | `packages/backend/src/file-system/search/search.service.ts` |
| **当前** | 调用 `permissionService.checkNodePermission()` (line ~42) |
| **Controller 保护** | `file-system.controller.ts` 搜索路由已有 `@RequireProjectPermission(FILE_OPEN)` |
| **方案** | 移除 `checkNodePermission()` 调用 |
| **风险** | 低—Controller Guard 已覆盖所有进入该 handler 的请求 |
| **工作量** | 0.5 小时 |

#### T2: FileDownloadExportService

| 维度 | 值 |
|------|-----|
| **文件** | `packages/backend/src/file-system/file-download/file-download-export.service.ts` |
| **当前** | `downloadNode()` 调用 `getNodeAccessRole()` (line 114)；`downloadNodeWithFormat()` 调用 `getNodeAccessRole()` (line 187) |
| **Controller 保护** | `file-system.controller.ts` 下载路由已有 `@RequireProjectPermission(FILE_DOWNLOAD)` |
| **方案** | 移除两个方法中的 `getNodeAccessRole()` 调用 |
| **注意** | `checkFileAccess()` 方法中的 `getNodeAccessRole()` 调用**保留**（该方法被多个 Controller 内联调用，属于"多方调用的工具方法"例外）|
| **风险** | 低—Controller Guard 已覆盖 |
| **工作量** | 1 小时 |

### 3.2 不需要修改的检查

| Service | 检查方法 | 理由 |
|---------|---------|------|
| `FileDownloadExportService.checkFileAccess()` | `getNodeAccessRole()` | 被多个 Controller 内联调用，属于例外规则 |
| `LibraryService` 中的 `checkSystemPermission()` | 系统权限 | 需要进一步审计确认 Controller 保护是否完整 |
| `FileSystemService.checkFileAccess()` | 委托调用 | 门面方法，自身不含权限逻辑 |

---

## 四、cache-monitor.controller.ts 保护方案

### 4.1 风险和收益评估

| 维度 | 内容 |
|------|------|
| **当前状态** | 21 个路由，零认证、零权限保护 |
| **暴露内容** | Redis 缓存指标（命中率、键数量、内存使用）、缓存项内容 |
| **风险等级** | 🟡 中—指标数据敏感度较低，但属于无认证通道 |
| **建议保护等级** | 只读监控，无需项目级或细粒度系统权限 |

### 4.2 建议方案

采用与 `health.controller.ts` 相同的保护模式：

```
@Controller('cache-monitor')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CacheMonitorController {
  ...
  
  @Get('stats')
  @RequirePermissions(SYSTEM_MONITOR)  // 与 health controller 复用同一权限
  async getStats() { ... }
}
```

| 改动 | 内容 | 工作量 |
|------|------|--------|
| 添加类级 `@UseGuards(JwtAuthGuard, PermissionsGuard)` | 1 行 | 5 分钟 |
| 为敏感路由添加 `@RequirePermissions(SYSTEM_MONITOR)` | 每个路由 1 行 | 30 分钟 |
| 公开路由（如 `ping`）标记 `@Public()` | 每个 1 行 | 5 分钟 |

**细化建议**：
- `GET /stats`, `GET /keys`, `GET /memory` 等指标路由 → `@RequirePermissions(SYSTEM_MONITOR)`（只读）
- `DELETE /cache/clear` 等写操作 → `@RequirePermissions(SYSTEM_CONFIG_WRITE)`（需要写权限）
- `GET /ping` → `@Public()`（健康检查级公开）

### 4.3 为什么不用项目级权限

cache-monitor 是基础设施层面，不属于任何项目。系统级监控权限（`SYSTEM_MONITOR`）是最合适的粒度。

---

## 五、执行顺序和预估工作量

### Phase 2 执行顺序

```
Phase 2a: 快速清理（低风险，无行为变更）
├── T1: 移除 SearchService 双重检查         0.5h
├── T2: 移除 FileDownloadExportService 双重检查  1h
├── T3: cache-monitor 添加 JwtAuthGuard       1h
└── 验证: tsc --noEmit + 运行相关测试       0.5h
                                             ─────
                                              3h

Phase 2b: MxcadController 标准化（中等风险）
├── T4: MxcadController 混合模式 → 标准 Guard   2h
│   ├── fileisExist: 添加 RequireProjectPermissionGuard
│   ├── checkDuplicate: 添加 RequireProjectPermissionGuard
│   └── uploadFiles: 添加 RequireProjectPermissionGuard
├── T5: MxcadController 无保护路由 → 标准 Guard  2.5h
│   ├── check-reference, refresh-external-refs → CAD_EXTERNAL_REFERENCE
│   ├── up_ext_reference_image → CAD_EXTERNAL_REFERENCE
│   ├── getNonCadFile, getFile, getFilesDataFile → FILE_DOWNLOAD
│   └── uploadThumbnail → FILE_EDIT
├── T6: 移除内联检查（buildContextFromRequest）   1h
└── 验证: tsc --noEmit + 运行相关测试           0.5h
                                             ─────
                                              6h

Phase 2c: 特殊端点处理（低风险）
├── T7: file-system 缩略图端点添加 JwtAuthGuard   1h
├── T8: file-system 存储配额端点审计             0.5h
└── 验证: tsc --noEmit + 运行相关测试           0.5h
                                             ─────
                                              2h

总计:                                          11h
```

### 风险对照表

| 任务 | 风险等级 | 回滚难度 | 影响面 |
|------|---------|---------|--------|
| T1 移除 SearchService 双重检查 | 🟢 低 | 低（单行代码） | 仅 SearchService |
| T2 移除 FileDownloadExportService 双重检查 | 🟢 低 | 低 | 仅下载服务 |
| T3 cache-monitor 加 Guard | 🟢 低 | 低（装饰器） | 仅管理后台 |
| T4 MxcadController 混合模式转标准 | 🟡 中 | 中（涉及参数提取） | MxcadController 3 个路由 |
| T5 MxcadController 无保护转标准 | 🟡 中 | 中 | MxcadController 7 个路由 |
| T7 file-system 缩略图 | 🟢 低 | 低（1 个端点） | 仅缩略图 |

### 不做什么

| 被排除的项 | 原因 |
|-----------|------|
| **将 MxcadController 中 `buildContextFromRequest` 提取为独立 Guard** | 3 个 handler 参数提取方式不同，提取为 Guard 反而增加复杂度。直接改为标准装饰器更简洁 |
| **FileDownloadExportService.checkFileAccess() 移除内联检查** | 该方法被多个 Controller 内联调用，属于例外规则 |
| **搜索端点改为与 Guard 不同的权限级别** | 当前 FILE_OPEN 是最低合理级别，不需要更改 |
| **cache-monitor 做细粒度项目级权限** | 基础设施监控不属于任何项目，SYSTEM_MONITOR 已足够 |
| **缩略图端点添加完整的 RequireProjectPermissionGuard** | 前端批量请求场景下 Guard 的权限查询会拖慢加载性能，保留当前轻量级内联检查 |

---

## 六、验收标准

Phase 2 完成后应满足：

1. **Controller 审计清单零异常**：17 个 Controller 中不再有无保护或仅 JwtAuthGuard 的路由（认证端点和公开文件端点除外）
2. **Service 层零双重检查**：SearchService 和 FileDownloadExportService 不再有 Guard 已覆盖的内联权限检查
3. **cache-monitor 零暴露**：所有 cache-monitor 路由至少有 `JwtAuthGuard`
4. **MxcadController 模式统一**：12 个路由全部使用标准 Guard，不再有"仅 JwtAuthGuard + 内联"的混合模式
5. **`npx tsc --noEmit` 通过**：无编译错误
6. **影响范围可控**：仅修改 Controller 和 Service 的权限相关代码，不修改业务逻辑

---

*文档版本: 1.0.0 | 预计执行时间: 11 小时*
