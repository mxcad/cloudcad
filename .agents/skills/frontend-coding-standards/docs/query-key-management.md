# React Query Key 管理

## 原则

所有 `@tanstack/react-query` 的 `queryKey` 必须通过 `src/lib/queryKeys.ts` 工厂创建。禁止本地常量和硬编码字符串。

## 工厂结构

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  auth: {
    currentUser: ['auth', 'currentUser'],
  },
  users: {
    list: (params?: Record<string, unknown>) => ['users', 'list', params],
  },
  roles: {
    list: ['roles', 'list'],
  },
  fileSystem: {
    all: ['fileSystem'],
    node: (id: string) => ['fileSystem', 'node', id],
    children: (parentId: string) => ['fileSystem', 'children', parentId],
    search: (params: Record<string, unknown>) => ['fileSystem', 'search', params],
    trash: ['fileSystem', 'trash'],
    storageQuota: ['fileSystem', 'storageQuota'],
    personalSpace: ['fileSystem', 'personalSpace'],
  },
  dashboard: {
    projects: ['dashboard', 'projects'],
    stats: ['dashboard', 'stats'],
    personalSpaceChildren: (id: string) => ['dashboard', 'personalSpace', id],
  },
  library: {
    all: ['library'],
    drawing: { ... },
    block: { ... },
  },
  auditLog: {
    list: (params: Record<string, unknown>) => ['auditLog', 'list', params],
    stats: ['auditLog', 'stats'],
  },
  billing: {
    plans: ['billing', 'plans'],
    orders: (params: Record<string, unknown>) => ['billing', 'orders', params],
  },
};
```

## 使用方式

```typescript
// ✅ 正确
import { queryKeys } from '@/lib/queryKeys';

useQuery({
  queryKey: queryKeys.fileSystem.search({ keyword, scope, page, limit }),
  queryFn: () => nodeControllerSearch({ ... }),
});

queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.storageQuota });
```

## 反模式

| ❌ | ✅ |
|----|-----|
| `const USERS_KEY = ['users']`（本地常量） | `queryKeys.users.list(params)` |
| `queryKey: ['projects', 'all']`（硬编码字符串） | `queryKeys.dashboard.projects` |
| `queryKey: ['library']`（硬编码字符串） | `queryKeys.library.all` |
| 每个页面各自定义 key 常量 | 统一在 `queryKeys` 工厂中管理 |

## 新增域

新增功能域时，先在 `queryKeys` 工厂添加对应 key，再写查询代码。

## 注意事项

如果出于 Vite HMR 性能考虑需要避免级联刷新，将 key 作为 `queryKeys` 的独立导出项，而不是在查询组件中重新定义。

```typescript
// ✅ 正确：queryKeys 中独立导出
// queryKeys.ts
export const libraryCategoryKeys = {
  list: (type: string) => ['library', 'categories', type],
};
```