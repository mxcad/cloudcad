# CloudCAD API 端点追踪结果

> 生成时间: 2026-05-02  
> 追踪范围: apps/frontend/src 目录下的所有前端源码  
> 基准文档: docs/api-final-status.md

---

## 追踪摘要

- 原"暂不确定"端点总数: 69
- 确认使用: 7
- 确认未使用: 48
- 模块级保留建议: 14

---

## 端点追踪详情

### 用户相关 (users)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/users/search/by-email | ✅ 有 | usersApi.ts 定义，但页面未直接调用 | 保留（预留功能） |
| GET /api/users/stats/me | ✅ 有 | Dashboard.tsx 第 250 行 | 保留 |
| PATCH /api/users/{id}/status | ❌ 无 | - | 删除 |
| POST /api/users/deactivate-account | ✅ 有 | Profile.tsx 注销账户功能 | 保留 |
| POST /api/users/me/restore | ❌ 无 | - | 删除 |

### 角色相关 (roles)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/roles/category/{category} | ❌ 无 | - | 删除 |
| GET /api/roles/project-roles/{id} | ❌ 无 | - | 删除 |

### 文件系统相关 (file-system)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/file-system/personal-space/by-user/{userId} | ❌ 无 | - | 删除 |
| GET /api/file-system/projects/trash | ❌ 无 | - | 删除 |
| PATCH /api/file-system/projects/{projectId} | ❌ 无 | - | 删除 |
| DELETE /api/file-system/projects/{projectId} | ❌ 无 | - | 删除 |
| GET /api/file-system/projects/{projectId}/trash | ❌ 无 | - | 删除 |
| POST /api/file-system/nodes/{nodeId}/restore | ❌ 无 | - | 删除 |
| DELETE /api/file-system/projects/{projectId}/trash | ❌ 无 | - | 删除 |
| POST /api/file-system/nodes | ❌ 无 | - | 删除 |
| POST /api/file-system/nodes/{parentId}/folders | ❌ 无 | - | 删除 |
| GET /api/file-system/nodes/{nodeId}/root | ❌ 无 | - | 删除 |
| POST /api/file-system/files/upload | ❌ 无 | - | 删除 |
| POST /api/file-system/projects/{projectId}/transfer | ❌ 无 | - | 删除 |
| POST /api/file-system/projects/{projectId}/members/batch | ❌ 无 | - | 删除 |
| PATCH /api/file-system/projects/{projectId}/members/batch | ❌ 无 | - | 删除 |

### 图库相关 (library)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/library/drawing/nodes/{nodeId}/download | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/folders | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/upload | ❌ 无 | - | 删除（使用 MxCAD 上传） |
| POST /api/library/drawing/files/upload-chunk | ❌ 无 | - | 删除（使用 MxCAD 上传） |
| DELETE /api/library/drawing/nodes/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| PATCH /api/library/drawing/nodes/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/nodes/{nodeId}/move | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/nodes/{nodeId}/copy | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/save/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/drawing/save-as | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| GET /api/library/block/nodes/{nodeId}/download | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/files/upload-chunk | ❌ 无 | - | 删除（使用 MxCAD 上传） |
| DELETE /api/library/block/nodes/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| PATCH /api/library/block/nodes/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/nodes/{nodeId}/move | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/nodes/{nodeId}/copy | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/folders | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/upload | ❌ 无 | - | 删除（使用 MxCAD 上传） |
| POST /api/library/block/save/{nodeId} | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |
| POST /api/library/block/save-as | ✅ 有 | libraryApi.ts 定义，LibraryManager 页面使用 | 保留 |

### MxCAD 相关

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/mxcad/thumbnail/{nodeId} | ❌ 无 | - | 删除 |
| POST /api/mxcad/thumbnail/{nodeId} | ❌ 无 | - | 删除 |
| GET /api/mxcad/files/{storageKey} | ❌ 无 | - | 删除 |

### 管理员相关 (admin)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/admin/permissions/cache | ❌ 无 | - | 删除 |
| POST /api/admin/permissions/cache/cleanup | ❌ 无 | - | 删除 |
| DELETE /api/admin/permissions/cache/user/{userId} | ❌ 无 | - | 删除 |
| GET /api/admin/permissions/user/{userId} | ❌ 无 | - | 删除 |

### 公共文件相关 (public-file)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/public-file/access/{hash}/{filename} | ✅ 有 | publicFileApi.ts 定义，mxcadManager 使用 | 保留 |
| GET /api/public-file/access/{filename} | ❌ 无 | - | 删除 |

---

## 模块级端点评估

### 缓存监控模块 (cache-monitor) - 共 21 个端点

**评估:** 前端未发现任何调用  
**API 定义位置:** apps/frontend/src/services/cacheApi.ts

| 端点 | 前端是否有调用 | 建议 |
|------|--------------|------|
| GET /api/cache-monitor/summary | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/stats | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/health | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/performance | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/hot-data | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/performance-trend | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/size-trend | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/warnings | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/value | ❌ 无 | 保留（预留监控功能） |
| POST /api/cache-monitor/value | ❌ 无 | 保留（预留监控功能） |
| DELETE /api/cache-monitor/value | ❌ 无 | 保留（预留监控功能） |
| DELETE /api/cache-monitor/values | ❌ 无 | 保留（预留监控功能） |
| DELETE /api/cache-monitor/pattern | ❌ 无 | 保留（预留监控功能） |
| POST /api/cache-monitor/refresh | ❌ 无 | 保留（预留监控功能） |
| POST /api/cache-monitor/cleanup | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/warmup/config | ❌ 无 | 保留（预留监控功能） |
| POST /api/cache-monitor/warmup/config | ❌ 无 | 保留（预留监控功能） |
| POST /api/cache-monitor/warmup/trigger | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/warmup/history | ❌ 无 | 保留（预留监控功能） |
| GET /api/cache-monitor/warmup/stats | ❌ 无 | 保留（预留监控功能） |
| DELETE /api/cache-monitor/warmup/history | ❌ 无 | 保留（预留监控功能） |

### 缓存操作模块 (cache)

| 端点 | 前端是否有调用 | 调用位置 | 建议 |
|------|--------------|---------|------|
| GET /api/cache/stats | ❌ 无 | - | 删除 |
| POST /api/cache/clear | ❌ 无 | - | 删除 |
| POST /api/cache/warmup | ❌ 无 | - | 删除 |
| POST /api/cache/warmup/user/{userId} | ❌ 无 | - | 删除 |
| POST /api/cache/warmup/project/{projectId} | ❌ 无 | - | 删除 |

### 策略配置模块 (policy-config) - 共 7 个端点

**评估:** 前端未发现任何调用

| 端点 | 前端是否有调用 | 建议 |
|------|--------------|------|
| POST /api/policy-config | ❌ 无 | 删除 |
| PUT /api/policy-config/{id} | ❌ 无 | 删除 |
| DELETE /api/policy-config/{id} | ❌ 无 | 删除 |
| GET /api/policy-config/{id} | ❌ 无 | 删除 |
| GET /api/policy-config | ❌ 无 | 删除 |
| PUT /api/policy-config/{id}/enable | ❌ 无 | 删除 |
| PUT /api/policy-config/{id}/disable | ❌ 无 | 删除 |

---

## 追踪统计

| 状态 | 数量 | 占比 |
|------|------|------|
| 确认使用 | 7 | 10.1% |
| 建议保留（模块级） | 21 | 30.4% |
| 建议删除 | 41 | 59.4% |
| **总计** | **69** | **100%** |

---

## 建议执行的清理操作

### 1. 可以安全删除的端点（41个）

#### 用户 & 角色模块 (6个)
- PATCH /api/users/{id}/status
- POST /api/users/me/restore
- GET /api/roles/category/{category}
- GET /api/roles/project-roles/{id}

#### 文件系统模块 (13个)
- GET /api/file-system/personal-space/by-user/{userId}
- GET /api/file-system/projects/trash
- PATCH /api/file-system/projects/{projectId}
- DELETE /api/file-system/projects/{projectId}
- GET /api/file-system/projects/{projectId}/trash
- POST /api/file-system/nodes/{nodeId}/restore
- DELETE /api/file-system/projects/{projectId}/trash
- POST /api/file-system/nodes
- POST /api/file-system/nodes/{parentId}/folders
- GET /api/file-system/nodes/{nodeId}/root
- POST /api/file-system/files/upload
- POST /api/file-system/projects/{projectId}/transfer
- POST /api/file-system/projects/{projectId}/members/batch
- PATCH /api/file-system/projects/{projectId}/members/batch

#### 图库模块 (3个)
- POST /api/library/drawing/upload
- POST /api/library/drawing/files/upload-chunk
- POST /api/library/block/files/upload-chunk
- POST /api/library/block/upload

#### MxCAD 模块 (3个)
- GET /api/mxcad/thumbnail/{nodeId}
- POST /api/mxcad/thumbnail/{nodeId}
- GET /api/mxcad/files/{storageKey}

#### 管理员模块 (4个)
- GET /api/admin/permissions/cache
- POST /api/admin/permissions/cache/cleanup
- DELETE /api/admin/permissions/cache/user/{userId}
- GET /api/admin/permissions/user/{userId}

#### 公共文件模块 (1个)
- GET /api/public-file/access/{filename}

#### 缓存操作模块 (5个)
- GET /api/cache/stats
- POST /api/cache/clear
- POST /api/cache/warmup
- POST /api/cache/warmup/user/{userId}
- POST /api/cache/warmup/project/{projectId}

#### 策略配置模块 (7个)
- POST /api/policy-config
- PUT /api/policy-config/{id}
- DELETE /api/policy-config/{id}
- GET /api/policy-config/{id}
- GET /api/policy-config
- PUT /api/policy-config/{id}/enable
- PUT /api/policy-config/{id}/disable

### 2. 建议保留的端点（28个）

#### 用户模块 (3个)
- GET /api/users/search/by-email（预留）
- GET /api/users/stats/me（Dashboard 使用）
- POST /api/users/deactivate-account（Profile 使用）

#### 图库模块 (14个)
- 所有图库 CRUD 操作（LibraryManager 页面使用）

#### 公共文件模块 (1个)
- GET /api/public-file/access/{hash}/{filename}

#### 缓存监控模块 (21个)
- 所有缓存监控端点（预留功能）

---

## 后续建议

1. **第一阶段:** 删除上述确认的41个废弃端点
2. **第二阶段:** 评估缓存监控模块是否需要在管理后台实现
3. **第三阶段:** 清理前端 API 定义文件中未使用的方法

---

## 附录: 关键代码位置参考

- Dashboard 页面: apps/frontend/src/pages/Dashboard.tsx
- Profile 页面: apps/frontend/src/pages/Profile.tsx
- LibraryManager 页面: apps/frontend/src/pages/LibraryManager.tsx
- SystemMonitor 页面: apps/frontend/src/pages/SystemMonitorPage.tsx
- usersApi: apps/frontend/src/services/usersApi.ts
- libraryApi: apps/frontend/src/services/libraryApi.ts
- cacheApi: apps/frontend/src/services/cacheApi.ts
- publicFileApi: apps/frontend/src/services/publicFileApi.ts
