# Frontend - CloudCAD

基于 React 19 + Vite 6 + Tailwind CSS 4 的现代化 Web CAD 应用前端。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.1 | UI 框架 |
| Vite | 6.2.0 | 构建工具 |
| Tailwind CSS | 4.1.18 | 样式框架 |
| TypeScript | 5.8.2 | 类型系统 |
| React Router | 7.10.1 | 路由管理 |
| Zustand | 5.0.10 | 状态管理 |
| Axios | 1.13.2 | HTTP 客户端 |
| React Hook Form | 7.68.0 | 表单处理 |
| Zod | 4.2.1 | 表单验证 |
| Recharts | 3.5.1 | 图表库 |
| Lucide React | 0.556.0 | 图标库 |
| Radix UI | - | 无头组件库 |
| mxcad-app | 1.0.45 | CAD 核心库 |

## 目录结构

```
packages/frontend/
├── public/                 # 静态资源
├── src/
│   ├── pages/             # 页面组件
│   ├── components/        # 通用 UI 组件
│   ├── hooks/             # 自定义 React Hooks
│   ├── services/          # API 服务层
│   ├── stores/            # Zustand 状态管理
│   ├── contexts/          # React Contexts
│   ├── utils/             # 工具函数
│   ├── types/             # TypeScript 类型定义
│   └── assets/            # 项目资源文件
├── index.html             # HTML 入口
├── package.json           # 依赖配置
├── tsconfig.json          # TypeScript 配置
├── vite.config.ts         # Vite 配置
└── vitest.config.ts       # 测试配置
```

## 开发

### 环境要求

- Node.js >= 20.19.5
- pnpm >= 9.15.9

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

开发服务器运行在 `http://localhost:3000`，会自动代理 `/api` 请求到后端服务 (`http://localhost:3001`)。

### 环境变量

复制 `.env.example` 到 `.env` 并配置：

```bash
# 应用配置
VITE_APP_NAME=梦想网页 CAD 实时协同平台
VITE_APP_LOGO=/logo.png
VITE_API_BASE_URL=/api
VITE_APP_COOPERATE_URL=http://localhost:3091
```

## 构建

```bash
# 生产构建
pnpm build

# 预览生产构建
pnpm preview
```

## 测试

```bash
# 运行所有测试
pnpm test

# 测试 UI 模式
pnpm test:ui

# 监听模式
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage
```

## 代码质量

```bash
# ESLint 检查
pnpm lint

# ESLint 自动修复
pnpm lint:fix

# Prettier 格式化
pnpm format

# Prettier 检查
pnpm format:check

# TypeScript 类型检查
pnpm type-check

# 完整检查（lint + format + type-check）
pnpm check

# 完整修复
pnpm check:fix
```

## 模块文档

- [页面组件](../../documents/lcd/frontend/pages.md) - 页面级组件文档
- [UI 组件](../../documents/lcd/frontend/components.md) - 通用组件文档
- [Hooks](../../documents/lcd/frontend/hooks.md) - 自定义 Hooks 文档
- [Services](../../documents/lcd/frontend/services.md) - API 服务文档

## 核心功能

### CAD 编辑器

基于 `mxcad-app` 集成的 Web CAD 编辑器，支持：

- DWG/DXF 文件浏览与编辑
- 矢量图形渲染
- 图层管理
- 视图操作（缩放、平移、旋转）

### 文件系统

- 项目管理
- 文件夹/文件树
- 文件上传/下载
- 文件预览

### 版本控制

- SVN 集成
- 版本历史
- 版本对比
- 版本回滚

### 权限管理

- 基于角色的访问控制 (RBAC)
- 资源级权限
- 操作级权限

### 用户界面

- 响应式设计
- 深色/浅色主题
- 可访问性支持
- 现代化 UI 组件库

## 项目约定

### 代码风格

- 使用 TypeScript 严格模式，禁止 `any`
- 使用 ES Modules (`import`/`export`)
- 使用函数组件 + Hooks
- 组件文件使用 `.tsx` 扩展名
- 工具函数文件使用 `.ts` 扩展名

### 命名规范

| 类型 | 命名风格 | 示例 |
|------|---------|------|
| 组件 | PascalCase | `UserProfile.tsx` |
| Hooks | camelCase + `use` 前缀 | `useAuth.ts` |
| 工具函数 | camelCase | `formatDate.ts` |
| 类型定义 | PascalCase | `User.ts` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL` |

### 路径别名

```typescript
import { Component } from '@/components/Component'
import { hook } from '@/hooks/hook'
import { service } from '@/services/service'
```

## 依赖说明

### 核心依赖

- **mxcad-app**: CAD 核心功能库
- **axios** + **openapi-client-axios**: API 客户端，支持 OpenAPI 自动生成
- **zustand**: 轻量级状态管理
- **react-router-dom**: 客户端路由

### UI 组件

- **Radix UI**: 无头组件库，提供可访问性支持
- **Lucide React**: 现代化图标库
- **class-variance-authority**: 组件变体管理
- **tailwind-merge** + **clsx**: 样式合并工具

### 表单处理

- **react-hook-form**: 高性能表单库
- **zod**: Schema 验证
- **@hookform/resolvers**: Zod 适配器

### 图表

- **recharts**: 基于 D3 的图表库

### 文件上传

- **webuploader**: 百度开源的文件上传库
- **spark-md5**: 文件 MD5 计算

## 故障排查

### 开发服务器启动失败

```bash
# 清理 node_modules 并重新安装
rm -rf node_modules
pnpm install

# 检查端口占用
netstat -ano | findstr :3000
```

### 构建失败

```bash
# 增加 Node.js 内存限制
node --max-old-space-size=8192 node_modules/vite/bin/vite.js build
```

### TypeScript 类型错误

```bash
# 运行类型检查
pnpm type-check

# 清理并重新生成类型定义
pnpm openapi-typescript
```

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
