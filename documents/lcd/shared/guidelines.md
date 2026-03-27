# 开发规范

## 元约束

| 约束 | 说明 |
|------|------|
| 100% 中文 | zh-CN 简体，技术术语可保留英文 |
| 100% pnpm | 禁止 npm/yarn |
| 100% PowerShell | Windows 环境，命令符合 PowerShell 规范 |
| 100% Express | NestJS 后端必须使用 Express 平台 |
| 100% 禁止 any | TypeScript 严格模式 |

## 行为准则

| 准则 | 说明 |
|------|------|
| 技术优先 | 优先考虑技术准确性，而非迎合用户 |
| 不猜测 | 仅回答基于事实的信息，不进行推测 |
| 保持一致 | 不轻易改变已设定的行为模式 |
| 承认局限 | 在不确定时主动承认局限性 |
| 专注执行 | 专注于解决问题，而非解释过程 |

## 禁止事项

| 禁止项 | 说明 |
|--------|------|
| 禁止 npm/yarn | 必须使用 pnpm |
| 禁止 any | TypeScript 严格模式 |
| 禁止组件内定义组件 | 会导致每次渲染重新挂载 |
| 禁止 Prisma 模糊类型 | 必须明确字段类型 |
| 禁止硬编码颜色值 | 必须使用 CSS 变量 |

## 强制技能触发

| 触发条件 | 技能 |
|----------|------|
| API 定义或修改 | api-contracts |
| 主题/CSS 变量 | perfect-theme-system |
| 后端配置修改 | config-management |
| 权限/角色 | permission-system |
| React 性能优化 | vercel-react-best-practices |
| UI/UX 设计 | ui-ux-pro-max |
