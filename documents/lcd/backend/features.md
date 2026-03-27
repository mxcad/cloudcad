# 功能模块

## 模块概览

| 模块 | 路径 | 说明 |
|------|------|------|
| admin | `packages/backend/src/admin/` | 管理员功能 |
| audit | `packages/backend/src/audit/` | 审计日志 |
| fonts | `packages/backend/src/fonts/` | 字体库管理 |
| gallery | `packages/backend/src/gallery/` | 图库管理 |
| health | `packages/backend/src/health/` | 健康检查 |
| personal-space | `packages/backend/src/personal-space/` | 个人空间 |
| policy-engine | `packages/backend/src/policy-engine/` | 策略引擎 |
| database | `packages/backend/src/database/` | 数据库服务 |

---

## admin 模块

**路径**: `packages/backend/src/admin/`

### 功能

- 系统管理
- 用户管理
- 配置管理

---

## audit 模块

**路径**: `packages/backend/src/audit/`

### 核心组件

- `audit-log.controller.ts`: 审计日志 API
- `audit-log.service.ts`: 日志记录与查询

### 记录内容

- 用户操作
- 文件变更
- 权限变更

---

## fonts 模块

**路径**: `packages/backend/src/fonts/`

### 功能

- 字体上传
- 字体列表
- 字体删除

---

## gallery 模块

**路径**: `packages/backend/src/gallery/`

### 功能

- 图库管理
- 图片上传
- 图片分类

---

## health 模块

**路径**: `packages/backend/src/health/`

### 功能

- 服务健康检查
- 依赖状态检查 (数据库、Redis)

---

## policy-engine 模块

**路径**: `packages/backend/src/policy-engine/`

### 功能

- 策略定义
- 策略执行
- 规则评估

---

## database 模块

**路径**: `packages/backend/src/database/`

### 核心组件

- `database.service.ts`: 数据库连接管理
- `prisma/`: Prisma Schema 定义

### Prisma 模型位置

`packages/backend/prisma/schema.prisma`
