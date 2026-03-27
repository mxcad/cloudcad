# 常用命令

## 开发

```powershell
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务
pnpm build            # 构建所有包
pnpm type-check       # 类型检查
pnpm check            # 代码检查
pnpm check:fix        # 自动修复
```

## 数据库

```powershell
cd packages/backend
pnpm db:generate      # 生成 Prisma Client
pnpm db:push          # 同步数据库结构
pnpm db:migrate       # 运行迁移
pnpm db:studio        # 打开 Prisma Studio
pnpm db:seed          # 数据库种子
```

## 测试

```powershell
cd packages/backend
pnpm test             # 运行所有测试
pnpm test:cov         # 测试覆盖率
pnpm test:unit        # 单元测试
pnpm test:integration # 集成测试
pnpm test:permission  # 权限测试
```

## 生成器

```powershell
pnpm generate:frontend-permissions  # 生成前端权限常量
pnpm generate:api-types             # 生成 API 类型定义
```

## 部署

```powershell
pnpm deploy           # Docker 部署
pnpm deploy:down      # 停止部署
pnpm deploy:reset     # 重置部署
pnpm deploy:logs      # 查看日志
pnpm deploy:rebuild   # 重新构建
```

## 离线打包

```powershell
pnpm pack:offline:win    # Windows 离线包
pnpm pack:offline:linux  # Linux 离线包
pnpm pack:offline:all    # 所有平台
```
