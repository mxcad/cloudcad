# CloudCAD 项目概述

## 项目简介

CloudCAD 是一个基于云的CAD图纸管理平台，采用 monorepo 架构，专为B2B私有部署设计，提供用户管理、角色权限、云盘文件管理、项目创建、工作台、图块库、字体库、文件大小限制、分享功能等核心能力。

## 技术栈架构

### 后端技术栈（NestJS 栈）

- **框架**: NestJS 10+ (企业级Node.js框架)
- **语言**: TypeScript 5.0+ (强类型支持)
- **运行时**: Node.js 18+ LTS (长期支持版本)
- **Web引擎**: Fastify (推荐，性能优于Express)
- **数据库**: PostgreSQL 14+ (支持JSON字段，ACID特性)
- **ORM**: Prisma 5+ (类型安全的数据库访问)
- **异步队列**: BullMQ 5+ (基于Redis的作业队列)
- **消息中间件**: Redis 7+ (高性能缓存和消息队列)
- **文件存储**: 本地文件系统 (支持分布式扩展)
- **身份认证**: JWT双Token机制 (Access Token + Refresh Token)
- **权限控制**: RBAC + 项目级ACL (细粒度权限管理)
- **进程调用**: child_process.spawn (调用exe转换程序)
- **日志系统**: winston + nest-winston (结构化日志)
- **健康检查**: @nestjs/terminus (服务监控)
- **配置管理**: @nestjs/config (环境配置管理)
- **API文档**: Swagger UI (OpenAPI 3.0规范)
- **错误处理**: 全局Exception Filter (统一错误处理)

### 前端技术栈

- **框架**: React 19.2.1 + TypeScript
- **构建工具**: Vite 6.2.0 (快速构建工具)
- **路由**: React Router DOM 7.10.1
- **UI组件**: Lucide React 图标库
- **数据可视化**: Recharts 3.5.1
- **状态管理**: React Context + useReducer (轻量级状态管理)
- **HTTP客户端**: Axios (统一API调用)
- **包管理**: pnpm 8.6.0
- **代码规范**: Biome 2.3.8 (统一代码检查和格式化)

### 基础设施

- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx (静态资源服务和负载均衡)
- **监控**: Prometheus + Grafana (性能监控)
- **日志聚合**: ELK Stack (日志收集和分析)
- **CI/CD**: GitHub Actions (自动化构建和部署)

## 技术栈优化路线图

### P0优先级（立即实施）

1. **Web引擎升级**: Express → Fastify
   - 性能提升30-40%，内存占用更低
   - 更好的TypeScript支持

2. **文件存储优化**: 本地磁盘存储
   - 简化部署架构
   - 便于备份和迁移
   - 降低运维复杂度

3. **容器化部署**
   - 多阶段构建Docker镜像
   - Docker Compose本地开发环境
   - 标准化部署流程

### P1优先级（中期实施）

1. **数据库连接池优化**
   - Prisma连接池参数调优
   - 连接复用和超时控制

2. **缓存策略升级**
   - Redis集群配置
   - 多级缓存策略
   - 缓存预热和失效机制

3. **监控体系搭建**
   - Prometheus指标收集
   - Grafana可视化监控
   - 告警规则配置

### P2优先级（长期规划）

1. **微服务架构演进**
   - 图纸转换服务独立部署
   - 文件存储服务独立部署
   - 用户认证服务独立部署

2. **数据库分片策略**
   - 按项目ID分片
   - 读写分离
   - 历史数据归档

3. **前端架构优化**
   - 组件库标准化
   - 微前端架构探索
   - 性能优化和代码分割

## 项目结构

```
cloudcad/
├── packages/
│   ├── frontend/           # 前端应用 (cloudcad-manager)
│   │   ├── components/     # React组件
│   │   │   ├── Layout.tsx  # 主布局组件
│   │   │   └── ui/         # UI基础组件
│   │   ├── pages/          # 页面组件
│   │   │   ├── AssetLibrary.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── FileManager.tsx
│   │   │   ├── ProjectManager.tsx
│   │   │   ├── RoleManagement.tsx
│   │   │   └── UserManagement.tsx
│   │   ├── services/       # API服务层
│   │   │   ├── api.ts      # 统一API接口
│   │   │   └── mockDb.ts   # Mock数据库
│   │   ├── types.ts        # TypeScript类型定义
│   │   └── vite.config.ts  # Vite配置
│   └── backend/            # NestJS后端应用
│       ├── src/            # 源代码
│       │   ├── app.controller.ts    # 应用控制器
│       │   ├── app.module.ts        # 应用模块
│       │   ├── app.service.ts       # 应用服务
│       │   └── main.ts              # 应用入口
│       ├── test/            # 测试文件
│       ├── nest-cli.json   # NestJS CLI配置
│       ├── tsconfig.json   # TypeScript配置
│       └── package.json    # 后端依赖配置
├── biome.json             # Biome配置
├── BIOME_USAGE.md          # Biome使用指南
├── package.json           # 根项目配置
├── pnpm-workspace.yaml    # pnpm工作空间配置
└── tsconfig.json          # TypeScript配置
```

## 开发约定

### 代码规范

- 使用 TypeScript 进行类型安全开发
- 遵循 Biome 配置的代码风格
- 组件采用函数式组件和 Hooks
- 使用驼峰命名法，常量使用全大写加下划线

### 文件组织

- 单文件单组件原则
- 页面组件放在 `pages/` 目录
- 可复用组件放在 `components/` 目录
- API 相关逻辑放在 `services/` 目录
- 类型定义统一在 `types.ts` 文件中

### API架构

项目使用统一的API接口层，位于 `services/api.ts`，目前使用 Mock API (`mockDb.ts`) 进行数据模拟。API接口需要在三个层面同步实现：

1. apiContract - 接口契约定义
2. fetchAdapter - 真实API适配器
3. mockAdapter - Mock数据适配器

**重要**：不要直接使用 fetch，要通过统一的 API 接口层。

### 权限系统

- 基于角色的访问控制(RBAC)
- 权限枚举定义在 `Permission` 中
- 用户通过 `roleId` 关联角色
- 支持项目和资源库级别的访问控制

### 功能模块

1. **仪表板** (`Dashboard`) - 系统概览和统计
2. **项目管理** (`ProjectManager`) - CAD文件和项目管理
3. **文件管理** (`FileManager`) - 文件上传、下载和管理
4. **资源库** (`AssetLibrary`) - 图块库和字体库管理
5. **用户管理** (`UserManagement`) - 用户账号管理
6. **角色管理** (`RoleManagement`) - 权限角色管理

## 环境变量

在 `packages/frontend/.env.local` 中配置：

```
GEMINI_API_KEY=your_gemini_api_key
```

## 部署说明

### 端口配置

- **前端应用**: `http://localhost:3000` (支持热重载开发)
- **后端API**: `http://localhost:3001` (NestJS 开发服务器)

## NestJS 后端架构

### 核心概念

- **模块 (Modules)**: 应用程序的基本构建块
- **控制器 (Controllers)**: 处理传入请求并返回响应
- **服务 (Services)**: 业务逻辑实现
- **依赖注入 (DI)**: 自动管理组件依赖关系

### 项目结构说明

- `src/main.ts`: 应用程序入口点
- `src/app.module.ts`: 根模块，组织应用程序结构
- `src/app.controller.ts`: 根控制器，处理基础路由
- `src/app.service.ts`: 根服务，提供业务逻辑

### 开发约定

- 使用装饰器定义路由、参数和响应
- 遵循单一职责原则，每个模块负责特定功能
- 使用 TypeScript 强类型系统确保代码安全
- 通过依赖注入实现松耦合架构

## 部署架构

### Docker容器化部署

```dockerfile
# 后端Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start:prod"]
```

### Docker Compose配置

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3001:3001'
    environment:
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: cloudcad
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  files-data:
    image: busybox
    volumes:
      - files_data:/app/filesData

volumes:
  postgres_data:
  redis_data:
  files_data:
```

### 生产环境配置

- **负载均衡**: Nginx反向代理
- **SSL证书**: Let's Encrypt自动续期
- **监控告警**: Prometheus + Grafana + AlertManager
- **日志聚合**: ELK Stack (Elasticsearch + Logstash + Kibana)
- **备份策略**: 数据库定时备份 + 文件存储备份

## 性能优化策略

### 数据库优化

- 合理设计索引，提升查询性能
- 使用连接池，避免连接泄漏
- 实施读写分离，分担主库压力
- 定期维护和优化数据库表

### 缓存策略

- Redis缓存热点数据，减少数据库压力
- HTTP缓存头设置，优化浏览器缓存
- CDN加速静态资源访问
- 实施多级缓存策略

### 异步处理

- 使用BullMQ处理耗时任务
- 图纸转换任务异步化
- 邮件通知队列化处理
- 批量操作优化

## 安全最佳实践

### 认证授权

- JWT双Token机制，平衡安全性和用户体验
- 密码强度要求和定期更换策略
- 多因素认证支持
- 会话管理和超时控制

### 数据安全

- 敏感数据加密存储
- API接口权限验证
- SQL注入防护
- XSS和CSRF攻击防护

### 网络安全

- HTTPS强制加密传输
- 防火墙配置
- DDoS攻击防护
- 安全审计日志
