# 添加新权限 SYSTEM_TEMPLATE_READ 实现报告

## 任务完成状态

✅ 已完成

## 修改的文件列表

### 1. 后端 Prisma Schema
**文件路径**: `D:\web\MxCADOnline\cloudcad\packages\backend\prisma\schema.prisma`

**修改内容**: 在 `Permission` 枚举中添加新权限

```prisma
enum Permission {
  // ... 现有权限 ...

  // ========== 运行时配置管理 ==========
  SYSTEM_CONFIG_READ
  SYSTEM_CONFIG_WRITE

  // ========== 模板库管理 ==========
  SYSTEM_TEMPLATE_READ
}
```

---

### 2. 后端角色权限映射
**文件路径**: `D:\web\MxCADOnline\cloudcad\packages\backend\src\common\enums\permissions.enum.ts`

**修改内容**: 将 `SYSTEM_TEMPLATE_READ` 添加到 ADMIN 角色的权限列表

```typescript
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]> = {
  [SystemRole.ADMIN]: [
    // ... 其他权限 ...
    PrismaPermission.SYSTEM_ADMIN,
    PrismaPermission.SYSTEM_MONITOR,
    PrismaPermission.SYSTEM_CONFIG_READ,
    PrismaPermission.SYSTEM_CONFIG_WRITE,
    PrismaPermission.SYSTEM_TEMPLATE_READ,  // 新增
  ],
  // ... 其他角色 ...
};
```

---

### 3. 权限生成脚本
**文件路径**: `D:\web\MxCADOnline\cloudcad\scripts\generate-frontend-permissions.js`

**修改内容**: 添加权限中文标签映射

```javascript
const labels = {
  // ... 现有标签 ...
  SYSTEM_ADMIN: '系统管理',
  SYSTEM_MONITOR: '系统监控',
  SYSTEM_CONFIG_READ: '查看配置',
  SYSTEM_CONFIG_WRITE: '修改配置',
  SYSTEM_TEMPLATE_READ: '查看模板库',  // 新增
  // ...
};
```

---

### 4. 前端权限常量（自动生成）
**文件路径**: `D:\web\MxCADOnline\cloudcad\packages\frontend\src\constants\permissions.ts`

**修改内容**: 由 `pnpm generate:frontend-permissions` 自动生成

```typescript
export const SystemPermission = {
  // ... 其他权限 ...
  SYSTEM_TEMPLATE_READ: 'SYSTEM_TEMPLATE_READ',
} as const;

export const PERMISSION_GROUPS = {
  system: [
    // ...
    {
      label: '系统权限',
      items: [
        // ...
        { key: 'SYSTEM_TEMPLATE_READ', label: '查看模板库' },
      ],
    },
  ],
  // ...
};
```

---

## 使用示例

### 后端 Controller 使用

```typescript
@Controller('templates')
@UseGuards(PermissionsGuard)
export class TemplateController {
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_TEMPLATE_READ])
  findAll() {
    return this.templateService.findAll();
  }
}
```

### 前端使用

```typescript
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';

function TemplateLibrary() {
  const { hasPermission } = usePermission();

  if (!hasPermission(SystemPermission.SYSTEM_TEMPLATE_READ)) {
    return <AccessDenied />;
  }

  return <TemplateList />;
}
```

---

## 执行的命令

1. 修改 schema.prisma 添加权限枚举
2. 运行 `pnpm generate:frontend-permissions` 更新前端权限常量
3. 运行 `pnpm db:generate` 更新 Prisma Client

---

## 权限分配情况

| 角色 | 是否拥有该权限 |
|------|----------------|
| ADMIN (系统管理员) | ✅ 是 |
| USER_MANAGER (用户管理员) | ❌ 否 |
| FONT_MANAGER (字体管理员) | ❌ 否 |
| USER (普通用户) | ❌ 否 |

如需为其他角色分配此权限，可在 `SYSTEM_ROLE_PERMISSIONS` 映射中添加。
