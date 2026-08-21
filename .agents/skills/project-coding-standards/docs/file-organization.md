# 文件与目录约定

创建新文件时，必须遵守以下目录结构。不要随意在陌生位置创建文件。

## 前端 `packages/frontend/src/`

| 内容类型 | 目录 | 说明 |
|---------|------|------|
| 通用 UI 组件 | `components/ui/` | Button, Modal, Table, Form, Pagination 等 |
| 领域组件 | `components/<domain>/` | 如 `cad-editor/`, `file-system-manager/`, `project-management/` |
| 页面 | `pages/` | 对应路由的一级页面组件 |
| 自定义 Hooks | `hooks/` | `useXxx` 命名的 hook，可按子目录分组 |
| Zustand Stores | `stores/` | 以 `Store` 后缀命名的 store 文件 |
| 工具函数 | `utils/` | 纯函数工具 |
| 类型定义 | `types/` | 全局类型，模块级类型就近放 `<module>/types.ts` |
| API SDK | `api-sdk/` | 自动生成，禁止手动编辑 |
| 样式 | `styles/` | 全局样式 (`app.css`, `theme.css`)，组件级样式用 CSS Modules |
| 配置 | `config/` | 应用配置（路由、tour、api 等） |
| Context | `contexts/` | React Context（Theme, Sidebar, Notification 等） |
| 常量 | `constants/` | `layers.ts`, `permissions.ts`, `storage.constants.ts` |
| 资源 | `assets/` | 静态图片、图标、字体 |

## 后端 `packages/backend/src/`

| 内容类型 | 目录 | 说明 |
|---------|------|------|
| 功能模块 | `modules/<feature>/` | 每个模块自包含：controller, service, dto, module |
| 公共能力 | `common/` | guards, interceptors, pipes, exceptions, services, schedulers |
| 配置 | `config/` | 配置模块 |
| 协作服务 | `cooperation/` | WebSocket 相关 |
| Prisma | `prisma/` | PrismaService + 工具 |
| 入口 | `main.ts` | 应用启动 |

## 模块内部结构（后端）

```
modules/<feature>/
├── <feature>.module.ts       # NestJS Module — 注册 providers/exports
├── <feature>.controller.ts   # Controller — 路由委托
├── <feature>.service.ts      # Service — 业务逻辑
├── dto/
│   └── xxx.dto.ts            # DTO — class-validator 装饰器
├── types.ts                  # 模块级类型（可选）
└── constants.ts              # 模块级常量/Token（可选）
```

## 禁止事项

- ❌ 将类型定义写在组件/Controller 文件内 — 抽到独立 `types.ts`
- ❌ 在组件文件中定义另一个组件 — 会导致 re-mounting
- ❌ 在 `src/` 根目录随意创建新文件夹 — 先确认是否已有合适目录
- ❌ 将服务端代码放入前端目录，反之亦然
- ❌ 手动编辑 `api-sdk/` 下自动生成的文件
