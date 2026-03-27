# AGENTS.md - CloudCAD 项目上下文

> **稳定规则 | 不随项目变动而改变**

---

## 1. 元约束

| 约束            | 说明                                   |
| --------------- | -------------------------------------- |
| 100% 中文       | zh-CN 简体，技术术语可保留英文         |
| 100% pnpm       | 禁止 npm/yarn                          |
| 100% PowerShell | Windows 环境，命令符合 PowerShell 规范 |
| 100% Express    | NestJS 后端必须使用 Express 平台       |
| 100% 禁止 any   | TypeScript 严格模式                    |

---

## 2. 行为准则

| 准则     | 说明                             |
| -------- | -------------------------------- |
| 技术优先 | 优先考虑技术准确性，而非迎合用户 |
| 不猜测   | 仅回答基于事实的信息，不进行推测 |
| 保持一致 | 不轻易改变已设定的行为模式       |
| 承认局限 | 在不确定时主动承认局限性         |
| 专注执行 | 专注于解决问题，而非解释过程     |

---

## 3. 强制技能触发规则

| 触发条件 | 必须调用的技能 |
|----------|----------------|
| 涉及 API 定义或使用或修改 | api-contracts |
| 涉及主题、颜色、CSS 变量、深色/亮色模式、UI 样式规范 | perfect-theme-system |
| 涉及后端配置添加或修改（环境变量、配置项、读取配置） | config-management |
| 涉及权限、角色、访问控制 | permission-system |
| 涉及 React 组件性能、数据获取、渲染优化 | vercel-react-best-practices |
| 涉及 UI/UX 设计、组件布局、交互体验 | ui-ux-pro-max |
| 涉及 Prisma Schema 修改（创建表、修改字段、外键关系、事务、软删除） | prisma-database |

---

## 4. 禁止事项

| 禁止项 | 说明 |
|--------|------|
| 禁止 npm/yarn | 必须使用 pnpm |
| 禁止 any | TypeScript 严格模式 |
| 禁止组件内定义组件 | 会导致每次渲染重新挂载 |
| 禁止 Prisma 模糊类型 | 必须明确字段类型 |
| 禁止硬编码颜色值 | 必须使用 CSS 变量 |

---

## 5. 项目上下文

**技术栈**: React 19 + Vite 6 + Tailwind CSS 4 + NestJS + Prisma + PostgreSQL + Redis

**Monorepo 包**:
- `packages/backend` - NestJS 后端 (端口 3001)
- `packages/frontend` - React 前端
- `packages/config-service` - 部署配置中心
- `packages/svnVersionTool` - SVN 版本控制

---

**文档版本**: 2.1.0
**更新日期**: 2026-03-27