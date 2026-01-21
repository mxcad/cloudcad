# CloudCAD Git 工作流指南

本文档定义了 CloudCAD 项目的 Git 分支管理策略和协作规范。

## 🌳 分支策略

### 分支类型

| 分支类型    | 用途         | 命名规范           | 生命周期 |
| ----------- | ------------ | ------------------ | -------- |
| `main`      | 生产环境分支 | `main`             | 长期存在 |
| `develop`   | 开发主分支   | `develop`          | 长期存在 |
| `feature/*` | 功能开发分支 | `feature/功能名称` | 临时     |
| `fix/*`     | Bug修复分支  | `fix/问题描述`     | 临时     |
| `hotfix/*`  | 紧急修复分支 | `hotfix/紧急修复`  | 临时     |
| `release/*` | 发布准备分支 | `release/v版本号`  | 临时     |

### 分支关系图

```
main (生产)
  ↑
release/v1.0.0
  ↑
develop (开发)
  ↑
feature/*, fix/*
  ↑
hotfix/* (直接合并到main和develop)
```

## 🔄 工作流程

### 1. 开发新功能

```bash
# 1. 切换到develop分支并更新
git checkout develop
git pull origin develop

# 2. 创建功能分支
git checkout -b feature/frontend-auth

# 3. 开发功能并提交
git add .
git commit -m "feat: 添加前端登录功能"

# 4. 推送功能分支（可选，用于协作）
git push origin feature/frontend-auth

# 5. 开发完成后，合并回develop
git checkout develop
git pull origin develop
git merge feature/frontend-auth
git push origin develop

# 6. 删除功能分支
git branch -d feature/frontend-auth
git push origin --delete feature/frontend-auth
```

### 2. 修复Bug

```bash
# 1. 从develop创建修复分支
git checkout develop
git pull origin develop
git checkout -b fix/login-validation-error

# 2. 修复并测试
git add .
git commit -m "fix: 修复登录表单验证错误"

# 3. 合并回develop
git checkout develop
git merge fix/login-validation-error
git push origin develop

# 4. 删除修复分支
git branch -d fix/login-validation-error
```

### 3. 紧急修复

```bash
# 1. 从main创建hotfix分支
git checkout main
git pull origin main
git checkout -b hotfix/security-patch

# 2. 修复并测试
git add .
git commit -m "hotfix: 修复安全漏洞"

# 3. 合并到main和develop
git checkout main
git merge hotfix/security-patch
git tag v1.0.1

git checkout develop
git merge hotfix/security-patch
git push origin main develop

# 4. 删除hotfix分支
git branch -d hotfix/security-patch
```

### 4. 发布流程

```bash
# 1. 从develop创建发布分支
git checkout develop
git pull origin develop
git checkout -b release/v1.0.0

# 2. 测试和修复（只修复关键问题）
git add .
git commit -m "fix: 修复发布前的关键bug"

# 3. 合并到main并打标签
git checkout main
git merge release/v1.0.0
git tag v1.0.0

# 4. 合并回develop
git checkout develop
git merge release/v1.0.0
git push origin main develop --tags

# 5. 删除发布分支
git branch -d release/v1.0.0
```

## 📝 提交信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 格式

```
<类型>[可选的作用域]: <描述>

[可选的正文]

[可选的脚注]
```

### 类型说明

| 类型       | 说明     | 示例                                |
| ---------- | -------- | ----------------------------------- |
| `feat`     | 新功能   | `feat(auth): 添加用户登录功能`      |
| `fix`      | Bug修复  | `fix(auth): 修复登录状态持久化问题` |
| `docs`     | 文档更新 | `docs(api): 更新认证API文档`        |
| `style`    | 代码格式 | `style(auth): 调整登录表单样式`     |
| `refactor` | 重构     | `refactor(auth): 重构认证状态管理`  |
| `test`     | 测试相关 | `test(auth): 添加登录功能测试`      |
| `chore`    | 构建工具 | `chore: 更新依赖包版本`             |

### 示例

```bash
feat(auth): 添加用户登录功能

- 实现登录表单组件
- 添加JWT Token管理
- 集成后端认证API

Closes #123
```

## 🤝 协作规范

### 1. 分支命名

- 使用英文，小写字母，连字符分隔
- 语义化命名，清晰表达功能
- 示例：
  - `feature/user-authentication`
  - `fix/file-upload-error`
  - `hotfix/security-vulnerability`

### 2. 提交频率

- 小步快跑，频繁提交
- 每个提交完成一个独立功能点
- 避免大而全的提交

### 3. 代码审查

- 功能分支合并前需要代码审查
- 使用 Pull Request 进行代码审查
- 确保测试通过，代码质量符合规范

### 4. 冲突解决

```bash
# 1. 更新develop分支
git checkout develop
git pull origin develop

# 2. 切换回功能分支
git checkout feature/my-feature

# 3. 合并develop到功能分支
git merge develop

# 4. 解决冲突后继续开发
git add .
git commit -m "resolve: 解决合并冲突"
```

## 🚀 当前项目分支状态

### 已创建的分支

- `main` - 生产环境分支
- `develop` - 开发主分支（当前所在）

### 最近完成的功能

- `@cloudcad/shared-types` - 共享类型包
- 前端认证集成准备

### 下一步计划

- `feature/frontend-auth` - 前端登录功能实现
- `feature/api-integration` - 后端API对接
- `feature/auth-testing` - 认证功能测试

## 📚 参考资源

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Flow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow)
- [GitHub Flow](https://guides.github.com/introduction/flow/)

---

## 📋 检查清单

在合并分支前，请确保：

- [ ] 代码通过所有测试
- [ ] 代码符合项目规范
- [ ] 提交信息符合规范
- [ ] 文档已更新（如需要）
- [ ] 没有合并冲突
- [ ] 功能已充分测试

---

_最后更新：2025年12月11日_
