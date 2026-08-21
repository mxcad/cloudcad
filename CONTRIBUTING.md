# 贡献指南

感谢您对 CloudCAD 项目的关注！本文档将指导您如何参与项目贡献。

## ⚖️ 许可证说明

本项目采用自定义开源许可证。重要条款：

- **贡献要求**：修改源代码后必须将修改贡献回原项目
- **再分发要求**：再分发时必须公开完整源代码
- **商业使用**：需获得公司书面授权

详见 [LICENSE](./LICENSE) 文件。

## 🚀 快速开始

### 环境准备

1. **克隆项目**

```bash
git clone <repository-url>
cd cloudcad
```

2. **安装依赖**

```bash
pnpm install
```

3. **启动开发环境**

```bash
# 并行启动所有 dev server（前端 3000 / 后端 3001 / 配置中心 3002）
pnpm dev
```

### 开发流程

1. 阅读 Git 与提交规范（见根目录 `AGENTS.md` 反模式表与 `git-commit` 技能）
2. 创建功能分支
3. 开发功能
4. 提交代码
5. 创建 Pull Request
6. 代码审查
7. 合并代码

## 📋 贡献类型

### 🐛 Bug 报告

发现 Bug？请通过以下方式报告：

1. **检查现有 Issue**：确保 Bug 未被报告
2. **创建新 Issue**：
   - 使用清晰的标题
   - 提供详细的重现步骤
   - 包含环境信息（操作系统、浏览器版本等）
   - 添加相关截图或日志

### ✨ 功能请求

1. **检查现有 Issue**：避免重复请求
2. **创建新 Issue**：
   - 描述功能需求
   - 说明使用场景
   - 提供设计建议（如有）

### 💻 代码贡献

#### 开发环境要求

- **Node.js**: >= 20.19.5 (LTS)
- **pnpm**: >= 9.15.4
- **TypeScript**: 5.0+
- **数据库**: PostgreSQL 15+
- **缓存**: Redis 7+

#### ⛔ 禁止入库红线（CI 会拦截）

以下内容**严禁提交**到 Git 仓库（提交将被 CI `check-ignored-files` job 拦截）：

| 类型 | 内容 |
|------|------|
| 用户数据 | `data/` |
| 构建产物 | `release/`、`dist/`、`build/` |
| 运行时产物 | `runtime/windows/`、`runtime/linux/`、`runtime/cache/`、`runtime/docker/` |
| 内部同步 | `file-sync/` |
| 图纸/CAD | `*.dwg`、`*.dxf`、`*.mxweb`、`*.bin` |
| 私有包 | `packages/impl-mx/` |
| mxcad 暂存 | `mxcad-dist/` |
| 压缩包 | `*.tar.gz`、`*.7z`、`*.zip` |

> 原则：**源码与配置进 Git，产物与二进制走 CI/Release，用户数据永不入库。**

#### 代码规范

1. **TypeScript 严格模式**
   - 禁止使用 `any` 类型（`strictNullChecks` 增量开启中，见 ADR-0008）
   - 业务类型从 `@cloudcad/contracts` 获取，数据层类型从 `@cloudcad/db` 获取（ADR-0026/0027）
   - 确保类型安全

2. **代码风格**
   - 使用 ESLint + Prettier
   - 遵循项目命名规范
   - 函数长度 ≤ 50 行
   - 圈复杂度 ≤ 5

3. **提交规范**
   - 使用 [Conventional Commits](https://www.conventionalcommits.org/)
   - 提交信息清晰描述变更
   - 关联相关 Issue

#### 开发流程

1. **创建功能分支**

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

2. **开发功能**
   - 编写代码
   - 添加测试
   - 确保测试通过
   - 运行代码检查

3. **提交代码**

```bash
pnpm check     # 运行代码检查
pnpm test      # 运行测试
git add .
git commit -m "feat: 添加新功能描述"
```

4. **推送分支**

```bash
git push origin feature/your-feature-name
```

5. **创建 Pull Request**
   - 使用清晰的标题和描述
   - 关联相关 Issue
   - 请求代码审查

## 📝 文档贡献

### 文档类型

- **API 文档**：接口说明、参数定义
- **用户文档**：使用指南、功能说明
- **开发文档**：架构设计、开发指南
- **部署文档**：环境配置、部署流程

### 文档规范

1. **使用 Markdown 格式**
2. **结构清晰，层次分明**
3. **代码块标注语言类型**
4. **添加目录和锚点**
5. **保持文档与代码同步**

## 🧪 测试贡献

### 测试类型

- **单元测试**：函数、组件测试
- **集成测试**：模块间交互测试
- **端到端测试**：完整流程测试
- **性能测试**：性能指标测试

### 测试规范

1. **测试覆盖率**：后端 P0 模块 80% / P1 模块 70%（详见 `testing-strategy` 技能）
2. **测试命名清晰**
3. **使用有意义的测试数据**
4. **测试边界条件和错误情况**


## 🏷️ 标签和分类

### Issue 标签

- `bug` - Bug 报告
- `enhancement` - 功能增强
- `documentation` - 文档相关
- `good first issue` - 适合新手
- `help wanted` - 需要帮助
- `priority/high` - 高优先级
- `priority/medium` - 中优先级
- `priority/low` - 低优先级

### PR 标签

- `ready for review` - 等待审查
- `work in progress` - 开发中
- `needs changes` - 需要修改
- `approved` - 已批准

## 🤝 代码审查

### 审查要点

1. **代码质量**
   - 逻辑正确性
   - 性能考虑
   - 安全性检查

2. **代码规范**
   - 命名规范
   - 代码风格
   - 注释质量

3. **测试覆盖**
   - 测试完整性
   - 测试质量
   - 边界条件

4. **文档更新**
   - API 文档
   - 用户文档
   - 变更日志

### 审查流程

1. **自动检查**：CI/CD 运行测试和代码检查
2. **人工审查**：至少一人审查代码
3. **修改完善**：根据反馈修改代码
4. **批准合并**：审查通过后合并

## 📢 发布流程（线上自动打包）

### 版本管理

- 使用语义化版本 (SemVer)
- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增（`feat`）
- 修订号：向下兼容的问题修正（`fix`）
- **打包由 GitHub Actions 线上完成，本地零打包**

### 发布步骤（仅维护者）

```bash
# 1. bump 版本号
#    修改 package.json 的 version 字段，提交
#    git commit -m "chore(release): v2.3.1"

# 2.（可选）若 mxcad 图纸转换器有更新：
#    将各平台打包好的产物放入 mxcad-dist/<platform>-<arch>/
#    然后运行（自动哈希去重上传，相同内容不重复上传）
#    node scripts/upload-mxcad.js v2.3.1

# 3. 打标签并推送（触发 GitHub Actions release.yml）
git tag v2.3.1
git push origin v2.3.1

# 4. CI 自动：
#    - Linux：QEMU + Docker 构建各 OS×架构 部署包
#    - Windows：官方源构建标准组件 + mxcad 合并
#    - 产物上传到 Releases（草稿）

# 5. 到 GitHub 确认 Releases 后点击"发布"
```

> 详细流程见 [docs/git-workflow.md](./docs/git-workflow.md)。

## 🏆 贡献者认可

### 贡献统计

- 代码贡献
- 文档贡献
- Bug 报告
- 功能建议
- 社区支持

### 认可方式

- 贡献者列表
- 发布说明感谢
- 年度贡献者表彰

## 📚 相关资源

- [项目概述](./PROJECT_OVERVIEW.md)
- [文档导航](./docs/README.md)

---

感谢您的贡献！🎉

_最后更新：2026-08-10_
