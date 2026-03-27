# CloudCAD

基于 Web 的 CAD 协作平台，支持在线编辑、版本控制和团队协作。

## 特性

- **在线 CAD 编辑** - 基于 mxcad 的 Web CAD 编辑器
- **文件系统管理** - 项目、文件夹、文件的完整管理
- **版本控制** - 集成 SVN 版本管理
- **权限管理** - 基于角色的访问控制 (RBAC)
- **实时协作** - 多用户协作支持
- **双配置中心** - 部署配置与运行时配置分离

## 许可证

**本软件采用自定义开源许可证。非商业使用需遵守以下要求：**

- ✅ 允许个人学习、研究、测试
- ⚠️ **修改源代码后必须贡献回原项目**
- ⚠️ **再分发时必须公开完整源代码**
- ❌ 禁止商业使用（需单独授权）

详见 [LICENSE](./LICENSE) 文件。商业授权请联系：710714273@qq.com

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React + Vite + Tailwind CSS | 19.2 / 6.2 / 4.1 |
| 后端 | NestJS + Express | 11.x |
| 数据库 | PostgreSQL + Prisma | 7.1 |
| 缓存 | Redis | - |
| 运行时 | Node.js | >= 20.19.5 |
| 包管理 | pnpm | >= 9.15.9 |

## 项目结构

```
cloudcad/
├── packages/
│   ├── backend/        # NestJS 后端服务 (端口 3001)
│   ├── frontend/       # React 前端应用 (端口 5173)
│   ├── config-service/ # 部署配置中心 (端口 3002)
│   └── svnVersionTool/ # SVN 版本控制工具
├── docker/             # Docker 部署配置
├── runtime/            # 运行时配置与脚本
└── scripts/            # 构建与部署脚本
```

## 环境要求

- Node.js >= 20.19.5
- pnpm >= 9.15.9
- PostgreSQL
- Redis

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev
```

后端服务运行在 `http://localhost:3001`，前端应用运行在 `http://localhost:5173`。

## 常用命令

### 开发

```bash
pnpm dev          # 启动开发服务
pnpm build        # 构建所有包
pnpm check        # 代码检查（lint + format + type-check）
pnpm check:fix    # 自动修复代码问题
```

### 数据库

```bash
cd packages/backend
pnpm db:generate   # 生成 Prisma Client
pnpm db:push       # 同步数据库结构
pnpm db:migrate    # 运行迁移
pnpm db:studio     # 打开 Prisma Studio
```

### 测试

```bash
cd packages/backend
pnpm test              # 运行所有测试
pnpm test:cov          # 测试覆盖率
pnpm test:permission   # 权限测试
```

### 部署

```bash
pnpm deploy           # Docker 部署
pnpm deploy:down      # 停止部署
pnpm deploy:logs      # 查看日志
```

### 离线打包

```bash
pnpm pack:offline:win     # Windows 离线包
pnpm pack:offline:linux   # Linux 离线包
```

## 文档

- [部署说明](DEPLOYMENT.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证

Custom License - 成都梦想凯德科技有限公司

本软件仅供非商业用途。商业使用需获取授权许可。

- **公司**: 成都梦想凯德科技有限公司
- **网站**: https://www.mxdraw.com/
- **邮箱**: 710714273@qq.com

详见 [LICENSE](LICENSE) 文件。
