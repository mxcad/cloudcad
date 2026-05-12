# 提交前验证

## 前端

```bash
cd packages/frontend
pnpm lint          # ESLint 检查
pnpm format        # Prettier 格式化
pnpm type-check    # TypeScript 类型检查
pnpm test          # Vitest 测试
```

## 后端

```bash
cd packages/backend
pnpm verify        # 一键：lint + format + type-check + test
```

等价于：
```bash
pnpm check         # lint + type-check
pnpm check:fix     # Auto-fix lint + format
pnpm test          # Jest 测试（timeout: 30s）
```

## Prisma 变更后额外检查

```bash
pnpm prisma generate    # 重新生成 client
pnpm type-check         # 验证 Prisma v7 类型重命名
```

## 测试覆盖率阈值

| 优先级 | 文件 | 阈值 |
|--------|------|------|
| P0 | `auth.service.ts`, `permission.service.ts` | 80% |
| P1 | `file-system.service.ts`, `role-inheritance.service.ts`, `file-validation.service.ts`, `file-system-permission.service.ts` | 70% |

## 绝对禁止提交的内容

- 未通过 lint/format/type-check/test 的代码
- `.env` 文件或任何包含 secrets/credentials 的文件
- 修改 schema.prisma 后不提交 migration 脚本
- 手动修改后的 `api-sdk/` 自动生成文件
