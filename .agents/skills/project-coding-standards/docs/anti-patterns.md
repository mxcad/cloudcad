# 全栈反模式清单

以下是 AI 在本项目中最高频的错误模式及正确做法。

## 架构反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| Controller 写业务逻辑 | Controller 只做路由委托，逻辑放 Service |
| 外部消费者直接调用子 Service | 外部走 FileSystemService Façade |
| 模块循环依赖 (A ↔ B) | 单向 DAG，必要时提取公共接口 |
| 重构后代码量增加 | 重构应消除重复、减少代码量 |
| 过度抽象（说不清好处） | 每层抽象必须有明确收益 |
| 孤立设计新模块 | 参照同级模块的模式和结构 |

## 代码质量反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `console.log()` | NestJS Logger |
| `any` 类型 | 正确定义类型或使用 unknown + 类型守卫 |
| 不处理异步错误 | try/catch 或异常过滤器 |
| 返回 null 表示错误 | 抛出异常（NotFoundException 等） |
| 相关写操作不使用事务 | 包裹在 $transaction 中 |
| 类型定义写在组件/Controller 内 | 提取到独立 types 文件 |
| `@Req()` / `@Res()` 直接使用 | DTO + 正确返回类型 |

## 基础设施反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 硬编码颜色值 | CSS 变量或 Tailwind Token |
| z-index 裸数字 | Z_LAYERS 常量 |
| 硬编码字体栈 | --font-family-* CSS 变量 |
| 自己写 Modal/Table/Button | 复用 src/components/ui/ 已有组件 |
| 前端本地定义 API 类型 | 使用 api-sdk 自动生成的类型 |
| 随意创建新文件 | 遵守目录约定 |

## 测试反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 不写测试 | TDD：先写测试再实现 |
| 测试覆盖率不达标 | P0: 80%, P1: 70% |
| 提交前不运行测试 | pnpm verify (后端) / pnpm test (前端) |

## 提交反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 跳过 lint/format | 提交前运行完整检查 |
| 修改 schema 后只 db push | 生成 migration 脚本并提交 |
| 提交 .env / secrets | 使用环境变量，不提交敏感文件 |
