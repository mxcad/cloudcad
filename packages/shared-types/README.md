# CloudCAD 共享类型包

提供前后端共享的 TypeScript 类型定义，确保类型一致性。

## 安装

```bash
pnpm add @cloudcad/shared-types
```

## 使用

```typescript
import { User, UserRole, LoginDto } from '@cloudcad/shared-types';

const user: User = {
  id: '123',
  email: 'user@example.com',
  username: 'username',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  // ...
};
```

## 结构

- `auth.ts` - 认证相关类型
- `user.ts` - 用户相关类型  
- `enums.ts` - 枚举定义
- `project.ts` - 项目相关类型
- `file.ts` - 文件相关类型
- `index.ts` - 统一导出