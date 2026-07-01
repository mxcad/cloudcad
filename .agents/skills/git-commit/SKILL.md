---
name: git-commit
description: AUTO-TRIGGER on: git 提交, commit, 提交代码, 提交修改. CloudCAD monorepo 的 Git 提交规范工作流。
---

# Git 提交工作流

> CloudCAD monorepo 的 Git 提交规范和自动化工作流。

## 提交前必检

```
1. pnpm check（前端）/ pnpm verify（后端）— 确保代码质量
2. git status — 查看变更范围
3. git diff — 确认改动内容
4. git log --oneline -5 — 了解提交风格
```

## 提交规范（Conventional Commits）

格式：`<type>(<scope>): <description>`

### Type 类型

| Type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(billing): add WeChat payment webhook` |
| `fix` | Bug 修复 | `fix(auth): resolve token refresh race condition` |
| `refactor` | 重构（不改功能） | `refactor(file-system): extract FileTreeService` |
| `style` | 样式/UI 调整 | `style(sidebar): fix tab switching jump` |
| `chore` | 构建/工具/依赖 | `chore: update pnpm lockfile` |
| `docs` | 文档 | `docs: update AGENTS.md mobile section` |
| `test` | 测试 | `test(billing): add payment gateway unit tests` |
| `perf` | 性能优化 | `perf(query): add index for file tree traversal` |
| `ci` | CI/CD | `ci: add type-check to workflow` |
| `revert` | 回滚 | `revert: revert "feat(billing): add MWEB flow"` |

### Scope 范围

| Scope | 包/模块 |
|-------|---------|
| `frontend` | packages/frontend |
| `mobile` | packages/frontend_mobile |
| `backend` | packages/backend |
| `config-service` | packages/config-service |
| `billing` | 计费模块 |
| `auth` | 认证模块 |
| `file-system` | 文件系统模块 |
| `mxcad` | CAD 编辑器核心 |
| `permission` | 权限系统 |
| `library` | 图纸库/图块库 |
| `collab` | 协同功能 |
| `version` | 版本控制 |

### Description 规范

- 使用英文，首字母小写，不加句号
- 简洁描述**为什么**做了这个改动，而非**做了什么**
- 长度 ≤ 72 字符

```bash
# ✅ 好的提交信息
feat(billing): add MWEB payment redirect flow
fix(mobile): resolve auto-join retry loop not stopping
refactor(file-system): simplify getActionGroups to {main, destructive}

# ❌ 不好的提交信息
feat: added payment   # 太模糊
fix: bug fix          # 没有信息量
Update index.ts       # 没有 type 和 scope
```

## 批量提交工作流

当有多个不相关的修改时，按功能分组提交：

```bash
# 1. 查看所有变更
git status --short

# 2. 按功能分组暂存
git add packages/frontend/src/components/billing/
git commit -m "feat(billing): add WeChat payment button"

git add packages/backend/src/billing/
git commit -m "feat(billing): implement payment gateway factory"

# 3. 剩余杂项
git add .
git commit -m "chore: update lockfile and config"
```

## 特殊提交场景

### Prisma schema 变更

```bash
# 必须同时提交 schema 和 migration
git add packages/backend/prisma/schema.prisma
git add packages/backend/prisma/migrations/
git commit -m "feat(user): add wechatId field for WeChat login"
```

### API SDK 自动生成

```bash
# SDK 文件是自动生成的，单独提交
git add packages/frontend/src/api-sdk/
git add packages/frontend_mobile/src/api-sdk/
git commit -m "chore: regenerate API SDK from Swagger"
```

### 移动端 i18n 编译

```bash
# i18n 编译产物单独提交
git add packages/frontend_mobile/src/languages/
git commit -m "chore(mobile): compile i18n translations"
```

## 快速提交命令

```bash
# 查看当前状态
git status --short

# 查看变更统计
git diff --stat

# 查看最近 5 次提交
git log --oneline -5

# 查看当前分支
git branch --show-current
```

## 禁止提交的内容

| ❌ 禁止 | 原因 |
|---------|------|
| `.env` / `.env.local` | 包含密钥和敏感信息 |
| `node_modules/` | 依赖目录 |
| `dist/` / `build/` | 构建产物 |
| 手动修改的 `*.gen.ts` | 自动生成文件 |
| `data/backups/` | 数据库备份 |
| `*.sql` 除非是 migration | SQL 备份文件 |

## 分支策略

- `main` — 生产分支
- `feature/*` — 功能分支
- `fix/*` — 修复分支
- 合并前确保 `pnpm check` 通过
