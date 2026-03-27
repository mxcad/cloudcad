# 缓存与配置模块

## 模块概览

| 模块 | 路径 | 说明 |
|------|------|------|
| cache-architecture | `packages/backend/src/cache-architecture/` | 多级缓存架构 |
| redis | `packages/backend/src/redis/` | Redis 服务 |
| config | `packages/backend/src/config/` | 配置管理 |
| runtime-config | `packages/backend/src/runtime-config/` | 运行时配置 |

---

## cache-architecture 模块

**路径**: `packages/backend/src/cache-architecture/`

### 缓存层级

| 层级 | 存储 | 特点 |
|------|------|------|
| L1 | 内存 | 最快，进程内 |
| L2 | Redis | 跨进程共享 |
| L3 | 数据库 | 持久化 |

### 核心组件

- `multi-level-cache.service.ts`: 多级缓存统一接口
- `cache-monitor.service.ts`: 缓存监控
- `cache-warmup.service.ts`: 缓存预热

---

## redis 模块

**路径**: `packages/backend/src/redis/`

### 核心组件

- `redis.service.ts`: Redis 客户端封装

### 用途

- Session 存储
- 缓存层
- 令牌黑名单

---

## config 模块

**路径**: `packages/backend/src/config/`

### 核心组件

- `configuration.ts`: 配置加载
- `app.config.ts`: 应用配置

### 配置来源

1. 环境变量
2. .env 文件
3. 默认值

---

## runtime-config 模块

**路径**: `packages/backend/src/runtime-config/`

### 核心组件

- `runtime-config.controller.ts`: 配置 API
- `runtime-config.service.ts`: 运行时配置管理

### 特点

- 存储在数据库 + Redis
- 修改立即生效，无需重启
- 支持热更新

---

## 双配置中心架构

| 配置类型 | 服务 | 端口 | 存储 | 生效方式 |
|----------|------|------|------|----------|
| 部署配置 | config-service | 3002 | .env 文件 | 需重启 |
| 运行时配置 | backend | 3001 | 数据库 + Redis | 立即生效 |
