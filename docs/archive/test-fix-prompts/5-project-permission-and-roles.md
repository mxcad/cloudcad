# Agent 5: 修复 project-permission + project-roles

**文件:**
- `packages/backend/src/roles/project-permission.service.spec.ts`
- `packages/backend/src/roles/project-roles.service.spec.ts`

## 错误

DI 提供者缺失，或 Prisma mock 方法签名不对。

## 修复步骤

1. 读每个 spec 文件的 `beforeEach`
2. 对照源文件 constructor，确保所有注入的依赖都有 provide：
   - `DatabaseService` 或 `PrismaService` → mock 包含 `role`、`projectRole`、`permission` 等方法
   - `PermissionService` → mock 包含 `checkSystemPermission`、`getUserPermissions`
   - `RedisService` → mock
3. Prisma 7 中某些查询方法变了（如 `findMany` 参数格式），确保 mock 返回值格式正确
4. 如果使用了 `import type`，改成 `import`

## 验证

```bash
cd packages/backend
pnpm test -- --testPathPattern="project-permission"
pnpm test -- --testPathPattern="project-roles"
```

目标：每个文件 0 FAIL
