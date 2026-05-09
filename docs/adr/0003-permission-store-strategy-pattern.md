# 引入 IPermissionStore 策略模式解耦权限检查和持久化

RolesModule 原来通过 `forwardRef(() => FileSystemModule)` 解决循环依赖，因为 `ProjectPermissionService` 直接注入 `DatabaseService` + `AuditLogService` 查询 Prisma。引入 `IPermissionStore` 接口后，默认实现 `PrismaPermissionStore` 封装了所有权限查询逻辑，`ProjectPermissionService` 通过 `@Optional() @Inject(IPERMISSION_STORE)` 注入，不再需要引用 `FileSystemModule`。

**Considered Options**

1. **保持 forwardRef 循环依赖。** 简单但脆弱——任何模块导入顺序变化都可能导致运行时"undefined"错误。已废弃。

2. **将 ProjectPermissionService 移出 RolesModule。** 会打破模块边界——权限检查是角色系统的核心职责。未采用。

3. **引入 IPermissionStore 策略模式（采用）。** `ProjectPermissionService` 注入可选的 `IPermissionStore`。如果注入成功，委托给 store；否则回退到内联 Prisma 逻辑（向后兼容）。`RolesModule` 通过 `FileTreeModule`（只读）替代 `FileSystemModule`，彻底消除循环依赖。环境变量 `PERMISSION_STORE` 控制具体实现，默认为 `PrismaPermissionStore`。

**Consequences**

- `RolesModule` 不再 `forwardRef` 引用 `FileSystemModule`，改为依赖只读的 `FileTreeModule`。
- `PrismaPermissionStore`（223行）封装了 7 个方法：`getUserSystemPermissions`、`checkSystemPermission`、`getUserProjectPermissions`、`checkProjectPermission`、`getUserProjectRole`、`isProjectOwner`、`clearUserCache`、`clearProjectCache`。
- `ProjectPermissionService` 中每个公开方法在开头检查 `this.permissionStore` 是否存在，存在则委托，不存在则走原 Prisma 逻辑——两个路径行为完全等价。
- `IPERMISSION_STORE` token 被导出，未来可替换为 Redis/缓存优先的实现而无需修改 `ProjectPermissionService`。
- `@Optional()` 保证 DI 容器缺失 provider 时不会导致模块加载失败。