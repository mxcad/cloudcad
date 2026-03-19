---
name: api-contracts
description: '涉及 API 定义或使用和修改时必须触发此技能——创建/修改 Controller、DTO、前端 API 调用、Swagger 装饰器、处理 API 返回数据、修复类型不匹配等。确保前后端 API 契约一致性。'
---

# API 契约技能

> **触发条件**：当涉及到 API 的定义（后端 Controller/DTO）或使用（前端调用）时，必须触发此技能

## 触发场景清单

以下场景**必须触发**此技能：

| 场景 | 示例 |
|------|------|
| 创建/修改 Controller | 添加新接口、修改路由 |
| 创建/修改 DTO | 添加字段、修改类型 |
| 修改前端 API 调用 | 修改 `xxxApi.method()` 的使用方式 |
| 处理 API 返回数据 | 修改 `response.data` 的解构逻辑 |
| 修复类型不匹配 | 前端期望的字段名与后端返回不一致 |
| 修改 Swagger 装饰器 | @ApiResponse、@ApiProperty 等 |
| 添加新的 API 方法 | 前端新增 `xxxApi.newMethod()` |

## 核心原则

1. **所有 API 必须通过 OpenAPI 契约驱动**
2. **后端定义 → 自动生成类型 → 前端调用**
3. **禁止前端直接使用 axios/fetch 调用 API**
4. **禁止前端使用 `as unknown as` 绕过类型检查**

## 修复策略选择

当发现前后端类型不匹配时，按以下顺序评估选择最优方案：

### 评估流程

```
1. 分析影响范围：后端有几处调用？前端有几处调用？
2. 评估修改成本：修改后端是否需要改 DTO？修改前端是否需要改多处？
3. 选择最优方案：选择修改点最少、影响最小的方案
```

### 选择原则

| 情况 | 推荐方案 | 原因 |
|------|----------|------|
| 修改后端 DTO 可以让前端无需改动 | 修改后端 | 一处修改，所有调用者受益 |
| 后端实际返回与 DTO 定义不一致 | 修改 DTO 匹配实际返回 | 后端内部不一致，应修复后端 |
| 只有一处前端调用，后端多处使用 | 修改前端 | 成本更低 |
| 前端多处调用，后端只在一处定义 | 修改后端 DTO 并重新生成类型 | 统一修复所有前端调用 |
| 后端是公共 API，被多个前端使用 | 修改前端适配 | 避免影响其他前端应用 |

### 决策示例

```
问题：后端返回 { nodes: [...] }，前端期望 { items: [...] }

分析：
- 后端 TrashListResponseDto 定义 items
- 后端 Service 实际返回 nodes
- 前端调用 getProjectTrash 使用 response.data.items

方案A：修改后端 DTO 为 nodes，重新生成类型
  - 修改：1 处 DTO + 重新生成类型
  - 影响：前端自动获得正确类型

方案B：修改前端使用 nodes
  - 修改：需要用 as unknown 绕过类型（禁止）
  - 或者：修改生成的类型文件（会被覆盖，不推荐）

结论：选择方案A，修改后端 DTO 匹配实际返回
```

---

## 一、后端 API 定义规范

### 1.1 Controller 必须包含的装饰器

```typescript
// ✅ 正确示例
@ApiTags('user')                                    // 1. API 分组标签
@Controller('user')
export class UserController {
  
  @Get()
  @UseGuards(JwtAuthGuard)                          // 2. 认证守卫
  @RequirePermissions([SystemPermission.USER_READ]) // 3. 权限要求
  @ApiBearerAuth()                                  // 4. Bearer Token 标识
  @ApiOperation({ summary: '获取用户列表' })          // 5. 操作描述
  @ApiResponse({                                    // 6. 响应类型定义
    status: 200,
    description: '返回用户列表',
    type: [UserResponseDto],
  })
  async findAll(): Promise<UserResponseDto[]> {
    // ...
  }
}
```

### 1.2 DTO 必须包含的装饰器

```typescript
// ✅ 正确示例
export class UserResponseDto {
  @ApiProperty({ description: '用户 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '用户名', example: 'admin' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'admin@example.com' })
  email?: string;

  @ApiProperty({ 
    description: '状态', 
    enum: ['ACTIVE', 'INACTIVE'],
    example: 'ACTIVE',
  })
  status: string;
}
```

### 1.3 联合类型处理

Swagger 不支持 TypeScript 联合类型，使用 `oneOf`：

```typescript
@ApiProperty({
  description: '配置值',
  schema: {
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
    ],
  },
  example: false,
})
value: string | number | boolean;
```

### 1.4 公开接口（无需登录）

```typescript
@Public()  // 必须添加 @Public() 装饰器
@Get('public')
@ApiOperation({ summary: '获取公开配置' })
async getPublicConfigs() {
  // ...
}
```

---

## 二、前端 API 使用规范

### 2.1 标准模式：定义 Api 对象

**所有前端 API 必须先定义 `xxxApi` 对象，再使用。**

```typescript
// ✅ 正确示例 - services/usersApi.ts
import { getApiClient } from './apiClient';
import type {
  CreateUserDto,
  UpdateUserDto,
} from '../types/api-client';

// 定义 API 对象，封装所有方法
export const usersApi = {
  // 列表查询
  list: (params?) => 
    getApiClient().UsersController_findAll(params),

  // 创建
  create: (data: CreateUserDto) =>
    getApiClient().UsersController_create(null, data),

  // 更新
  update: (id: string, data: UpdateUserDto) =>
    getApiClient().UsersController_update({ id }, data),

  // 删除
  delete: (id: string) =>
    getApiClient().UsersController_remove({ id }),
};
```

### 2.2 在组件中使用

```typescript
// ✅ 正确示例 - 在组件中使用
import { usersApi } from '../services/usersApi';

// 调用 API
const response = await usersApi.list();
const users = response.data;

// 创建用户
await usersApi.create({ username: 'test', email: 'test@example.com' });

// 更新用户
await usersApi.update('123', { username: 'newname' });
```

### 2.3 禁止的方式

```typescript
// ❌ 错误 - 直接使用 axios
import axios from 'axios';
const response = await axios.get('/api/users');

// ❌ 错误 - 直接使用 fetch
const response = await fetch('/api/users');

// ❌ 错误 - 使用 getAxiosInstance() 手动拼接路径
const axios = getAxiosInstance();
const response = await axios.get('/users');

// ❌ 错误 - 直接导出单独的函数（不一致）
export async function getUsers() {
  return getApiClient().UsersController_findAll();
}
export async function createUser(data) {
  return getApiClient().UsersController_create(null, data);
}

// ✅ 正确 - 导出 API 对象
export const usersApi = {
  list: () => getApiClient().UsersController_findAll(),
  create: (data) => getApiClient().UsersController_create(null, data),
};
```

### 2.4 类型引用

```typescript
// ✅ 正确 - 从生成的类型文件导入
import type { UserResponseDto, CreateUserDto } from '../types/api-client';

// 在 API 文件中重新导出类型别名（可选）
export type User = UserResponseDto;
```

---

## 三、完整工作流程

### 3.1 新增 API 的步骤

```
1. 后端：创建 DTO（带 @ApiProperty 装饰器）
   ↓
2. 后端：创建 Controller（带完整 Swagger 装饰器）
   ↓
3. 后端：注册 Module
   ↓
4. 启动后端服务
   ↓
5. 运行 pnpm generate:api-types
   ↓
6. 前端：创建 xxxApi.ts，定义 API 对象
   ↓
7. 前端：在组件中使用 xxxApi.method()
```

### 3.2 生成命令

```bash
# 在项目根目录执行
pnpm generate:api-types
```

---

## 四、文件结构规范

### 4.1 后端结构

```
packages/backend/src/
├── users/
│   ├── users.controller.ts    # Controller（带 Swagger 装饰器）
│   ├── users.service.ts       # 业务逻辑
│   ├── users.module.ts        # 模块注册
│   └── dto/
│       ├── create-user.dto.ts # DTO（带 @ApiProperty）
│       └── update-user.dto.ts
```

### 4.2 前端结构

```
packages/frontend/src/
├── services/
│   ├── apiClient.ts           # OpenAPI 客户端实例
│   ├── usersApi.ts            # ✅ API 对象定义
│   ├── authApi.ts             # ✅ API 对象定义
│   └── runtimeConfigApi.ts    # ✅ API 对象定义
├── types/
│   └── api-client.ts          # 自动生成的类型
└── pages/
    └── UserManagement.tsx     # 使用 usersApi
```

---

## 五、检查清单

### 5.1 后端检查清单

- [ ] Controller 有 `@ApiTags()` 装饰器
- [ ] 每个方法有 `@ApiOperation()` 装饰器
- [ ] 需要认证的方法有 `@ApiBearerAuth()` 装饰器
- [ ] 每个方法有 `@ApiResponse()` 定义响应类型
- [ ] DTO 类有 `@ApiProperty()` / `@ApiPropertyOptional()` 装饰器
- [ ] 公开接口有 `@Public()` 装饰器
- [ ] 权限接口有 `@RequirePermissions()` 装饰器

### 5.2 前端检查清单

- [ ] 创建 `xxxApi.ts` 文件
- [ ] 定义 `export const xxxApi = { ... }` 对象
- [ ] 使用 `getApiClient()` 调用，而非 axios/fetch
- [ ] 类型从 `api-client.ts` 导入
- [ ] 已运行 `pnpm generate:api-types`

---

## 六、常见错误案例

### 错误 1：忘记 Swagger 装饰器

```typescript
// ❌ 错误 - 缺少 @ApiResponse
@Get()
async findAll() {
  return this.service.findAll();
}

// ✅ 正确
@Get()
@ApiOperation({ summary: '获取用户列表' })
@ApiResponse({ status: 200, type: [UserResponseDto] })
async findAll(): Promise<UserResponseDto[]> {
  return this.service.findAll();
}
```

### 错误 2：前端导出单独函数

```typescript
// ❌ 错误 - 不一致的导出方式
export async function getUsers() { ... }
export async function createUser(data) { ... }

// ✅ 正确 - 统一的 API 对象
export const usersApi = {
  list: () => { ... },
  create: (data) => { ... },
};
```

### 错误 3：直接使用 axios

```typescript
// ❌ 错误
const response = await axios.get('/api/users');

// ✅ 正确
const response = await usersApi.list();
```

### 错误 4：忘记生成类型

```typescript
// 添加新 API 后必须执行：
pnpm generate:api-types
```

---

## 七、快速参考

| 场景 | 装饰器/方法 |
|------|------------|
| API 分组 | `@ApiTags('name')` |
| 操作描述 | `@ApiOperation({ summary: '...' })` |
| 响应类型 | `@ApiResponse({ status: 200, type: XxDto })` |
| 认证接口 | `@ApiBearerAuth()` + `@UseGuards(JwtAuthGuard)` |
| 公开接口 | `@Public()` |
| 权限控制 | `@RequirePermissions([Permission.XXX])` |
| DTO 属性 | `@ApiProperty({ description: '...', example: ... })` |
| 可选属性 | `@ApiPropertyOptional(...)` |
| 枚举类型 | `@ApiProperty({ enum: ['A', 'B'] })` |
| 前端 API 对象 | `export const xxxApi = { method: () => getApiClient().XxxController_method() }` |
| 前端调用 | `xxxApi.method()` |

---

## 八、强制执行

**只要涉及 API 定义或使用，AI 必须遵循此规范，不得例外。**

违反此规范的行为包括但不限于：
- 前端直接使用 axios/fetch 调用 API
- 前端导出单独函数而非 API 对象
- 后端 Controller 缺少 Swagger 装饰器
- DTO 缺少 @ApiProperty 装饰器
- 添加新 API 后未运行类型生成命令