# 开发规范（Shared）

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量/函数 | camelCase | getUserInfo, fileCount |
| 类/接口 | PascalCase | UserService, FileSystemNode |
| 常量 | UPPER_SNAKE_CASE | MAX_FILE_SIZE, JWT_SECRET |
| 文件名 | kebab-case | user-service.ts |
| 组件文件 | PascalCase | FileUploader.tsx |

> 禁止使用拼音命名！

## 函数规范

- 单行长度 ≤ 80 字符
- 圈复杂度 ≤ 5
- 参数数量 ≤ 5 个
- 函数长度 ≤ 50 行
- 优先使用纯函数

## TypeScript 规范

- 严格模式（strict: true）
- 禁止使用 any 类型
- 接口优先于类型别名
- 使用泛型提高代码复用性
- 使用 async/await 而非 Promise 链

## 注释规范

- 公共 API 必须包含 JSDoc 文档
- 业务代码注释「为什么」>「做什么」
- 复杂逻辑必须添加注释说明

## 异常处理

- 禁止裸 try-catch（必须处理异常）
- 自定义异常继承自 HttpException（NestJS）
- 统一错误格式（使用全局异常过滤器）

## 测试规范

| 指标 | 要求 |
|------|------|
| 新增代码覆盖率 | ≥ 90% |
| 核心模块覆盖率 | ≥ 95% |
| 前端测试框架 | Vitest + Testing Library |
| 后端测试框架 | Jest |
| 测试流程 | 红线 → 绿线 → 重构 |

## 开发流程

### 标准开发流程

```
1. 理解需求 → 2. 探索代码 → 3. 制定计划 → 4. 实施修改 →
5. 运行 type-check → 6. 运行 lint → 7. 运行测试 → 8. 代码审查 → 9. 完成
```

### 代码修改后验证顺序

1. type-check（TypeScript 代码）
2. lint（所有代码）
3. test（功能代码）
4. code-reviewer（重要代码）
5. frontend-tester（前端文件）

## 工具使用

### 探索代码

| 目标 | 工具 |
|------|------|
| 理解项目结构 | list_directory, read_file (README) |
| 查找特定文件 | glob |
| 搜索代码内容 | search_file_content |
| 理解模块关系 | read_file (module files) |
| 广泛探索 | task (explore-agent) |

### 文件操作

| 操作 | 工具 | 要求 |
|------|------|------|
| 读取文件 | read_file | 使用绝对路径 |
| 修改代码 | replace | 提供足够上下文 |
| 创建文件 | write_file | 仅在必要时创建 |
| 搜索内容 | search_file_content | 优先使用正则搜索 |

## 命令规范

### PowerShell 命令

- 使用 dir 代替 ls
- 使用 copy 代替 cp
- 使用 type 代替 cat
- 使用 ; 代替 && 进行命令链
- 避免 Linux 命令（grep, awk, sed）

## 依赖管理

- 100% 使用 pnpm（禁止 npm 或 yarn）
- 使用 express 平台（NestJS 后端）
- TypeScript 严格模式