---
name: api-contracts
description: AUTO-TRIGGER on any of: "has no exported member", "is not a function", "Module.*has no exported member", DTO/controller modification, type mismatch between frontend/backend, swagger changes. Enforces backend-first fixes — never patch types in frontend.
---

# API 契约

```
🚨 核心原则： NEVER 在前端绕过类型。类型错了就是后端 DTO 缺装饰器，去修后端。
```

## 🚨 强制检查：body?: never 红牌

**当你看到 SDK 类型的 `body?: never` 但实际需要传 body，这是 DTO 缺 @ApiProperty 的明确信号。**

```bash
# 检测所有 body?: never 的 SDK 类型（应在 Phase 2 逐步消灭）
grep -B2 'body?: never' packages/frontend/src/api-sdk/types.gen.ts | grep 'export type'
```

**处理步骤（强制，不可跳过）：**

```
发现 body?: never 但要传 body
  → 找到对应的后端 DTO（packages/backend/src/*/dto/*.dto.ts）
  → 检查 DTO 字段是否都有 @ApiProperty
    ├── 有 → 检查 Controller 是否用普通 import 而非 import type
    └── 无 → 补上 @ApiProperty 装饰器
  → 需要后端重启 + pnpm generate:api-types
  → 验证 body?: never 消失
```

**绝对禁止：**
```typescript
// ❌ 禁止用 as any 绕过 body?: never
await controllerFoo({ body: { x: 1 } as any });  // ← 必须修后端 DTO
await controllerFoo({ body: formData as any });    // ← FormData 场景可豁免
```

## 决策树

```
前端类型报错：CreateXxxDto / UpdateXxxDto / XxxDto 找不到
  │
  ├── Step 1: 检查 swagger_json.json 的 components.schemas
  │     node -e "const d=require('./swagger_json.json'); console.log(Object.keys(d.components.schemas).filter(k=>k.includes('Xxx')))"
  │     │
  │     ├── 有该 DTO → 重新 pnpm generate:api-types
  │     │
  │     └── 没有 → 问题在后端，跳到 Step 2
  │
  ├── Step 2: 找到后端 DTO 文件，检查装饰器
  │     │  packages/backend/src/*/dto/*.dto.ts
  │     │
  │     ├── 字段缺少 @ApiProperty / @ApiPropertyOptional → 补上，重启后端
  │     │
  │     ├── DTO 存在但未被 Controller 方法引用 → 检查 Controller @ApiResponse type
  │     │
  │     └── DTO 被 import type 引入（NestJS Swagger 需要 import 非 type）→ 改成普通 import
  │
  └── Step 3: 验证
        后端重启 → swagger_json.json 确认 DTO 出现 → pnpm generate:api-types → 前端错误消失
```

## 🚫 绝对禁止

```typescript
// ❌ 前端手写 DTO 类型 — 脱离契约
interface CreateNodeDto { name: string; parentId: string }

// ❌ 前端 types/ 目录下手写 DTO
// ❌ 忽略类型检查加 // @ts-expect-error
// ❌ 在前端手动定义与后端重复的类型
```

## ✅ 正确做法

```typescript
// 前端只从 @/api-sdk 导入类型
import type { CreateNodeDto } from '@/api-sdk';  // ✅

// 类型缺失时 → 修后端 DTO → pnpm generate:api-types → 前端自动拿到
```

---

## 后端：DTO 装饰器规范

DTO 每个字段必须有装饰器，否则 Swagger 不导出：

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNodeDto {
  @ApiProperty({ description: '节点名称', example: '新文件夹' })
  name: string;

  @ApiProperty({ description: '父节点ID', example: 'uuid' })
  parentId: string;

  @ApiPropertyOptional({ description: '说明', example: '可选描述' })
  description?: string;

  @ApiProperty({ description: '类型', enum: ['folder', 'file'], example: 'folder' })
  nodeType: 'folder' | 'file';
}
```

**特别注意：**
- `import type { XxxDto }` 在 NestJS Controller 中会导致 Swagger 无法解析类型 → 必须用普通 `import`
- DTO 字段如果用 `@ApiPropertyOptional`，Swagger 标记为可选 → 前端生成的类型也会是 `field?:`

## 后端：Controller 装饰器规范

```typescript
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateNodeDto } from './dto/create-node.dto';  // 非 type import！

@ApiTags('file-system')
@Controller('file-system')
export class FileSystemController {

  @Post('node')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建节点' })
  @ApiResponse({ status: 201, description: '创建成功', type: CreateNodeDto })
  async createNode(@Body() dto: CreateNodeDto) { ... }
}
```

---

## 前端：@/api-sdk 使用规范

### 导入方式

```typescript
// ✅ 从 @/api-sdk 导入生成的函数和类型
import { authControllerLogin } from '@/api-sdk';
import type { AuthResponseDto } from '@/api-sdk';
```

### SDK 返回格式

所有 SDK 函数返回 `{ data, error, request, response }`（fields 模式）。**必须解 data**：

```typescript
// ✅ 正确：解包 data
const { data } = await authControllerLogin({ body: { email, password } });
// data 就是 AuthResponseDto

// ✅ 也可以这样
const result = await authControllerLogin({ body: { email, password } });
if (result.error) { /* 处理错误 */ }
const userData = result.data;

// ❌ 错误：直接用 result 当数据
const userData = await authControllerLogin({ body: data }); // ← result 里有 data/error/request/response
```

### 请求参数

```typescript
// JSON 请求体
await authControllerLogin({ body: { email, password } });

// URL 路径参数
await fileSystemControllerGetNode({ path: { nodeId: 'xxx' } });

// 查询参数
await usersControllerFindAll({ query: { page: 1, limit: 20 } });

// 混合
await fileSystemControllerUpdateNode({
  path: { nodeId: 'xxx' },
  body: { name: '新名字' },
});
```

### FormData 上传

SDK 生成的 FormData 类型不够精确，使用场景可以 `as any`：

```typescript
// ✅ FormData 用 as any 是可接受的（SDK 类型限制）
const formData = new FormData();
formData.append('file', blob);
formData.append('commitMessage', msg);
await mxCadControllerSaveMxwebToNode({ path: { nodeId }, body: formData as any });
```

### 错误处理

```typescript
try {
  const { data } = await authControllerLogin({ body: payload });
  return data;
} catch (error) {
  // SDK 的错误已经被 interceptors 标记
  handleError(error, 'auth:login');
}
```

---

## 前端：测试中 mock SDK

```typescript
// ✅ 正确 mock 方式
vi.mock('@/api-sdk', () => ({
  mxCadControllerGetPreloadingData: vi.fn(),
  mxCadControllerCheckExternalReference: vi.fn(),
}));

// 设返回值时必须模拟 SDK 的 { data } 格式
vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
  data: { tz: false, images: [] },
} as any);
// as any 在 mock 场景可接受 —— SDK 返回结构复杂，测试关心的是行为

// ❌ 错误：mockResolvedValue({}) as any 会丢失 data
```

---

## 工作流

```
后端创建/修改 DTO（带 @ApiProperty）
  → 后端 Controller 引用（非 type import，带 @ApiResponse type）
    → 后端重启 → swagger_json.json 更新
      → pnpm generate:api-types → @/api-sdk 重新生成
        → 前端 import from '@/api-sdk'
```

## 检查清单

| 层 | 检查项 |
|----|--------|
| 后端 DTO | [ ] 每个字段有 `@ApiProperty` 或 `@ApiPropertyOptional` |
| 后端 DTO | [ ] Controller 用普通 `import` 而非 `import type` 引入 |
| 后端 Controller | [ ] 有 `@ApiTags` `@ApiOperation` `@ApiResponse(type=)` |
| 前端 | [ ] 类型从 `@/api-sdk` 导入 |
| 前端 | [ ] SDK 返回值用 `.data` 解包 |
| 前端 | [ ] 没用 `as any` 绕过类型（FormData 场景除外） |

## 快速排错

```bash
# 查 DTO 是否在 swagger 中
node -e "const d=require('./swagger_json.json'); console.log(Object.keys(d.components.schemas).filter(k=>k.includes('Xxx')).sort())"

# 看生成的 SDK 里有没有
grep "export.*XxxDto" packages/frontend/src/api-sdk/types.gen.ts

# 重新生成
pnpm generate:api-types

# 验证类型检查
pnpm type-check
```
