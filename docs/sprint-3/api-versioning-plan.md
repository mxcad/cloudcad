---
title: API 版本化方案
date: 2026-05-02
author: API Versioning Team
---

# API 版本化方案

## 概述

本文档记录了 CloudCAD 后端 API 的完整路由扫描结果，并提供版本化迁移方案。

---

## 一、当前 API 路由扫描结果

### 1.1 Controller 路由前缀清单

| Controller 文件 | 路由前缀 | 文件路径 |
|----------------|----------|----------|
| FileSystemController | `file-system` | `apps/backend/src/file-system/file-system.controller.ts` |
| MxCadController | `mxcad` | `apps/backend/src/mxcad/core/mxcad.controller.ts` |
| CacheMonitorController | `cache-monitor` | `apps/backend/src/cache-architecture/controllers/cache-monitor.controller.ts` |
| LibraryController | `library` | `apps/backend/src/library/library.controller.ts` |
| UsersController | `users` | `apps/backend/src/users/users.controller.ts` |
| RolesController | `roles` | `apps/backend/src/roles/roles.controller.ts` |
| PublicFileController | `public-file` | `apps/backend/src/public-file/public-file.controller.ts` |
| PolicyConfigController | `policy-config` | `apps/backend/src/policy-engine/controllers/policy-config.controller.ts` |
| AdminController | `admin` | `apps/backend/src/admin/admin.controller.ts` |
| RuntimeConfigController | `runtime-config` | `apps/backend/src/runtime-config/runtime-config.controller.ts` |
| FontsController | `font-management` | `apps/backend/src/fonts/fonts.controller.ts` |
| AuthController | `auth` | `apps/backend/src/auth/auth.controller.ts` |
| AuditLogController | `audit` | `apps/backend/src/audit/audit-log.controller.ts` |
| HealthController | `health` | `apps/backend/src/health/health.controller.ts` |
| VersionControlController | `version-control` | `apps/backend/src/version-control/version-control.controller.ts` |
| UserCleanupController | `user-cleanup` | `apps/backend/src/common/controllers/user-cleanup.controller.ts` |

### 1.2 当前完整 API 路径列表（无版本前缀）

基于 Controller 路由前缀，当前所有 API 路径如下：

#### 核心业务 API
- `/api/file-system/*` - 文件系统管理（项目、文件、目录操作）
- `/api/mxcad/*` - MxCAD 文件上传与转换
- `/api/library/*` - 公共资源库（图纸库、图块库）
- `/api/version-control/*` - 版本控制

#### 用户与权限 API
- `/api/users/*` - 用户管理
- `/api/roles/*` - 角色与权限管理

#### 认证 API
- `/api/auth/*` - 用户认证（登录、注册、Token刷新）

#### 系统管理 API
- `/api/admin/*` - 管理员操作
- `/api/runtime-config/*` - 运行时配置
- `/api/font-management/*` - 字体管理
- `/api/policy-config/*` - 权限策略配置
- `/api/user-cleanup/*` - 用户数据清理

#### 监控与审计 API
- `/api/cache-monitor/*` - 缓存监控
- `/api/audit/*` - 审计日志

#### 公共服务 API
- `/api/public-file/*` - 公开文件服务（无需认证）
- `/api/health/*` - 健康检查

#### 代理 API
- `/api/cooperate/*` - 协同服务代理

---

## 二、硬编码 API 路径扫描

### 2.1 前端代码中的硬编码路径

| 文件路径 | 硬编码路径 | 使用场景 |
|----------|-----------|----------|
| `apps/frontend/src/services/filesApi.ts` | `/file-system/nodes/{nodeId}/thumbnail` | 获取文件缩略图 |
| `apps/frontend/src/utils/fileUtils.ts` | `/file-system/nodes/{nodeId}/thumbnail` | 获取缩略图 URL |
| `apps/frontend/src/utils/fileUtils.ts` | `/file-system/nodes/{nodeId}/download` | 下载文件 |
| `apps/frontend/src/services/publicFileApi.ts` | `/public-file/file/check` | 检查文件是否存在 |
| `apps/frontend/src/services/publicFileApi.ts` | `/public-file/chunk/check` | 检查分片是否存在 |
| `apps/frontend/src/services/publicFileApi.ts` | `/public-file/chunk/upload` | 上传分片 |

### 2.2 脚本中的硬编码路径

| 文件路径 | 硬编码路径 | 使用场景 |
|----------|-----------|----------|
| `runtime/scripts/verify-deploy.js` | `/api/health/live` | 部署验证健康检查 |
| `runtime/scripts/cli.js` | `/api/health/live` | CLI 健康检查 |
| `runtime/scripts/batch-import-library.js` | `/api/auth/login` | 批量导入登录 |
| `runtime/scripts/batch-import-library.js` | `/api/mxcad/files/fileisExist` | 文件检查 |
| `runtime/scripts/batch-import-library.js` | `/api/mxcad/files/chunkisExist` | 分片检查 |
| `runtime/scripts/batch-import-library.js` | `/api/mxcad/files/uploadFiles` | 文件上传 |

---

## 三、API 版本化方案

### 3.1 版本化策略

采用 **URL Path 版本化** 方式，格式为：`/api/v{version}/{resource}`

### 3.2 版本化路径映射

| 当前路径 | 版本化后路径 | 版本号 | 说明 |
|----------|-------------|--------|------|
| `/api/auth/*` | `/api/v1/auth/*` | v1 | 用户认证 |
| `/api/users/*` | `/api/v1/users/*` | v1 | 用户管理 |
| `/api/roles/*` | `/api/v1/roles/*` | v1 | 角色管理 |
| `/api/file-system/*` | `/api/v1/file-system/*` | v1 | 文件系统 |
| `/api/mxcad/*` | `/api/v1/mxcad/*` | v1 | MxCAD 服务 |
| `/api/library/*` | `/api/v1/library/*` | v1 | 公共资源库 |
| `/api/version-control/*` | `/api/v1/version-control/*` | v1 | 版本控制 |
| `/api/admin/*` | `/api/v1/admin/*` | v1 | 管理员操作 |
| `/api/runtime-config/*` | `/api/v1/runtime-config/*` | v1 | 运行时配置 |
| `/api/font-management/*` | `/api/v1/font-management/*` | v1 | 字体管理 |
| `/api/policy-config/*` | `/api/v1/policy-config/*` | v1 | 策略配置 |
| `/api/user-cleanup/*` | `/api/v1/user-cleanup/*` | v1 | 用户清理 |
| `/api/cache-monitor/*` | `/api/v1/cache-monitor/*` | v1 | 缓存监控 |
| `/api/audit/*` | `/api/v1/audit/*` | v1 | 审计日志 |

### 3.3 保持不变的路径（无需版本化）

| 路径 | 说明 |
|------|------|
| `/api/public-file/*` | 公开文件服务，无版本依赖 |
| `/api/health/*` | 健康检查，运行时监控 |
| `/api/cooperate/*` | 协同服务代理，转发到其他服务 |

---

## 四、版本化迁移计划

### 4.1 迁移步骤

| 阶段 | 步骤 | 说明 |
|------|------|------|
| Phase 1 | 修改 Controller 装饰器 | 更新所有需要版本化的 Controller 的 `@Controller` 装饰器 |
| Phase 2 | 更新 NestJS 主应用配置 | 确认全局路由前缀配置 |
| Phase 3 | 更新前端 API 调用 | 修改前端代码中所有硬编码路径 |
| Phase 4 | 更新脚本和配置 | 更新部署脚本、测试脚本中的硬编码路径 |
| Phase 5 | 添加版本兼容层（可选） | 如需向后兼容，添加 `/api/*` 到 `/api/v1/*` 的重定向 |

### 4.2 Controller 修改清单

| Controller | 当前装饰器 | 修改后装饰器 |
|------------|-----------|-------------|
| AuthController | `@Controller('auth')` | `@Controller('v1/auth')` |
| UsersController | `@Controller('users')` | `@Controller('v1/users')` |
| RolesController | `@Controller('roles')` | `@Controller('v1/roles')` |
| FileSystemController | `@Controller('file-system')` | `@Controller('v1/file-system')` |
| MxCadController | `@Controller('mxcad')` | `@Controller('v1/mxcad')` |
| LibraryController | `@Controller('library')` | `@Controller('v1/library')` |
| VersionControlController | `@Controller('version-control')` | `@Controller('v1/version-control')` |
| AdminController | `@Controller('admin')` | `@Controller('v1/admin')` |
| RuntimeConfigController | `@Controller('runtime-config')` | `@Controller('v1/runtime-config')` |
| FontsController | `@Controller('font-management')` | `@Controller('v1/font-management')` |
| PolicyConfigController | `@Controller('policy-config')` | `@Controller('v1/policy-config')` |
| UserCleanupController | `@Controller('user-cleanup')` | `@Controller('v1/user-cleanup')` |
| CacheMonitorController | `@Controller('cache-monitor')` | `@Controller('v1/cache-monitor')` |
| AuditLogController | `@Controller('audit')` | `@Controller('v1/audit')` |

### 4.3 前端修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/services/filesApi.ts` | `getThumbnailUrl` 方法中的路径 |
| `src/utils/fileUtils.ts` | `getThumbnailUrl`、`getFilePreviewUrl` 等函数 |
| `src/services/publicFileApi.ts` | 所有 API 调用路径（保持不变，public-file 无需版本化） |
| `src/types/api-client.ts` | 自动生成的 API 客户端类型（需重新生成） |

---

## 五、向后兼容方案（可选）

如需支持旧版 API 调用，可以在主应用中添加重定向中间件：

```typescript
// main.ts - 添加兼容重定向
server.use('/api/auth', (req, res, next) => {
  if (!req.path.startsWith('/api/v1')) {
    res.redirect(301, `/api/v1${req.path}`);
  } else {
    next();
  }
});
```

---

## 六、总结

| 统计项 | 数量 |
|--------|------|
| Controller 总数 | 16 |
| 需要版本化的 Controller | 13 |
| 保持不变的 Controller | 3 |
| 硬编码路径位置 | 6 处（前端 + 脚本） |

---

**文档版本**: v1.0  
**创建日期**: 2026-05-02  
**适用分支**: `refactor/circular-deps`