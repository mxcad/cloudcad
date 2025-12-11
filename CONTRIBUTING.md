# 贡献指南

感谢您对 CloudCAD 项目的关注！本文档将指导您如何参与项目贡献。

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
# 启动后端服务
cd packages/backend
pnpm dev:infra  # 启动基础设施
pnpm dev        # 启动后端服务

# 启动前端服务
cd packages/frontend
pnpm dev
```

### 开发流程

1. 阅读 [Git 工作流指南](./GIT_WORKFLOW.md)
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

#### 代码规范

1. **TypeScript 严格模式**
   - 禁止使用 `any` 类型
   - 使用共享类型包 `@cloudcad/shared-types`
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
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
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

1. **测试覆盖率 ≥ 90%**
2. **测试命名清晰**
3. **使用有意义的测试数据**
4. **测试边界条件和错误情况**

## 🎯 项目结构

```
cloudcad/
├── docs/                   # 项目文档
├── packages/
│   ├── shared-types/       # 共享类型定义
│   ├── frontend/           # React 前端应用
│   └── backend/            # NestJS 后端应用
├── .github/workflows/      # GitHub Actions
└── README.md              # 项目说明
```

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

## 📢 发布流程

### 版本管理

- 使用语义化版本 (SemVer)
- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正

### 发布步骤

1. **准备发布**
   - 完成所有功能开发
   - 通过所有测试
   - 更新文档

2. **创建发布分支**
```bash
git checkout develop
git checkout -b release/v1.0.0
```

3. **发布测试**
   - 功能测试
   - 性能测试
   - 安全测试

4. **正式发布**
```bash
git checkout main
git merge release/v1.0.0
git tag v1.0.0
git push origin main --tags
```

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

## 📞 联系方式

- **项目维护者**：[维护者邮箱]
- **技术讨论**：[讨论群组]
- **问题反馈**：[Issue 模板]

## 📚 相关资源

- [Git 工作流指南](./GIT_WORKFLOW.md)
- [项目概述](./PROJECT_OVERVIEW.md)
- [开发指南](./DEVELOPMENT_GUIDE.md)
- [API 文档](./API.md)

---

感谢您的贡献！🎉

*最后更新：2025年12月11日*