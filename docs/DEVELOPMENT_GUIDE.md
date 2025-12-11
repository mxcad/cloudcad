# CloudCAD 开发指南

## 构建和运行

### 环境要求

- Node.js >= 16.0.0
- pnpm >= 8.0.0
  **请始终使用pnpm安装依赖**

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 在根目录启动所有服务
pnpm dev

# 单独启动前端
cd packages/frontend && pnpm dev

# 单独启动后端
pnpm backend:dev
# 或
cd packages/backend && pnpm start:dev
```

### 构建项目

```bash
# 构建所有包
pnpm build

# 单独构建前端
cd packages/frontend && pnpm build

# 单独构建后端
pnpm backend:build
# 或
cd packages/backend && pnpm build
```

### 代码检查和格式化

**根目录命令（影响整个项目）：**

```bash
# 代码检查
pnpm lint

# 自动修复
pnpm lint:fix

# 代码格式化
pnpm format

# 完整检查（推荐）
pnpm check

# 完整检查并修复（推荐）
pnpm check:fix
```

**Frontend 包专用命令：**

```bash
cd packages/frontend

# 代码检查
pnpm biome:lint

# 代码检查并修复
pnpm biome:lint:write

# 格式化检查
pnpm biome:format

# 格式化并修复
pnpm biome:format:write

# 完整检查
pnpm biome:check

# 完整检查并修复
pnpm biome:check:write
```

### 类型检查

```bash
pnpm type-check
```

### 清理

```bash
pnpm clean
```

## Biome 配置

项目已完全迁移到 Biome，替代了 ESLint 和 Prettier。主要配置特点：

- **格式化规则**：单引号、ES5 尾随逗号、2空格缩进、80字符行宽
- **Lint 规则**：启用推荐规则，包括复杂度控制、未使用变量检查等
- **TypeScript 支持**：原生支持 TypeScript 和 JSX
- **性能优化**：比 ESLint + Prettier 组合快 10-20 倍

## 代码规范检查清单

### 1. 代码质量规范

- [ ] **命名规范**
  - [ ] 使用英文驼峰命名法（camelCase）变量和函数
  - [ ] 使用英文帕斯卡命名法（PascalCase）类和接口
  - [ ] 常量使用全大写加下划线（UPPER_SNAKE_CASE）
  - [ ] 禁止使用拼音命名

- [ ] **函数规范**
  - [ ] 单行长度 ≤ 80字符
  - [ ] 圈复杂度 ≤ 5
  - [ ] 优先使用纯函数
  - [ ] 函数参数 ≤ 5个
  - [ ] 函数长度 ≤ 50行

- [ ] **类与模块规范**
  - [ ] 单文件单类原则
  - [ ] 单一职责原则（SRP）
  - [ ] 类的公共方法 ≤ 10个
  - [ ] 导入语句按字母顺序排列

### 2. TypeScript规范

- [ ] **类型定义**
  - [ ] 严格类型检查（strict: true）
  - [ ] 禁止使用any类型
  - [ ] 接口优先于类型别名
  - [ ] 使用泛型提高代码复用性

- [ ] **异步编程**
  - [ ] 使用async/await而非Promise链
  - [ ] 正确处理Promise拒绝
  - [ ] 避免回调地狱

### 3. 架构规范

- [ ] **SOLID原则**
  - [ ] 单一职责原则（SRP）
  - [ ] 开闭原则（OCP）
  - [ ] 里氏替换原则（LSP）
  - [ ] 接口隔离原则（ISP）
  - [ ] 依赖倒置原则（DIP）

- [ ] **设计模式**
  - [ ] 依赖注入模式
  - [ ] 仓储模式（Repository Pattern）
  - [ ] 工厂模式（Factory Pattern）
  - [ ] 观察者模式（Observer Pattern）

### 4. 安全规范

- [ ] **认证授权**
  - [ ] JWT Token有效期控制
  - [ ] 密码加密存储（bcrypt）
  - [ ] API接口权限验证
  - [ ] SQL注入防护

- [ ] **数据验证**
  - [ ] 输入参数验证（class-validator）
  - [ ] 文件类型和大小限制
  - [ ] XSS攻击防护
  - [ ] CSRF攻击防护

### 5. 性能规范

- [ ] **数据库优化**
  - [ ] 合理使用索引
  - [ ] 避免N+1查询问题
  - [ ] 分页查询
  - [ ] 连接池配置

- [ ] **缓存策略**
  - [ ] Redis缓存热点数据
  - [ ] HTTP缓存头设置
  - [ ] 静态资源CDN加速

## 集成要点

1. 了解项目架构（MockApi vs FetchAdapter）
2. 保持认证机制一致性
3. API接口需要在apiContract、fetchAdapter和mockAdapter三者中同步实现
4. 不要直接使用fetch，要通过统一的API接口层
5. 前后端统一使用 Biome 进行代码检查和格式化
6. 前后端分离开发，分别运行在不同端口（3000/3001）
7. 后端采用 NestJS 模块化架构，遵循依赖注入和装饰器模式

## 后端开发命令

```bash
# 开发模式启动
pnpm backend:dev

# 生产模式启动
pnpm backend:start
# 或
cd packages/backend && pnpm start:prod

# 后端测试
cd packages/backend && pnpm test

# 后端测试覆盖率
cd packages/backend && pnpm test:cov
```

### 后端代码规范

后端项目使用 Biome 进行代码规范管理（与前端保持一致）：

```bash
cd packages/backend

# 代码检查
pnpm lint

# 代码检查（不修复）
pnpm lint:check

# 代码格式化
pnpm format

# 格式化检查
pnpm format:check

# 完整检查
pnpm check

# 完整检查并修复
pnpm check:fix
```
