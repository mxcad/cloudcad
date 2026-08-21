# 新增系统权限 SYSTEM_TEMPLATE_READ 实现记录

## 任务完成状态

已完成

## 工作总结

为 CloudCAD 项目添加了新的系统权限 `SYSTEM_TEMPLATE_READ`，用于控制模板库的读取权限。

## 修改的文件列表

### 1. 后端文件

#### 1.1 `packages/backend/src/common/dto/permission.dto.ts`

**修改位置**: 第 51-56 行

**修改内容**: 在 `SystemPermission` 枚举中添加模板库管理权限

```typescript
// ========== 运行时配置管理 ==========
/** 查看运行时配置 */
CONFIG_READ = 'SYSTEM_CONFIG_READ',
/** 修改运行时配置 */
CONFIG_WRITE = 'SYSTEM_CONFIG_WRITE',

// ========== 模板库管理 ==========
/** 查看模板库 */
TEMPLATE_READ = 'SYSTEM_TEMPLATE_READ',
```

#### 1.2 `packages/backend/prisma/seed.ts`

**修改位置**: 第 30-50 行

**修改内容**: 在 `SYSTEM_PERMISSIONS` 数组中添加新权限

```typescript
const SYSTEM_PERMISSIONS: Permission[] = [
  Permission.SYSTEM_USER_READ,
  Permission.SYSTEM_USER_CREATE,
  Permission.SYSTEM_USER_UPDATE,
  Permission.SYSTEM_USER_DELETE,
  Permission.SYSTEM_ROLE_READ,
  Permission.SYSTEM_ROLE_CREATE,
  Permission.SYSTEM_ROLE_UPDATE,
  Permission.SYSTEM_ROLE_DELETE,
  Permission.SYSTEM_ROLE_PERMISSION_MANAGE,
  Permission.SYSTEM_FONT_READ,
  Permission.SYSTEM_FONT_UPLOAD,
  Permission.SYSTEM_FONT_DELETE,
  Permission.SYSTEM_FONT_DOWNLOAD,
  Permission.SYSTEM_ADMIN,
  Permission.SYSTEM_MONITOR,
  Permission.SYSTEM_CONFIG_READ,
  Permission.SYSTEM_CONFIG_WRITE,
  Permission.SYSTEM_TEMPLATE_READ,  // 新增
];
```

### 2. 无需修改的文件（已存在正确配置）

以下文件已包含 `SYSTEM_TEMPLATE_READ` 权限，无需修改：

- `packages/backend/prisma/schema.prisma` - Prisma Schema 已定义
- `packages/backend/src/common/enums/permissions.enum.ts` - 从 Prisma 导入，ADMIN 角色已包含
- `packages/frontend/src/constants/permissions.ts` - 已自动生成

## 关键发现

### 权限系统架构

1. **权限定义源头**: Prisma Schema (`prisma/schema.prisma`)
   - `Permission` 枚举定义系统权限
   - `ProjectPermission` 枚举定义项目权限

2. **后端权限枚举**: `src/common/enums/permissions.enum.ts`
   - 从 `@prisma/client` 导入权限类型
   - 定义 `SYSTEM_ROLE_PERMISSIONS` 角色权限映射

3. **后端 DTO**: `src/common/dto/permission.dto.ts`
   - 手动定义的枚举，用于 Swagger 文档
   - 需要与 Prisma Schema 保持同步

4. **种子数据**: `prisma/seed.ts`
   - `SYSTEM_PERMISSIONS` 数组定义所有系统权限
   - `rolePermissionRules` 定义角色权限分配规则

5. **前端权限常量**: `src/constants/permissions.ts`
   - 由 `scripts/generate-frontend-permissions.js` 自动生成
   - 从 Prisma Schema 读取权限定义

### 自动生成流程

1. 修改 Prisma Schema 添加权限
2. 运行 `pnpm db:generate` 生成 Prisma Client
3. 运行 `pnpm generate:frontend-permissions` 生成前端权限常量
4. 运行 `pnpm generate:types` 生成 OpenAPI 类型（需要后端服务运行）

## 遗留事项

### 需要手动同步的文件

由于 `permission.dto.ts` 是手动维护的枚举，添加新权限时需要同时更新：
1. Prisma Schema
2. `permission.dto.ts`
3. `seed.ts` 中的 `SYSTEM_PERMISSIONS` 数组

### 后续步骤

1. 如果需要在模板库功能中使用此权限，需要在对应的 Controller 中添加权限装饰器：
   ```typescript
   @RequirePermissions([SystemPermission.SYSTEM_TEMPLATE_READ])
   ```

2. 如果需要在侧边栏导航中控制模板库入口的可见性，需要在 `Layout.tsx` 中添加权限检查。

3. 如果需要重新生成 OpenAPI 类型，需要：
   - 启动后端服务
   - 运行 `pnpm generate:types`

## 遇到的问题

无

## 下一步建议

1. 考虑将 `permission.dto.ts` 改为从 Prisma 自动导入，避免手动同步
2. 考虑将 `seed.ts` 中的 `SYSTEM_PERMISSIONS` 改为从 Prisma Schema 或枚举自动获取
