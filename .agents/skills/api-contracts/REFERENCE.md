# API 契约参考手册

## 后端：DTO 装饰器规范

DTO 每个字段必须有装饰器，否则 Swagger 不导出：

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNodeDto {
  @ApiProperty({ description: '节点名称', example: '新文件夹' })
  name: string;

  @ApiPropertyOptional({ description: '说明', example: '可选描述' })
  description?: string;

  @ApiProperty({ description: '类型', enum: ['folder', 'file'], example: 'folder' })
  nodeType: 'folder' | 'file';
}
```

**注意：** `import type { XxxDto }` 在 Controller 中会导致 Swagger 无法解析类型 → 必须用普通 `import`。

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

## 前端：SDK 使用详细规范

### 导入方式

```typescript
import { authControllerLogin } from '@/api-sdk';
import type { AuthResponseDto } from '@/api-sdk';
```

### 返回格式

所有 SDK 函数返回 `{ data, error, request, response }`（fields 模式）。必须解 `data`：

```typescript
const { data } = await authControllerLogin({ body: { email, password } });
// data 就是 AuthResponseDto

// 错误时
const result = await authControllerLogin({ body: data });
if (result.error) { /* 处理错误 */ }
```

### 请求参数格式

| 场景 | 参数名 | 示例 |
|------|--------|------|
| JSON body | `body` | `{ body: { email, password } }` |
| 路径参数 | `path` | `{ path: { nodeId: 'xxx' } }` |
| 查询参数 | `query` | `{ query: { page: 1 } }` |
| 混合 | `path+body` | `{ path: { id }, body: { name } }` |

### 错误处理

```typescript
try {
  const { data } = await authControllerLogin({ body: payload });
  return data;
} catch (error) {
  handleError(error, 'auth:login');
}
```

## 测试 mock

```typescript
vi.mock('@/api-sdk', () => ({
  mxCadControllerGetPreloadingData: vi.fn(),
}));

vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
  data: { tz: false, images: [] },
} as any);
// as any 在 mock 场景可接受
```

## 检查清单

| 层 | 检查项 |
|----|--------|
| 后端 DTO | 每个字段有 `@ApiProperty` 或 `@ApiPropertyOptional` |
| 后端 DTO | Controller 用普通 `import` 而非 `import type` |
| 后端 Controller | 有 `@ApiTags` `@ApiOperation` `@ApiResponse(type=)` |
| 前端 | 类型从 `@/api-sdk`（或 `@cloudcad/api-sdk` 深导入）导入 |
| 前端 | 深导入（`client.gen`/`sdk.gen`/`types.gen`/`core/*`）必须走 `@cloudcad/api-sdk/...` 包路径 |
| 前端 | SDK 返回值用 `.data` 解包 |
| 前端 | 没用 `as any` 绕过（multipart 场景除外：body 传普通对象 `as never`，禁传原生 FormData） |
| 类型检查 | DTO 改动后执行 `pnpm type-check` 验证两端前端类型正确性 |

## 快速排错

```bash
# 查 DTO 是否在 swagger 中
node -e "const d=require('./swagger_json.json'); console.log(Object.keys(d.components.schemas).filter(k=>k.includes('Xxx')).sort())"

# 看生成的 SDK 里有没有
grep "export.*XxxDto" packages/api-sdk/src/types.gen.ts

# 重新生成
pnpm generate:api-types
```
