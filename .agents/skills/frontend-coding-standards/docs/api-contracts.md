# API 契约规则

前端 API 类型必须与后端 DTO 保持一致。**禁止前端本地定义 API 类型。**

## 类型来源

```
后端 DTO (@ApiProperty)
    │
    ▼ (pnpm generate:api-types)
@hey-api/openapi-ts 自动生成
    │
    ▼
packages/frontend/src/api-sdk/
  ├── sdk.gen.ts      ← 自动生成，禁止手动编辑
  └── types.gen.ts    ← 自动生成，禁止手动编辑
```

## 规则

### ✅ 正确：使用自动生成的类型

```typescript
import type { FileNodeDto } from '@/api-sdk/types.gen';
import { fileSystemApi } from '@/api-sdk/sdk.gen';

async function loadFile(nodeId: string): Promise<FileNodeDto> {
  return fileSystemApi.getFileNode(nodeId);
}
```

### ❌ 错误：前端本地定义 API 类型

```typescript
// ❌ 禁止 — 前端自定义类型，与后端脱节
interface FileNodeDto {
  id: string;
  name: string;
  fileStatus: string;  // 可能与后端枚举不一致
}
```

## API 调用约定

```typescript
// ✅ 通过 SDK 调用
import { authApi } from '@/api-sdk/sdk.gen';

const result = await authApi.login({ email, password });

// SDK 自动处理：
// - 请求/响应类型安全
// - 认证 token 注入
// - 错误处理
```

## 类型变更流程

1. 修改后端 DTO（`@ApiProperty`）
2. 运行 `pnpm generate:api-types`
3. 前端自动获得更新后的类型
4. TypeScript 编译器会标出所有不兼容的使用点

## 常见错误

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 在组件中定义 `interface ApiResponse {...}` | 使用 `api-sdk/types.gen.ts` 自动生成的类型 |
| 手动写 `fetch('/api/xxx')` | 使用 SDK 生成的函数 |
| 用 `any` 或 `as` 绕开类型检查 | 修复类型不匹配，不要绕过 |
| 手动修改 `sdk.gen.ts` 或 `types.gen.ts` | 这些文件由 `generate:api-types` 生成 |
