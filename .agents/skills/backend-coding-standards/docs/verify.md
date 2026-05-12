# 提交前验证

## 一键验证

```bash
cd packages/backend
pnpm verify        # = lint + format + type-check + test
```

## 分步执行

```bash
pnpm check         # lint + type-check
pnpm check:fix     # Auto-fix lint + format
pnpm test          # Jest 测试（timeout: 30s）
pnpm test:permission  # 权限专项测试
```

## Prisma 变更后

```bash
pnpm prisma generate    # 重新生成 client
pnpm type-check         # 验证类型（Prisma v7 重命名检查）
```

## 测试覆盖率阈值

| 优先级 | 文件 | 阈值 |
|--------|------|------|
| P0 | `auth.service.ts`, `permission.service.ts` | 80% |
| P1 | `file-system.service.ts`, `role-inheritance.service.ts`, `file-validation.service.ts`, `file-system-permission.service.ts` | 70% |

## 绝对禁止

- 未通过测试的提交
- 修改 schema 后只 db push、不提交 migration
- 提交 .env / credentials
