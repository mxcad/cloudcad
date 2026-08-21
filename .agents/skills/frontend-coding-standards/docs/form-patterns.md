# 前端表单开发模式

React Hook Form + Zod 是项目的标准表单方案。

## 标准表单结构

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// 1. 定义 schema
const schema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  email: z.string().email('邮箱格式不正确'),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  // 2. useForm
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // 3. 提交处理 — 处理 loading 和 error
  const onSubmit = async (data: FormData) => {
    try {
      await apiCall(data);
    } catch (error) {
      // 处理后端校验错误
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span className="text-error-500">{errors.name.message}</span>}
      
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '提交中...' : '提交'}
      </button>
    </form>
  );
}
```

## 约定

- 使用 `zodResolver` 集成 Zod schema
- 表单类型从 schema 派生：`type FormData = z.infer<typeof schema>`
- 错误提示使用语义色 `className="text-error-500"`
- 提交按钮禁用态：`disabled={isSubmitting}`
- 所有 API 调用处理 loading 和 error 状态

## 模式选择

| 场景 | 推荐方案 |
|------|---------|
| 简单表单 | React Hook Form + Zod |
| 搜索/筛选 | URL searchParams + useSearchParams |
| 复杂多步表单 | React Hook Form + step 状态管理 |
| 文件上传 | 项目自实现分片上传（`uploadMxCadFile`） |
| 即时保存 | useDebouncedCallback + auto-save |

## ❌ 常见错误

```tsx
// ❌ 不用 useForm hook，手动管理 state
const [name, setName] = useState('');
const [nameError, setNameError] = useState('');

// ❌ 不用 zodResolver，手动写校验逻辑
if (name.length === 0) setNameError('名称不能为空');
```

## ✅ 正确做法

```tsx
const schema = z.object({ name: z.string().min(1) });
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```
