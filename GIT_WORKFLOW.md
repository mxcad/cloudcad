# Git 工作流指南

本文档描述了 CloudCAD 项目的 Git 工作流规范。所有贡献者都应遵循此工作流。

## 📋 分支模型

### 分支类型

| 分支类型 | 前缀 | 说明 | 命名示例 |
|----------|------|------|----------|
| 主分支 | `main` | 生产环境代码，始终可部署 | `main` |
| 开发分支 | `develop` | 开发集成分支 | `develop` |
| 功能分支 | `feature/` | 新功能开发 | `feature/user-auth` |
| 修复分支 | `fix/` | Bug 修复 | `fix/login-error` |
| 发布分支 | `release/` | 发布准备 | `release/v1.0.0` |
| 热修复分支 | `hotfix/` | 生产环境紧急修复 | `hotfix/critical-bug` |

### 分支结构

```
main ──────────────────────────────────────● (生产)
                    │                      │
                    │                      └── release/v1.0.0 merge
                    │                      │
develop ────────────●──────────────────────● (开发)
                   / \                     │
                  /   \                    │
         feature/A     feature/B           │
```

## 🚀 开发流程

### 1. 开始新功能

```bash
# 1. 切换到 develop 分支并更新
git checkout develop
git pull origin develop

# 2. 创建功能分支
git checkout -b feature/your-feature-name

# 3. 开始开发
# ... 编写代码 ...
```

### 2. 提交代码

#### 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### 类型说明

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响代码逻辑） |
| `refactor` | 重构（既不是新功能也不是 Bug 修复） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建工具、依赖管理等 |
| `ci` | CI/CD 配置 |
| `revert` | 回滚提交 |

#### 提交示例

```bash
# 新功能
git commit -m "feat(auth): 添加用户登录功能

- 实现用户名密码验证
- 添加 JWT token 生成
- 添加登录日志记录

Closes #123"

# Bug 修复
git commit -m "fix(file): 修复文件上传失败问题

- 修复大文件上传超时问题
- 添加上传进度显示

Fixes #456"
```

### 3. 保持分支更新

```bash
# 在功能分支上
git fetch origin
git rebase origin/develop
```

### 4. 完成功能开发

```bash
# 1. 确保代码通过所有检查
pnpm check
pnpm test

# 2. 推送到远程
git push origin feature/your-feature-name

# 3. 创建 Pull Request
# 在 GitHub/GitLab 上创建 PR，目标分支为 develop
```

## 🔀 Pull Request 流程

### 创建 PR

1. **选择正确的目标分支**
   - 功能开发 → `develop`
   - Bug 修复 → `develop`（紧急修复 → `main`）
   - 文档更新 → `develop`

2. **PR 标题规范**
   ```
   feat(auth): 添加用户登录功能
   fix(file): 修复文件上传失败问题
   ```

3. **PR 描述模板**
   ```markdown
   ## 变更说明
   - 变更 1
   - 变更 2

   ## 相关 Issue
   Closes #123

   ## 测试步骤
   1. 步骤 1
   2. 步骤 2

   ## 截图（如适用）
   [截图]
   ```

### PR 审查

1. **自动检查**
   - CI/CD 运行测试
   - 代码检查（ESLint、Prettier）
   - 类型检查（TypeScript）

2. **人工审查**
   - 至少 1 人审查
   - 审查代码质量
   - 审查测试覆盖

3. **合并要求**
   - 所有 CI 检查通过
   - 至少 1 人批准
   - 无未解决的评论

### 合并策略

| 场景 | 策略 |
|------|------|
| 功能分支 → develop | Squash and Merge |
| 修复分支 → develop | Squash and Merge |
| 发布分支 → main | Merge Commit |
| 热修复 → main | Squash and Merge |

## 📦 发布流程

### 版本命名

遵循语义化版本 (SemVer)：

```
主版本号。次版本号.修订号
  ↑        ↑        ↑
 不兼容   新功能   Bug 修复
 API 变更
```

### 发布步骤

```bash
# 1. 创建发布分支
git checkout develop
git checkout -b release/v1.0.0

# 2. 版本号更新
# 更新 package.json 中的版本号
# 更新 CHANGELOG.md

# 3. 测试验证
pnpm test
pnpm build

# 4. 合并到 main
git checkout main
git merge release/v1.0.0
git tag v1.0.0

# 5. 合并回 develop
git checkout develop
git merge release/v1.0.0

# 6. 推送
git push origin main --tags
git push origin develop
```

## 🔥 紧急修复

### 热修复流程

```bash
# 1. 从 main 创建热修复分支
git checkout main
git checkout -b hotfix/critical-fix

# 2. 修复问题
# ... 编写代码 ...

# 3. 提交
git commit -m "fix(critical): 修复关键问题"

# 4. 合并到 main
git checkout main
git merge hotfix/critical-fix
git tag v1.0.1

# 5. 合并到 develop
git checkout develop
git merge hotfix/critical-fix

# 6. 推送
git push origin main --tags
git push origin develop
```

## 🧹 分支清理

### 本地清理

```bash
# 删除已合并的本地分支
git branch --merged | grep -v "main\|develop" | xargs git branch -d

# 删除远程已删除的分支跟踪
git fetch -p
```

### 远程清理

```bash
# 删除远程功能分支（合并后）
git push origin --delete feature/your-feature-name
```

## ⚠️ 注意事项

### 禁止事项

| 禁止项 | 说明 |
|--------|------|
| ❌ 直接向 main 推送 | 必须通过 PR |
| ❌ 在 main 上开发 | 使用功能分支 |
| ❌ 强制推送到共享分支 | 会破坏他人历史 |
| ❌ 提交敏感信息 | 使用 .gitignore |
| ❌ 大文件提交 | 使用 Git LFS |

### 最佳实践

| 实践 | 说明 |
|------|------|
| ✅ 频繁提交 | 小步提交，便于回滚 |
| ✅ 及时更新 | 保持分支与 develop 同步 |
| ✅ 清晰描述 | 提交信息描述为什么变更 |
| ✅ 代码审查 | 认真对待每次审查 |
| ✅ 测试先行 | 确保测试通过再提交 |

## 🔧 常用命令

```bash
# 查看分支
git branch
git branch -a

# 创建分支
git checkout -b feature/name

# 切换分支
git checkout <branch-name>

# 合并分支
git merge <branch-name>

# 变基
git rebase <branch-name>

# 查看历史
git log --oneline --graph

# 撤销提交
git reset --soft HEAD~1
git reset --hard HEAD~1

# 暂存更改
git stash
git stash pop
```

## 📚 相关资源

- [Git 官方文档](https://git-scm.com/doc)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [语义化版本](https://semver.org/)

---

_最后更新：2026 年 3 月 27 日_
