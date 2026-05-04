---
name: api-contracts
description: API contract enforcement — backend DTOs → Swagger → auto-generated frontend types. AUTO-TRIGGER on: DTO creation/modification, Swagger decorators, frontend API calls, type mismatches, "is not a function" errors, "has no exported member" errors, CreateXxxDto/UpdateXxxDto undefined, any changes to api-client.ts or swagger-related files.
---

# API 契约技能

> **自动触发**：看到以下关键词时立即触发此技能
> - `is not a function` / `has no exported member` / `Module has no exported member`
> - 类型缺失：`CreateNodeDto` / `UpdateNodeDto` / `CreateFolderDto` / `MoveNodeDto` / `CopyNodeDto` 等 DTO 找不到
> - 操作创建/修改 Controller、DTO、Swagger 装饰器、前端 API 调用
> - `pnpm generate:api-types` / `swagger_json.json` / `api-client.ts`

---

## 🚨 最高优先级规则：类型缺失先查后端

**当发现前端 `api-client.ts` 中缺少某个 DTO 类型时，必须按以下顺序处理：**

```
1. 检查 swagger_json.json 的 components.schemas 中是否有该 DTO
   ├── 有 → 问题在 openapicmd 生成，重新运行 pnpm generate:api-types
   └── 没有 → 问题在后端，检查对应 DTO 文件
              ↓
         2. 检查后端 DTO 是否缺少 @ApiProperty 装饰器
              ↓
         3. 补全装饰器 → 重启后端 → swagger 自动更新 → 类型自动生成
```

## ❌ 绝对禁止

**禁止在前端服务文件中本地定义缺失的 DTO 类型：**

```typescript
// ❌❌❌ 严禁这样做
// services/nodeApi.ts
export interface CreateNodeDto {  // ← 绝对不行！
  name: string;
  parentId: string;
}
```

**原因：** 脱离契约的类型定义会与后端不同步，后续后端改 DTO 时前端不会感知，导致隐蔽 bug。必须修复后端 Swagger 装饰器，让类型自动生成。

## 核心原则

1. **所有 API 必须通过 OpenAPI 契约驱动**
2. **后端定义 → 自动生成类型 → 前端调用**
3. **禁止前端直接使用 axios/fetch 调用 API**
4. **禁止前端使用 `as unknown as` 绕过类型检查**

## 修复策略选择

当发现前后端类型不匹配时：

| 情况 | 推荐方案 | 原因 |
|------|----------|------|
| DTO 在 swagger_json 中缺失 | **修复后端 DTO 的 @ApiProperty** | 源头修复，全链路受益 |
| 修改后端 DTO 可以让前端无需改动 | 修改后端 | 一处修改，所有调用者受益 |
| 后端实际返回与 DTO 定义不一致 | 修改 DTO 匹配实际返回 | 后端内部不一致，应修复后端 |
| 只有一处前端调用，后端多处使用 | 修改前端 | 成本更低 |

---

## 一、后端 API 定义规范

### 1.1 Controller 必须包含的装饰器

```typescript
@ApiTags('user')
@Controller('user')
export class UserController {
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions([SystemPermission.USER_READ])
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户列表' })
  @ApiResponse({ status: 200, description: '返回用户列表', type: [UserResponseDto] })
  async findAll(): Promise<UserResponseDto[]> { ... }
}
```

### 1.2 DTO 必须包含的装饰器（这是类型缺失的头号根因）

```typescript
export class UserResponseDto {
  @ApiProperty({ description: '用户 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '用户名', example: 'admin' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'admin@example.com' })
  email?: string;

  @ApiProperty({ description: '状态', enum: ['ACTIVE', 'INACTIVE'], example: 'ACTIVE' })
  status: string;
}
```

**每个字段必须有 @ApiProperty 或 @ApiPropertyOptional，否则该字段不会出现在 swagger_json 中。**

### 1.3 联合类型处理

```typescript
@ApiProperty({
  description: '配置值',
  schema: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
  example: false,
})
value: string | number | boolean;
```

---

## 二、前端 API 使用规范

### 2.1 标准模式：定义 Api 对象

```typescript
import { getApiClient } from './apiClient';
import type { CreateUserDto, UpdateUserDto } from '../types/api-client';

export const usersApi = {
  list: (params?) => getApiClient().UsersController_findAll(params),
  create: (data: CreateUserDto) => getApiClient().UsersController_create(null, data),
  update: (id: string, data: UpdateUserDto) => getApiClient().UsersController_update({ id }, data),
  delete: (id: string) => getApiClient().UsersController_remove({ id }),
};
```

### 2.2 禁止的方式

```typescript
// ❌ 直接使用 axios/fetch
// ❌ 使用 getAxiosInstance() 手动拼接路径
// ❌ 导出单独函数（不一致）
// ❌ 本地定义 DTO 类型（脱离契约）
```

### 2.3 类型引用

```typescript
// ✅ 从生成的类型文件导入
import type { UserResponseDto, CreateUserDto } from '../types/api-client';
```

---

## 三、完整工作流程

```
1. 后端：创建 DTO（每个字段带 @ApiProperty 装饰器）
   ↓
2. 后端：创建 Controller（带完整 Swagger 装饰器）
   ↓
3. 后端：注册 Module
   ↓
4. 启动后端 → 自动写 swagger_json.json 到 packages/frontend/
   ↓
5. Vite 自动检测 → 运行 pnpm generate:api-types → HMR 刷新
   （或手动：cd packages/frontend && pnpm generate:api-types）
   ↓
6. 前端：从 api-client.ts 导入类型，创建 xxxApi.ts
   ↓
7. 前端：在组件中使用 xxxApi.method()
```

---

## 四、检查清单

### 后端
- [ ] Controller 有 `@ApiTags()` / `@ApiOperation()` / `@ApiResponse()`
- [ ] DTO 每个字段有 `@ApiProperty()` 或 `@ApiPropertyOptional()`
- [ ] 需要认证的方法有 `@ApiBearerAuth()`
- [ ] `swagger_json.json` 中确认 DTO 已出现

### 前端
- [ ] 类型从 `api-client.ts` 导入
- [ ] 不本地定义 DTO
- [ ] 使用 `getApiClient()` 调用

---

## 五、快速参考

| 场景 | 装饰器/方法 |
|------|------------|
| DTO 属性 | `@ApiProperty({ description: '...', example: ... })` |
| 可选属性 | `@ApiPropertyOptional(...)` |
| API 分组 | `@ApiTags('name')` |
| 操作描述 | `@ApiOperation({ summary: '...' })` |
| 响应类型 | `@ApiResponse({ status: 200, type: XxDto })` |
| 认证接口 | `@ApiBearerAuth()` + `@UseGuards(JwtAuthGuard)` |
| 公开接口 | `@Public()` |
| 生成类型 | `cd packages/frontend && pnpm generate:api-types` |

---

## 六、强制执行

**只要涉及 API 定义或使用，AI 必须遵循此规范，不得例外。**

违反此规范的行为：
- 前端直接使用 axios/fetch 调用 API
- 前端在服务文件中本地定义缺失的 DTO 类型 ← **新增，头号反模式**
- 后端 DTO 缺少 @ApiProperty 装饰器
- 添加新 API 后未运行类型生成命令
