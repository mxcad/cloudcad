# CloudCAD 用户系统详细说明

## 概述

CloudCAD 用户系统是基于 NestJS 框架构建的完整用户管理模块，提供用户注册、认证、权限管理等功能。本文档详细说明用户系统的架构、API 接口和使用方法。

## 目录结构

```
src/users/
├── users.module.ts          # 用户模块定义
├── users.controller.ts      # 用户控制器（API 端点）
├── users.service.ts         # 用户业务逻辑服务
├── users.controller.spec.ts # 控制器测试
├── users.service.spec.ts    # 服务测试
└── dto/                     # 数据传输对象
    ├── create-user.dto.ts   # 创建用户 DTO
    ├── update-user.dto.ts   # 更新用户 DTO
    └── query-users.dto.ts   # 查询用户 DTO
```

## 核心组件详解

### 1. UsersModule (users.module.ts)

用户系统的根模块，负责组织用户相关的所有组件。

```typescript
@Module({
  imports: [DatabaseModule],           // 导入数据库模块
  controllers: [UsersController],     // 注册用户控制器
  providers: [                        // 注册服务提供者
    UsersService,                     // 用户服务
    PermissionService,                // 权限服务
    PermissionCacheService,           // 权限缓存服务
  ],
  exports: [UsersService],           // 导出用户服务供其他模块使用
})
```

**关键点：**
- 使用 `DatabaseModule` 提供 Prisma 客户端
- 集成权限管理服务
- 导出 `UsersService` 供其他模块复用

### 2. UsersController (users.controller.ts)

处理 HTTP 请求和响应的控制器层，定义所有用户相关的 API 端点。

#### 装饰器说明

- `@Controller('users')`: 定义路由前缀 `/users`
- `@UseGuards(JwtAuthGuard, RolesGuard)`: 应用 JWT 认证和角色权限守卫
- `@Roles(UserRole.ADMIN)`: 限制只有管理员可访问
- `@HttpCode(HttpStatus.CREATED)`: 设置响应状态码

#### API 端点详解

| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| POST | `/users` | ADMIN | 创建新用户 |
| GET | `/users` | ADMIN | 获取用户列表（支持分页和搜索） |
| GET | `/users/:id` | ADMIN | 获取指定用户详情 |
| PATCH | `/users/:id` | ADMIN | 更新用户信息 |
| DELETE | `/users/:id` | ADMIN | 删除用户 |
| PATCH | `/users/:id/status` | ADMIN | 更新用户状态 |
| GET | `/users/profile/me` | USER | 获取当前用户资料 |
| PATCH | `/users/profile/me` | USER | 更新当前用户资料 |

#### 请求示例

**创建用户 (POST /users)**
```json
{
  "email": "user@example.com",
  "username": "newuser",
  "password": "password123",
  "nickname": "新用户",
  "avatar": "https://example.com/avatar.jpg",
  "role": "USER"
}
```

**查询用户列表 (GET /users)**
```
GET /users?search=keyword&role=USER&page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

### 3. UsersService (users.service.ts)

核心业务逻辑服务，处理所有用户相关的数据操作。

#### 主要方法

##### create(createUserDto: CreateUserDto)
创建新用户，包含：
- 邮箱和用户名唯一性验证
- 密码加密（bcryptjs，12轮盐值）
- 数据库事务处理
- 日志记录

##### findAll(query: QueryUsersDto)
分页查询用户列表，支持：
- 关键词搜索（邮箱、用户名、昵称）
- 角色筛选
- 分页处理
- 自定义排序

##### findOne(id: string)
根据 ID 查询用户详情，自动排除密码字段。

##### update(id: string, updateUserDto: UpdateUserDto)
更新用户信息，包含：
- 存在性验证
- 唯一性检查
- 密码重新加密
- 权限缓存清理

##### remove(id: string)
删除用户，包含：
- 存在性验证
- 级联删除处理
- 日志记录

#### 安全特性

1. **密码加密**：使用 bcryptjs，12轮盐值
2. **数据验证**：输入参数严格验证
3. **错误处理**：统一的异常处理机制
4. **日志记录**：完整的操作日志
5. **缓存管理**：权限相关缓存自动清理

### 4. DTO (Data Transfer Objects)

#### CreateUserDto (create-user.dto.ts)
创建用户的数据验证规则：

```typescript
export class CreateUserDto {
  @IsEmail()                    // 邮箱格式验证
  email: string;

  @IsString()
  @MinLength(3)                 // 用户名最小长度
  username: string;

  @IsString()
  @MinLength(6)                 // 密码最小长度
  password: string;

  @IsOptional()                  // 可选字段
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(UserRole)             // 角色枚举验证
  role?: UserRole = UserRole.USER;
}
```

#### UpdateUserDto (update-user.dto.ts)
更新用户的数据验证规则，所有字段都是可选的。

#### QueryUsersDto (query-users.dto.ts)
查询参数验证规则：

```typescript
export class QueryUsersDto {
  @IsOptional()
  @IsString()
  search?: string;              // 搜索关键词

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;              // 角色筛选

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;            // 页码，默认1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 20;          // 每页数量，默认20

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt'; // 排序字段，默认创建时间

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc'; // 排序方向，默认降序
}
```

## 数据模型

### User 模型 (Prisma Schema)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique           // 邮箱，唯一
  username  String   @unique           // 用户名，唯一
  password  String                     // 加密密码
  nickname  String?                    // 昵称，可选
  avatar    String?                    // 头像URL，可选
  role      UserRole @default(USER)    // 用户角色
  status    UserStatus @default(ACTIVE) // 用户状态
  createdAt DateTime @default(now())   // 创建时间
  updatedAt DateTime @updatedAt        // 更新时间

  // 关联关系
  projectMemberships ProjectMember[]  // 项目成员关系
  createdFiles       File[]           // 创建的文件
  fileAccesses       FileAccess[]     // 文件访问权限
  ownedProjects     Project[]         // 拥有的项目

  @@map("users")
}
```

### 枚举类型

```typescript
// 用户角色
enum UserRole {
  ADMIN,  // 管理员
  USER    // 普通用户
}

// 用户状态
enum UserStatus {
  ACTIVE,     // 活跃
  INACTIVE,   // 非活跃
  SUSPENDED   // 暂停
}
```

## 权限系统

### 角色权限

- **ADMIN**: 完全访问权限，可以管理所有用户
- **USER**: 基础权限，只能管理自己的资料

### 权限装饰器

```typescript
@Roles(UserRole.ADMIN)           // 限制管理员访问
@UseGuards(JwtAuthGuard, RolesGuard) // 应用认证和权限守卫
```

### 权限缓存

使用 `PermissionCacheService` 缓存用户权限信息，提高查询性能。当用户角色或状态变更时，自动清除相关缓存。

## 安全措施

### 1. 密码安全
- 使用 bcryptjs 加密，12轮盐值
- 密码不在响应中返回
- 密码更新时重新加密

### 2. 输入验证
- 使用 class-validator 进行严格验证
- 邮箱格式验证
- 字符串长度限制
- 枚举值验证

### 3. 唯一性约束
- 邮箱唯一性检查
- 用户名唯一性检查
- 数据库层面唯一约束

### 4. 错误处理
- 统一异常处理
- 敏感信息不泄露
- 详细错误日志记录

## 使用示例

### 创建用户

```typescript
// 在其他模块中使用 UsersService
import { UsersService } from '../users/users.service';

@Injectable()
export class SomeService {
  constructor(private usersService: UsersService) {}

  async createNewUser() {
    const userData = {
      email: 'newuser@example.com',
      username: 'newuser',
      password: 'securepassword',
      nickname: '新用户'
    };

    return await this.usersService.create(userData);
  }
}
```

### 查询用户

```typescript
// 分页查询活跃用户
const result = await usersService.findAll({
  role: UserRole.USER,
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

// 结果结构
{
  data: [...],           // 用户列表
  pagination: {
    page: 1,
    limit: 10,
    total: 100,
    totalPages: 10
  }
}
```

## 测试

### 单元测试
- `users.service.spec.ts`: 服务层测试
- `users.controller.spec.ts`: 控制器测试

### 测试覆盖范围
- 所有公共方法的正常流程
- 异常情况处理
- 边界条件测试
- 权限验证测试

## 最佳实践

### 1. 错误处理
- 使用 NestJS 内置异常
- 提供有意义的错误消息
- 记录详细日志

### 2. 性能优化
- 使用数据库索引
- 合理使用缓存
- 分页查询大数据集

### 3. 安全考虑
- 永远不在响应中返回密码
- 验证所有输入参数
- 使用 HTTPS 传输敏感数据

### 4. 代码组织
- 保持控制器简洁
- 业务逻辑放在服务层
- 使用 DTO 进行数据验证

## 扩展建议

1. **邮箱验证**：添加邮箱验证功能
2. **密码重置**：实现密码重置流程
3. **用户画像**：扩展用户属性
4. **批量操作**：支持批量用户管理
5. **审计日志**：记录所有用户操作
6. **多因素认证**：增强安全性

## 常见问题

### Q: 如何自定义用户角色？
A: 修改 `UserRole` 枚举和相关的权限检查逻辑。

### Q: 如何添加用户字段？
A: 更新 Prisma schema，重新生成客户端，然后更新 DTO 和服务。

### Q: 如何优化大量用户的查询性能？
A: 添加数据库索引，使用缓存，实现更高效的分页策略。

### Q: 如何实现用户权限的细粒度控制？
A: 扩展权限系统，实现基于资源的访问控制（RBAC）。