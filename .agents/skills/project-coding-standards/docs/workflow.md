# 工作流约束

代码变更的全生命周期规范——从新增功能到提交。

## 新增功能流程

```
1. 探索同级模块 → 找最相似的已有实现
2. 照搬模式 → 目录结构、命名约定、Service 拆分方式
3. 搜索复用 → 检查是否有可复用的组件/Service/工具函数
4. 实现 → 参照已有模式，不要孤立设计
5. 提交前检查 → lint → format → type-check → test
```

## 重构流程

```
1. 确认目标 → 减少代码量？降低耦合？消除重复？
2. 每层抽象都问"有什么具体好处？" → 说不出 = 不必要的抽象
3. 重构后对比 → 代码量减少了？耦合降低了？一眼能看懂？
```

## 提交前检查清单

### 前端
```bash
# 在 packages/frontend 目录
pnpm lint       # ESLint
pnpm format     # Prettier
pnpm type-check # tsc --noEmit
pnpm test       # vitest run
```

### 后端
```bash
# 在 packages/backend 目录
pnpm verify     # = lint + format + type-check + test
```

等价于：
```bash
pnpm check      # lint + type-check
pnpm check:fix  # Auto-fix lint + format
pnpm test       # Jest
```

### Prisma 变更
```bash
pnpm prisma migrate dev --name <description>  # 生成 migration
pnpm prisma generate                           # 重新生成 client
pnpm type-check                                # 验证无类型错误（Prisma v7 类型重命名）
# 提交 migration 文件夹到 Git
```

## 绝对禁止

| ❌ 禁止 | 原因 |
|--------|------|
| 提交前不运行测试 | 可能破坏已有功能 |
| 跳过 lint/format | 代码风格不一致 |
| 修改 schema.prisma 后只执行 `db push` | 无 migration 历史 |
| 手动编辑 `api-sdk/` 下的自动生成文件 | 下次生成会覆盖 |
| 提交 `.env` / credentials / secrets | 安全风险 |

## 文档引用

- 复用优先：`project-coding-standards/docs/reuse-first.md`
- 高级工程师思维：`project-coding-standards/docs/senior-engineer-mindset.md`
- 后端 Prisma：`backend-coding-standards/docs/prisma-rules.md`
- 前端 API 契约：`frontend-coding-standards/docs/api-contracts.md`
