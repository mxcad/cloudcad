---
name: api-contracts
description: AUTO-TRIGGER on any of: "has no exported member", "is not a function", "Module.*has no exported member", DTO/controller modification, type mismatch between frontend/backend, swagger changes, generate:api-types. Enforces backend-first fixes — never patch types in frontend.
---

# API 契约

```
IF you see this error pattern → DO NOT fix it in frontend → CHECK backend DTO first
```

## 决策树（先看这个）

```
前端类型报错：CreateXxxDto / UpdateXxxDto / XxxDto 找不到
  │
  ├── Step 1: 检查 swagger_json.json 的 components.schemas
  │     node -e "const d=require('./swagger_json.json'); console.log(Object.keys(d.components.schemas).filter(k=>k.includes('Xxx')))"
  │     │
  │     ├── 有该 DTO → 问题在 openapicmd，重新 pnpm generate:api-types
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
        后端重启 → swagger_json.json 确认 DTO 出现 → Vite 自动重新生成类型 → 前端错误消失
```

## 🚫 绝对禁止

```typescript
// ❌ 前端 services/nodeApi.ts — 禁止这样做！
interface CreateNodeDto { name: string; parentId: string }  // ← 脱离契约，下次后端改就炸

// ❌ 前端 types/ 目录 — 禁止手写 DTO
// ❌ 用 as any 绕过类型检查 — 禁止
// ❌ 用 as unknown as XxxDto 强转 — 禁止
```

## ✅ 正确做法

```typescript
// 前端只从自动生成的 api-client.ts 导入类型
import type { CreateNodeDto } from '@/types/api-client';  // ✅

// 类型缺失时 → 修后端 DTO → 重新生成 → 前端自动拿到
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

## 前端：API 服务规范

```typescript
// services/usersApi.ts
import { getApiClient } from './apiClient';
import type { CreateUserDto, UpdateUserDto } from '@/types/api-client';  // ✅ 自动生成

export const usersApi = {
  list: (params?) => getApiClient().UsersController_findAll(params),
  create: (data: CreateUserDto) => getApiClient().UsersController_create(null, data),
};

// ❌ 禁止：export async function getUsers() { ... }  （导出单独函数）
// ❌ 禁止：const res = await axios.get('/api/users')  （直接用 axios）
```

---

## 工作流

```
后端创建/修改 DTO（带 @ApiProperty）
  → 后端 Controller 引用（非 type import，带 @ApiResponse type）
    → 后端重启 → swagger_json.json 自动写入 packages/frontend/
      → Vite 检测变化 → 自动 pnpm generate:api-types → HMR 刷新
        → 前端导入新类型 → 使用
```

手动生成：`cd packages/frontend && pnpm generate:api-types`

---

## 检查清单

| 层 | 检查项 |
|----|--------|
| 后端 DTO | [ ] 每个字段有 `@ApiProperty` 或 `@ApiPropertyOptional` |
| 后端 DTO | [ ] Controller 用普通 `import` 而非 `import type` 引入 |
| 后端 Controller | [ ] 有 `@ApiTags` `@ApiOperation` `@ApiResponse(type=)` |
| swagger_json | [ ] `components.schemas` 中 DTO 已出现 |
| 前端 | [ ] 类型从 `api-client.ts` 导入，非本地定义 |
| 前端 | [ ] 使用 `xxxApi.method()` 而非 axios/fetch |

---

## 快速排错

```bash
# 查 DTO 是否在 swagger 中
node -e "const d=require('./swagger_json.json'); console.log(Object.keys(d.components.schemas).filter(k=>k.includes('Xxx')).sort())"

# 看生成的类型里有没有
grep "export interface XxxDto" packages/frontend/src/types/api-client.ts

# 重新生成
cd packages/frontend && pnpm generate:api-types

# 验证类型检查
cd packages/frontend && pnpm type-check
```
