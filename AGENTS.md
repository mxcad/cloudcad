# AGENTS.md - CloudCAD 项目上下文

> **稳定规则 | 不随项目变动而改变**
> 一、**只要有1%的可能性适用，就必须调用 Skill (强制性)**
> 二、**涉及 API 定义或使用或修改，必须调用 api-contracts 技能 (强制性)**

---

## 元约束

| 约束 | 说明 |
|------|------|
| 100% 中文 | zh-CN 简体，技术术语可保留英文 |
| 100% pnpm | 禁止 npm/yarn |
| 100% PowerShell | Windows 环境 |
| 100% Express | NestJS 后端必须使用 Express |
| 100% 禁止 any | TypeScript 严格模式 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19.2.1 + Vite 6.2.0 + Tailwind CSS 4.1.18 |
| 后端 | NestJS 11.x + Prisma 7.1.0 |
| 数据库 | PostgreSQL + Redis |
| 运行时 | Node.js >= 20.19.5, pnpm >= 9.15.9 |

---

## Monorepo 包

| 包 | 端口 | 说明 |
|----|------|------|
| packages/backend | 3001 | NestJS 后端服务 |
| packages/frontend | 5173 | React 前端应用 |
| packages/config-service | 3002 | 部署配置中心 |
| packages/svnVersionTool | - | SVN 版本控制工具 |

---

## 模块索引

### 后端模块

| 模块 | 说明 | 详细文档 |
|------|------|----------|
| auth/users/roles/common | 认证授权 | [auth.md](documents/lcd/backend/auth.md) |
| file-system/storage/mxcad/version-control | 文件系统 | [file-system.md](documents/lcd/backend/file-system.md) |
| cache-architecture/redis/config/runtime-config | 缓存与配置 | [cache-config.md](documents/lcd/backend/cache-config.md) |
| admin/audit/fonts/gallery/health/policy-engine/database | 功能模块 | [features.md](documents/lcd/backend/features.md) |

### 前端模块

| 模块 | 说明 | 详细文档 |
|------|------|----------|
| pages | 页面组件 | [pages.md](documents/lcd/frontend/pages.md) |
| components | UI 组件 | [components.md](documents/lcd/frontend/components.md) |
| hooks | React Hooks | [hooks.md](documents/lcd/frontend/hooks.md) |
| services/stores/contexts/utils | 服务与工具 | [services.md](documents/lcd/frontend/services.md) |

### 共享文档

| 文档 | 说明 |
|------|------|
| [architecture.md](documents/lcd/shared/architecture.md) | 架构概览 |
| [guidelines.md](documents/lcd/shared/guidelines.md) | 开发规范 |
| [commands.md](documents/lcd/shared/commands.md) | 常用命令 |

---

## 强制技能触发

| 触发条件 | 技能 |
|----------|------|
| API 定义或修改 | api-contracts |
| 主题/CSS 变量 | perfect-theme-system |
| 后端配置修改 | config-management |
| 权限/角色 | permission-system |
| React 性能优化 | vercel-react-best-practices |
| UI/UX 设计 | ui-ux-pro-max |

---

## 可用技能

| 技能 | 用途 |
|------|------|
| api-contracts | API 契约一致性检查 |
| code-concise | 代码简洁性审查 |
| config-management | 后端配置管理规范 |
| perfect-theme-system | 主题系统设计规范 |
| permission-system | 权限系统规范 |
| ui-ux-pro-max | UI/UX 设计指南 |
| vercel-react-best-practices | React 性能最佳实践 |
| writing-documentation | 文档编写规范 |
| layered-context | 分层上下文文档生成 |
| find-skills | 技能发现与安装 |

---

**文档版本**: 4.0.0 (分层结构)
**更新日期**: 2026-03-27