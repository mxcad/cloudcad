# CloudCAD Backend

CloudCAD 后端服务，基于 NestJS 框架构建的 CAD 协同设计平台 API 服务。

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| NestJS | 11.x | 后端框架 |
| Prisma | 7.1.0 | ORM |
| PostgreSQL | - | 主数据库 |
| Redis | - | 缓存/Session |
| Passport | - | 认证中间件 |
| Swagger | - | API 文档 |

## 目录结构

```
src/
├── admin/              # 管理员功能
├── audit/              # 审计日志
├── auth/               # 认证授权（JWT、邮箱验证、密码重置）
├── cache-architecture/ # 多级缓存架构（L1/L2/L3）
├── common/             # 公共模块（守卫、拦截器、装饰器、管道）
├── config/             # 配置管理
├── database/           # 数据库连接
├── file-system/        # 文件系统（项目、文件夹、文件管理）
├── fonts/              # 字体库管理
├── gallery/            # 图库管理
├── health/             # 健康检查
├── mxcad/              # CAD 编辑器集成（文件转换、外部参照）
├── personal-space/     # 个人空间
├── policy-engine/      # 权限策略引擎
├── redis/              # Redis 服务
├── roles/              # 角色管理
├── runtime-config/     # 运行时配置中心
├── storage/            # 存储服务
├── users/              # 用户管理
└── version-control/    # SVN 版本控制
```

## 快速开始

### 环境要求

- Node.js >= 20.19.5
- pnpm >= 9.15.9
- PostgreSQL
- Redis

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
# 复制环境变量模板
copy .env.example .env

# 编辑 .env 文件，配置数据库、Redis 等连接信息
```

### 数据库初始化

```bash
# 生成 Prisma Client
pnpm db:generate

# 同步数据库结构
pnpm db:push

# 运行种子数据（创建初始管理员账户）
pnpm db:seed
```

### 启动服务

```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm build
pnpm start:prod
```

服务默认运行在 `http://localhost:3001`

## 数据库命令

```bash
# 生成 Prisma Client
pnpm db:generate

# 同步数据库结构（开发环境）
pnpm db:push

# 运行迁移（生产环境）
pnpm db:migrate

# 打开 Prisma Studio
pnpm db:studio

# 数据库种子
pnpm db:seed
```

## 测试

```bash
# 运行所有测试
pnpm test

# 测试覆盖率
pnpm test:cov

# 单元测试
pnpm test:unit

# 集成测试
pnpm test:integration

# 权限测试
pnpm test:permission

# E2E 测试
pnpm test:e2e
```

## 代码质量

```bash
# 代码检查
pnpm check

# 自动修复
pnpm check:fix

# 类型检查
pnpm type-check
```

## API 文档

启动服务后访问 Swagger 文档：

- 开发环境: `http://localhost:3001/api`

## 核心功能

### 认证授权

- JWT 认证 + Refresh Token
- 邮箱验证
- 密码重置
- Session 管理

### 权限系统

- 基于角色的访问控制（RBAC）
- 角色层级继承
- 系统角色与项目角色分离
- 权限策略引擎（时间/IP/设备策略）

### 文件系统

- 统一的 FileSystemNode 模型
- 项目/文件夹/文件树形结构
- 软删除与回收站
- 文件哈希去重
- SVN 版本控制集成

### 多级缓存

- L1: 内存缓存（进程内）
- L2: Redis 缓存（跨进程）
- L3: 数据库缓存（持久化）
- 缓存预热与版本管理

### CAD 编辑器集成

- DWG/DXF 文件转换（mxweb 格式）
- 缩略图生成
- 外部参照管理
- 分片上传

## 配置说明

主要配置项（详见 `.env.example`）：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 3001 |
| `DATABASE_URL` | 数据库连接字符串 | - |
| `REDIS_HOST` | Redis 主机 | localhost |
| `JWT_SECRET` | JWT 密钥 | - |
| `FILES_DATA_PATH` | 文件存储路径 | filesData |

## 部署

详见项目根目录 [DEPLOYMENT.md](../../DEPLOYMENT.md)

## 许可证

**本软件采用自定义开源许可证。非商业使用需遵守以下要求：**

- ✅ 允许个人学习、研究、测试
- ⚠️ **修改源代码后必须贡献回原项目**
- ⚠️ **再分发时必须公开完整源代码**
- ❌ 禁止商业使用（需单独授权）

- **公司**: 成都梦想凯德科技有限公司
- **网站**: https://www.mxdraw.com/
- **邮箱**: 710714273@qq.com

详见 [LICENSE](../../LICENSE) 文件。商业授权请联系：710714273@qq.com
