# 认证授权模块

## 模块概览

| 模块 | 路径 | 说明 |
|------|------|------|
| auth | `packages/backend/src/auth/` | 认证授权核心 |
| users | `packages/backend/src/users/` | 用户管理 |
| roles | `packages/backend/src/roles/` | 角色管理 |
| common | `packages/backend/src/common/` | 公共组件 |

---

## auth 模块

**路径**: `packages/backend/src/auth/`

### 核心组件

- `auth.controller.ts`: 认证 API 端点
- `auth.service.ts`: 认证业务逻辑
- `jwt.strategy.ts`: JWT 策略
- `refresh-token.strategy.ts`: 刷新令牌策略
- `guards/`: 认证守卫

### 集成点

- 依赖: DatabaseModule, RedisModule
- 被依赖: 所有需要认证的模块

---

## users 模块

**路径**: `packages/backend/src/users/`

### 核心组件

- `users.controller.ts`: 用户管理 API
- `users.service.ts`: 用户 CRUD 操作

### 集成点

- 依赖: AuthModule, RolesModule
- 被依赖: 审计、权限检查

---

## roles 模块

**路径**: `packages/backend/src/roles/`

### 核心组件

- `roles.controller.ts`: 角色 API
- `roles.service.ts`: 角色 CRUD、权限分配

### 权限模型

- RBAC (基于角色的访问控制)
- 支持角色层级继承
- 系统角色不可删除

---

## common 模块

**路径**: `packages/backend/src/common/`

### 核心组件

- `guards/`: 权限守卫 (roles.guard, permissions.guard)
- `decorators/`: 自定义装饰器
- `filters/`: 异常过滤器
- `interceptors/`: 响应拦截器
- `pipes/`: 验证管道
- `services/`: 公共服务 (permission.service, storage-manager.service)

### 关键服务

- `permission.service.ts`: 权限检查核心逻辑
- `permission-cache.service.ts`: 权限缓存
- `role-inheritance.service.ts`: 角色继承处理
