# 前端架构迁移指南

> 给执行 agent 的操作手册。照着做，不要自由发挥。

## 你要做什么

把每个页面从"手动 useState 管理数据请求"迁移到"TanStack Query + SDK + hooks"模式。UserManagement 是已完成的模板，照搬即可。

## 迁移顺序

1. RoleManagement（简单 CRUD）
2. Dashboard（只读查询）
3. Login / Register（表单密集，引入 react-hook-form）
4. FileSystemManager（复杂，已有 useFileSystem hook 系列）
5. 其余直接 import SDK 的组件（改 import 路径）
6. AuthContext 拆分（最后做，最复杂）

每次迁移一个页面，跑 `pnpm test` 和 `pnpm type-check` 确认无回归。

## 5 个必须知道的坑

### 1. SDK 错误不会抛出

```typescript
// ❌ 错误做法——error 永远是 undefined
const { data } = await someSdkFunction({ ... });

// ✅ 正确做法——手动检查 error
const result = await someSdkFunction({ ... });
if (result.error) throw result.error;
return result.data;
```

原因：SDK 的 `throwOnError` 默认 `false`，错误返回在 `{ error: ... }` 里而不是抛出。

### 2. MSW 测试 URL 必须匹配 SDK 实际 URL

SDK 的 URL 在 `src/api-sdk/sdk.gen.ts` 里，格式是 `/api/v1/xxx/{id}/yyy`。测试中的 MSW handler 必须完全匹配。

```typescript
// ❌ 猜测的 URL
http.delete('/api/v1/users/:id/permanent', ...)

// ✅ 查 sdk.gen.ts 确认的实际 URL
http.post('/api/v1/users/:id/delete-immediately', ...)
```

### 3. responseTransformer 解包但不校验

SDK 的 `client-setup.ts` 会自动解包 `{ code, data } → data`，但不检查 `code` 是否为错误码。如果后端返回 `{ code: 500, data: null }`，SDK 不会抛错。

测试中模拟错误用 `throw new Error(...)` 或 `HttpResponse.error()`，不要用 `{ code: 500 }` 格式。

### 4. zod schema 是工厂函数

`mailEnabled`、`isEditing` 等是运行时参数，schema 不能是静态对象：

```typescript
// ✅ 工厂函数
export function userFormSchema(ctx: { mailEnabled: boolean; isEditing: boolean }) {
  return z.object({
    username: z.string().min(1, '用户名不能为空').min(3).max(20),
    email: ctx.mailEnabled ? z.string().min(1, '邮箱不能为空') : z.string(),
    password: ctx.isEditing ? z.string() : z.string().min(1, '密码不能为空'),
    // ...
  });
}
```

### 5. roles/mailEnabled/smsEnabled 暂时保留

这些字段暂时留在 `useUserCRUD` hook 的返回值里，不要提前拆分。等所有页面迁移完后再统一处理。

## 模板代码

### useXxxCRUD hook（数据请求层）

参考 `src/pages/UserManagement/hooks/useUserCRUD.ts`：

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { xxxControllerFindAll, xxxControllerCreate, ... } from '@/api-sdk';

const XXX_KEY = ['xxx'] as const;

export function useXxxCRUD() {
  const queryClient = useQueryClient();

  const { data = [], isLoading, error: queryError } = useQuery({
    queryKey: XXX_KEY,
    queryFn: async () => {
      const result = await xxxControllerFindAll({ query: {} });
      if (result.error) throw result.error;  // ← 关键！
      return result.data?.items || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => xxxControllerCreate({ body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: XXX_KEY }),
  });
  // ... 同理 update/delete/restore

  return { data, loading: isLoading, isLoading, error, create, update, remove, reload };
}
```

要点：
- `onSuccess` 里调 `invalidateQueries` 自动刷新缓存
- 返回 `loading`（alias）保持向后兼容
- queryFn 里手动 `if (result.error) throw result.error`

### zod schema（表单校验层）

参考 `src/pages/UserManagement/hooks/userFormSchema.ts`：

```typescript
import { z } from 'zod';

export function xxxFormSchema(ctx: { someFlag: boolean }) {
  return z.object({
    name: z.string().min(1, '名称不能为空'),
    // ...
  });
}
```

### useXxxForm hook（表单状态层）

参考 `src/pages/UserManagement/hooks/useUserForm.ts`：

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { xxxFormSchema, type XxxFormData } from './xxxFormSchema';

export function useXxxForm({ onSubmit, editingItem, ...ctx }) {
  const form = useForm<XxxFormData>({
    resolver: zodResolver(xxxFormSchema(ctx)),
    defaultValues: { ... },
  });

  useEffect(() => {
    if (editingItem) form.reset({ ... });
    else form.reset({ ... });
  }, [editingItem?.id]);

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;
    await onSubmit(form.getValues());
  };

  return { form, handleSubmit };
}
```

### 组件瘦身

迁移后的组件必须满足：
- 不 import `@/api-sdk` 或 `@/services`
- 所有数据通过 props 或 hook 获取
- 所有用户操作通过回调 props 传递

### 测试模式

参考 `src/pages/UserManagement/hooks/useUserCRUD.spec.ts`：

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

it('loads data automatically', async () => {
  server.use(
    http.get('/api/v1/xxx', () => {
      return HttpResponse.json({ code: 0, data: { items: [...], total: 2 } });
    }),
  );

  const { wrapper } = createTestWrapper();
  const { result } = renderHook(() => useXxxCRUD(), { wrapper });

  expect(result.current.isLoading).toBe(true);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data).toHaveLength(2);
});
```

## 每个页面的迁移步骤

1. 找到组件中所有 `useState` + `useEffect` + `useCallback` 的数据请求代码
2. 创建 `hooks/useXxxCRUD.ts`，用 TanStack Query 重写
3. 如果有表单，创建 `hooks/xxxFormSchema.ts` 和 `hooks/useXxxForm.ts`
4. 更新组件：删除手动状态管理代码，改用新 hook
5. 如果有内联 modal，提取为子组件（参考 `UserModals/` 目录）
6. 写测试（至少覆盖：自动加载、mutation 后缓存失效、错误处理）
7. 跑 `pnpm test` 和 `pnpm type-check`

## 什么时候停下来

如果遇到以下情况，停下来问：
- SDK 函数签名和预期不一致（可能需要 `pnpm generate:api-types`）
- 后端 API 返回格式和 MSW mock 不匹配
- 组件依赖 Zustand store 的数据（不要改 store，用 `useQuery` 获取服务端数据）
- 涉及 mxcad-app（Vue）通信的组件（这些不在迁移范围）
