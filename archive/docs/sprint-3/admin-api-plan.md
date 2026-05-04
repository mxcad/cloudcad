# 管理后台 API 最小可用集规划

> 生成时间: 2026-05-02
> 分析范围: 69 个"暂不确定"接口

---

## 一、概述

### 1.1 筛选结果

从 69 个"暂不确定"接口中，筛选出管理后台必需接口 **25 个**，占比约 **36%**。

| 分类 | 保留 | 废弃 | 合并/待定 | 小计 |
|------|------|------|-----------|------|
| 用户管理 | 3 | 1 | 1 | 5 |
| 角色管理 | 2 | 1 | 2 | 5 |
| 审计日志 | 0 | 0 | 0 | 0 |
| 缓存监控 | 6 | 15 | 0 | 21 |
| 系统配置 | 0 | 0 | 0 | 0 |
| 策略管理 | 7 | 0 | 0 | 7 |
| 存储/文件 | 5 | 9 | 1 | 15 |
| 其他 | 2 | 14 | 0 | 16 |
| **合计** | **25** | **40** | **4** | **69** |

### 1.2 最小可用集（25 个接口）

```
用户管理（3 个）
├── PATCH  /api/users/{id}/status         # 启用/禁用用户
├── GET    /api/users/search/by-email     # 按邮箱搜索用户
└── GET    /api/users/stats/me            # 用户统计

角色管理（2 个）
├── GET    /api/roles/category/{category} # 按分类获取角色
└── GET    /api/roles/project-roles/{id} # 获取项目角色

缓存监控（6 个）
├── GET    /api/cache-monitor/summary     # 缓存摘要
├── GET    /api/cache-monitor/stats      # 缓存统计
├── GET    /api/cache-monitor/health     # 缓存健康状态
├── GET    /api/cache-monitor/performance # 缓存性能
├── POST   /api/cache-monitor/cleanup    # 清理缓存
└── POST   /api/cache-monitor/refresh    # 刷新缓存

策略管理（7 个）
├── GET    /api/policy-config             # 获取策略列表
├── GET    /api/policy-config/{id}       # 获取策略详情
├── POST   /api/policy-config            # 创建策略
├── PUT    /api/policy-config/{id}       # 更新策略
├── DELETE /api/policy-config/{id}       # 删除策略
├── PUT    /api/policy-config/{id}/enable  # 启用策略
└── PUT    /api/policy-config/{id}/disable # 禁用策略

文件/存储管理（5 个）
├── GET    /api/file-system/personal-space/by-user/{userId}  # 用户个人空间
├── POST   /api/file-system/projects/{projectId}/transfer   # 项目转移
├── POST   /api/file-system/projects/{projectId}/members/batch # 批量成员管理
├── PATCH  /api/file-system/projects/{projectId}/members/batch # 更新批量成员
└── GET    /api/file-system/quota                         # 存储配额查询

MxCAD 相关（2 个）
├── GET    /api/mxcad/thumbnail/{nodeId}   # 获取缩略图
└── POST   /api/mxcad/thumbnail/{nodeId}   # 生成缩略图
```

---

## 二、详细分析

### 2.1 用户管理

| 接口 | 建议 | 说明 |
|------|------|------|
| PATCH /api/users/{id}/status | **保留** | 管理员启用/禁用用户账户，核心管理功能 |
| GET /api/users/search/by-email | **保留** | 按邮箱精确查找用户，便于账号找回和审计 |
| GET /api/users/stats/me | **保留** | 用户统计仪表盘数据，支持管理决策 |
| POST /api/users/deactivate-account | **合并** | 合并至 PATCH /users/{id}/status |
| PATCH /api/users/{id}/status | **废弃** | 接口已存在，无需重复 |

**合并方案**：
- `PATCH /api/users/{id}/status` 支持 `action: 'activate' | 'deactivate'`

---

### 2.2 角色管理

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/roles/category/{category} | **保留** | 按分类筛选角色（系统角色/项目角色） |
| GET /api/roles/project-roles/{id} | **保留** | 获取项目级角色配置 |
| GET /api/roles/project-roles/{id}/permissions | **合并** | 合并至 GET /api/roles/{id}/permissions |
| DELETE /api/roles/{id} | **废弃** | 角色删除涉及权限变更，建议软删除 |

**合并方案**：
- `GET /api/roles/{id}/permissions` 增加 `scope: 'system' | 'project'` 参数

---

### 2.3 缓存监控（Cache Monitor）

> 管理后台必须具备缓存监控能力，建议精简至 6 个核心接口。

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/cache-monitor/summary | **保留** | 缓存总览，管理员首页展示 |
| GET /api/cache-monitor/stats | **保留** | 详细统计数据 |
| GET /api/cache-monitor/health | **保留** | 健康检查，发现问题 |
| GET /api/cache-monitor/performance | **保留** | 命中率、响应时间等 |
| POST /api/cache-monitor/cleanup | **保留** | 手动清理缓存 |
| POST /api/cache-monitor/refresh | **保留** | 刷新缓存数据 |
| GET /api/cache-monitor/hot-data | **废弃** | 建议合并至 summary |
| GET /api/cache-monitor/performance-trend | **废弃** | 建议合并至 performance |
| GET /api/cache-monitor/size-trend | **废弃** | 建议合并至 stats |
| GET /api/cache-monitor/warnings | **废弃** | 建议合并至 health |
| GET /api/cache-monitor/value | **废弃** | 调试接口，不暴露给管理前端 |
| POST /api/cache-monitor/value | **废弃** | 调试接口 |
| DELETE /api/cache-monitor/value | **废弃** | 调试接口 |
| DELETE /api/cache-monitor/values | **废弃** | 调试接口 |
| DELETE /api/cache-monitor/pattern | **废弃** | 调试接口 |
| GET /api/cache-monitor/warmup/config | **废弃** | 预热配置由系统内部管理 |
| POST /api/cache-monitor/warmup/config | **废弃** | 同上 |
| POST /api/cache-monitor/warmup/trigger | **废弃** | 同上 |
| GET /api/cache-monitor/warmup/history | **废弃** | 同上 |
| GET /api/cache-monitor/warmup/stats | **废弃** | 同上 |
| DELETE /api/cache-monitor/warmup/history | **废弃** | 同上 |

**合并方案**：
```
GET /api/cache-monitor/summary  → 包含 hot-data、warnings 摘要
GET /api/cache-monitor/stats    → 包含 size-trend 数据
GET /api/cache-monitor/performance → 包含 performance-trend 数据
```

---

### 2.4 策略管理（Policy Config）

> 7 个接口全部保留，作为独立管理模块。

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/policy-config | **保留** | 策略列表，支持分页和过滤 |
| GET /api/policy-config/{id} | **保留** | 策略详情 |
| POST /api/policy-config | **保留** | 创建策略 |
| PUT /api/policy-config/{id} | **保留** | 更新策略 |
| DELETE /api/policy-config/{id} | **保留** | 删除策略 |
| PUT /api/policy-config/{id}/enable | **保留** | 启用策略 |
| PUT /api/policy-config/{id}/disable | **保留** | 禁用策略 |

**合并建议**：
- `PUT /api/policy-config/{id}/enable` 和 `PUT /api/policy-config/{id}/disable` 可合并为：
  - `PATCH /api/policy-config/{id}/status` with body `{ status: 'enabled' | 'disabled' }`

---

### 2.5 文件系统 / 存储管理

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/file-system/personal-space/by-user/{userId} | **保留** | 查看指定用户的存储空间使用情况 |
| POST /api/file-system/projects/{projectId}/transfer | **保留** | 项目所有权转移 |
| POST /api/file-system/projects/{projectId}/members/batch | **保留** | 批量添加项目成员 |
| PATCH /api/file-system/projects/{projectId}/members/batch | **保留** | 批量更新成员角色 |
| GET /api/file-system/quota | **保留** | 全局存储配额查询 |
| GET /api/file-system/projects/trash | **废弃** | 合并至回收站模块 |
| DELETE /api/file-system/projects/{projectId} | **废弃** | 项目删除应走审批流程 |
| GET /api/file-system/projects/{projectId}/trash | **废弃** | 合并至回收站模块 |
| DELETE /api/file-system/projects/{projectId}/trash | **废弃** | 同上 |
| POST /api/file-system/nodes | **废弃** | 文件节点创建走前端上传流程 |
| POST /api/file-system/nodes/{parentId}/folders | **废弃** | 文件夹创建走前端操作 |
| GET /api/file-system/nodes/{nodeId}/root | **废弃** | 内部接口 |
| POST /api/file-system/nodes/{nodeId}/restore | **废弃** | 合并至统一回收站恢复接口 |
| DELETE /api/file-system/trash | **废弃** | 已有确认使用的接口 |

**合并方案**：
- 回收站操作统一使用 `GET/POST/DELETE /api/file-system/trash` 系列

---

### 2.6 MxCAD 相关

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/mxcad/thumbnail/{nodeId} | **保留** | 查看 CAD 文件缩略图 |
| POST /api/mxcad/thumbnail/{nodeId} | **保留** | 重新生成缩略图 |
| GET /api/mxcad/files/{storageKey} | **废弃** | 文件访问走前端直接下载链接 |

---

### 2.7 图库模块（Library）— 全部废弃

> 图库操作（drawing/block）建议全部废弃或迁移至文件管理模块。

| 接口 | 建议 | 说明 |
|------|------|------|
| POST /api/library/drawing/upload | **废弃** | 统一走文件上传接口 |
| POST /api/library/drawing/files/upload-chunk | **废弃** | 同上 |
| POST /api/library/drawing/folders | **废弃** | 同上 |
| DELETE /api/library/drawing/nodes/{nodeId} | **废弃** | 同上 |
| PATCH /api/library/drawing/nodes/{nodeId} | **废弃** | 同上 |
| POST /api/library/drawing/nodes/{nodeId}/move | **废弃** | 同上 |
| POST /api/library/drawing/nodes/{nodeId}/copy | **废弃** | 同上 |
| POST /api/library/drawing/save/{nodeId} | **废弃** | 同上 |
| POST /api/library/drawing/save-as | **废弃** | 同上 |
| GET /api/library/drawing/nodes/{nodeId}/download | **废弃** | 同上 |
| POST /api/library/block/upload | **废弃** | 同上 |
| POST /api/library/block/files/upload-chunk | **废弃** | 同上 |
| POST /api/library/block/folders | **废弃** | 同上 |
| DELETE /api/library/block/nodes/{nodeId} | **废弃** | 同上 |
| PATCH /api/library/block/nodes/{nodeId} | **废弃** | 同上 |
| POST /api/library/block/nodes/{nodeId}/move | **废弃** | 同上 |
| POST /api/library/block/nodes/{nodeId}/copy | **废弃** | 同上 |
| POST /api/library/block/save/{nodeId} | **废弃** | 同上 |
| POST /api/library/block/save-as | **废弃** | 同上 |
| GET /api/library/block/nodes/{nodeId}/download | **废弃** | 同上 |

---

### 2.8 其他废弃接口

| 接口 | 建议 | 说明 |
|------|------|------|
| GET /api/public-file/access/{hash}/{filename} | **废弃** | 公开访问接口，不属于管理范畴 |
| GET /api/public-file/access/{filename} | **废弃** | 同上 |
| POST /api/file-system/files/upload | **废弃** | 文件上传走统一接口 |
| POST /api/users/me/restore | **废弃** | 用户自助恢复，不属于管理后台 |
| GET /api/cache/stats | **废弃** | 合并至 cache-monitor |
| POST /api/cache/clear | **废弃** | 合并至 cache-monitor |
| POST /api/cache/warmup | **废弃** | 合并至 cache-monitor |
| POST /api/cache/warmup/user/{userId} | **废弃** | 同上 |
| POST /api/cache/warmup/project/{projectId} | **废弃** | 同上 |

---

## 三、废弃接口汇总（40 个）

```
废弃接口清单：
├── session (3)          → 已有 JWT 认证
│   ├── POST /api/session/create
│   ├── GET  /api/session/user
│   └── POST /api/session/destroy
├── library (20)         → 统一至文件管理
│   ├── drawing (9)
│   └── block (11)
├── cache (5)            → 合并至 cache-monitor
│   ├── GET  /api/cache/stats
│   ├── POST /api/cache/clear
│   ├── POST /api/cache/warmup
│   ├── POST /api/cache/warmup/user/{userId}
│   └── POST /api/cache/warmup/project/{projectId}
├── file-system (9)      → 合并至现有接口
│   ├── GET  /api/file-system/projects/trash
│   ├── DELETE /api/file-system/projects/{projectId}
│   └── ...
├── mxcad (1)            → 保留缩略图接口
│   └── GET  /api/mxcad/files/{storageKey}
├── public-file (2)      → 公开接口非管理范畴
│   ├── GET  /api/public-file/access/{hash}/{filename}
│   └── GET  /api/public-file/access/{filename}
├── cache-monitor warmup (6) → 系统内部管理
└── 其他 (4)
    ├── POST /api/users/me/restore
    ├── PATCH /api/users/{id}/status (重复)
    └── ...
```

---

## 四、管理后台 API 总体规划建议

### 4.1 模块划分

```
管理后台 API（最小可用集）
├── 用户管理 (User Management)
│   ├── 已有: 用户 CRUD、搜索、删除恢复
│   └── 新增: PATCH /users/{id}/status, GET /users/search/by-email, GET /users/stats/me
│
├── 角色管理 (Role Management)
│   ├── 已有: 角色 CRUD、权限管理
│   └── 新增: GET /roles/category/{category}, GET /roles/project-roles/{id}
│
├── 审计日志 (Audit Logs)
│   └── 已有: 日志查询、统计、清理
│
├── 缓存监控 (Cache Monitor)
│   ├── 新增: GET /cache-monitor/summary
│   ├── 新增: GET /cache-monitor/stats
│   ├── 新增: GET /cache-monitor/health
│   ├── 新增: GET /cache-monitor/performance
│   ├── 新增: POST /cache-monitor/cleanup
│   └── 新增: POST /cache-monitor/refresh
│
├── 策略管理 (Policy Config)
│   └── 新增: 完整的 CRUD + 启用/禁用 (7 个接口)
│
├── 存储管理 (Storage Management)
│   ├── 已有: 配额查询、更新
│   └── 新增: 用户空间查询、项目转移、批量成员管理
│
├── 系统健康 (System Health)
│   └── 已有: health、db、storage 健康检查
│
└── 字体管理 (Font Management)
    └── 已有: 字体 CRUD
```

### 4.2 优先级排序

| 优先级 | 模块 | 接口数 | 说明 |
|--------|------|--------|------|
| P0 | 用户管理 | 3 | 核心管理功能 |
| P0 | 角色管理 | 2 | 权限体系基础 |
| P0 | 审计日志 | 4 | 安全合规必需（已有） |
| P1 | 缓存监控 | 6 | 系统维护必需 |
| P1 | 策略管理 | 7 | 业务策略配置 |
| P1 | 存储管理 | 5 | 资源管理 |
| P2 | 系统健康 | 3 | 运维监控（已有） |
| P2 | 字体管理 | 4 | 资产配置（已有） |

### 4.3 合并与简化建议

| 原接口 | 合并至 | 说明 |
|--------|--------|------|
| POST /users/deactivate-account | PATCH /users/{id}/status | 增加 action 字段 |
| PUT /policy-config/{id}/enable | PATCH /policy-config/{id}/status | 统一状态操作 |
| PUT /policy-config/{id}/disable | PATCH /policy-config/{id}/status | 统一状态操作 |
| GET /roles/project-roles/{id}/permissions | GET /roles/{id}/permissions | 增加 scope 参数 |

### 4.4 新增接口建议

| 接口 | 说明 |
|------|------|
| GET /admin/stats | 管理员仪表盘汇总统计 |
| GET /admin/permissions/cache | 权限缓存状态查询 |
| POST /admin/permissions/cache/cleanup | 权限缓存清理 |
| DELETE /admin/permissions/cache/user/{userId} | 单用户缓存清理 |
| GET /admin/permissions/user/{userId} | 用户权限详情查询 |

---

## 五、实施计划

### Phase 1: 核心管理接口（P0-P1）
- [ ] 用户管理：补充 3 个接口
- [ ] 角色管理：补充 2 个接口
- [ ] 策略管理：实现 7 个接口（或精简至 5 个）

### Phase 2: 运维管理接口（P1）
- [ ] 缓存监控：实现 6 个核心接口
- [ ] 存储管理：补充 4 个接口

### Phase 3: 废弃清理
- [ ] 删除 session 模块（3 个接口）
- [ ] 删除 library 模块（20 个接口）
- [ ] 清理 cache 模块多余接口（5 个）
- [ ] 清理其他废弃接口

### Phase 4: 合并优化
- [ ] 合并策略管理 enable/disable 为 PATCH status
- [ ] 合并角色权限查询接口
- [ ] 合并用户停用接口

---

## 六、附录：接口清单对照表

### 保留接口（25 个）

| 模块 | 接口 | 方法 | 说明 |
|------|------|------|------|
| 用户管理 | /api/users/{id}/status | PATCH | 启用/禁用用户 |
| 用户管理 | /api/users/search/by-email | GET | 按邮箱搜索用户 |
| 用户管理 | /api/users/stats/me | GET | 用户统计 |
| 角色管理 | /api/roles/category/{category} | GET | 按分类获取角色 |
| 角色管理 | /api/roles/project-roles/{id} | GET | 获取项目角色 |
| 缓存监控 | /api/cache-monitor/summary | GET | 缓存摘要 |
| 缓存监控 | /api/cache-monitor/stats | GET | 缓存统计 |
| 缓存监控 | /api/cache-monitor/health | GET | 缓存健康状态 |
| 缓存监控 | /api/cache-monitor/performance | GET | 缓存性能 |
| 缓存监控 | /api/cache-monitor/cleanup | POST | 清理缓存 |
| 缓存监控 | /api/cache-monitor/refresh | POST | 刷新缓存 |
| 策略管理 | /api/policy-config | GET | 获取策略列表 |
| 策略管理 | /api/policy-config | POST | 创建策略 |
| 策略管理 | /api/policy-config/{id} | GET | 获取策略详情 |
| 策略管理 | /api/policy-config/{id} | PUT | 更新策略 |
| 策略管理 | /api/policy-config/{id} | DELETE | 删除策略 |
| 策略管理 | /api/policy-config/{id}/enable | PUT | 启用策略 |
| 策略管理 | /api/policy-config/{id}/disable | PUT | 禁用策略 |
| 存储管理 | /api/file-system/personal-space/by-user/{userId} | GET | 用户个人空间 |
| 存储管理 | /api/file-system/projects/{projectId}/transfer | POST | 项目转移 |
| 存储管理 | /api/file-system/projects/{projectId}/members/batch | POST | 批量添加成员 |
| 存储管理 | /api/file-system/projects/{projectId}/members/batch | PATCH | 批量更新成员 |
| 存储管理 | /api/file-system/quota | GET | 存储配额查询 |
| MxCAD | /api/mxcad/thumbnail/{nodeId} | GET | 获取缩略图 |
| MxCAD | /api/mxcad/thumbnail/{nodeId} | POST | 生成缩略图 |

### 废弃接口（40 个）

| 模块 | 数量 | 说明 |
|------|------|------|
| session | 3 | JWT 替代 |
| library | 20 | 统一至文件管理 |
| cache | 5 | 合并至 cache-monitor |
| file-system | 9 | 合并至现有接口 |
| mxcad | 1 | 仅保留缩略图 |
| public-file | 2 | 非管理范畴 |
| cache-monitor warmup | 6 | 系统内部管理 |
| 其他 | 4 | 重复/调试接口 |

### 合并建议（4 个）

| 原接口 | 合并至 | 合并后 |
|--------|--------|--------|
| POST /users/deactivate-account | PATCH /users/{id}/status | PATCH /users/{id}/status { action: 'deactivate' } |
| PUT /policy-config/{id}/enable | PATCH /policy-config/{id}/status | PATCH /policy-config/{id}/status { status: 'enabled' } |
| PUT /policy-config/{id}/disable | PATCH /policy-config/{id}/status | PATCH /policy-config/{id}/status { status: 'disabled' } |
| GET /roles/project-roles/{id}/permissions | GET /roles/{id}/permissions | GET /roles/{id}/permissions?scope=project |
