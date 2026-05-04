---
name: nestjs-circular-dependency
description: |
  解决 NestJS 所有循环依赖问题的最佳实践指南。包括：模块导入循环依赖、Swagger DTO 循环引用、Prisma 双向关系处理。触发条件：circular dependency、循环依赖、模块相互导入、forwardRef、A circular dependency has been detected、bidirectional relationships、ApiProperty type、Swagger schema 循环。
---

# NestJS 循环依赖完整解决方案
> 交叉参考: api-contracts（Swagger DTO 循环引用与 @ApiProperty 装饰器）

## 问题类型识别

首先识别你遇到的是哪种循环依赖：

| 问题类型 | 错误信息特征 | 章节 |
|---------|-------------|------|
| **模块导入循环** | `Circular dependency between X and Y` | [第一节](#第一节模块导入循环依赖) |
| **Swagger DTO 循环** | `A circular dependency has been detected (property key: "xxx")` | [第二节](#第二节swagger-dto-循环引用) |
| **Prisma 双向关系** | Swagger 文档生成时类型错误 | [第三节](#第三节prisma-双向关系处理) |

---

# 第一节：模块导入循环依赖

## 核心原则

**模块依赖必须是单向的（DAG），而数据库关系可以是双向的。**

| 数据库关系 | 模块依赖 |
|-----------|---------|
| 可以双向（Author ↔ Book） | 必须单向（A → B） |
| ORM 天然支持 | 双向导入 = 循环错误 |

## 解决方案（按优先级）

### 方案 1：分离共享类型到公共模块 ⭐ 推荐

**适用场景**：两个模块只为共享类型/DTO 而相互依赖

```
Before:  A ←→ B (循环)
After:   A → common ← B (无循环)
```

**示例**：
```typescript
// ❌ 错误：UserModule 和 OrderModule 相互导入只为共享 DTO
// user.module.ts
@Module({ imports: [OrderModule] })  // 只为 OrderDto

// ✅ 正确：创建 common/dto/user-order.dto.ts
// user.module.ts 和 order.module.ts 都从 common 导入
@Module({ imports: [CommonModule] })
```

---

### 方案 2：引入编排模块 ⭐ 推荐

**适用场景**：两个模块确实需要相互调用服务

```
Before:  A ←→ B (循环)
After:   Orchestrator
             ├── A
             └── B
```

**示例**：
```typescript
// publishing.module.ts
@Module({
  imports: [AuthorsModule, BooksModule],
  providers: [PublishingService],
})
export class PublishingModule {}

@Injectable()
export class PublishingService {
  constructor(
    private authorsService: AuthorsService,
    private booksService: BooksService,
  ) {}

  async getAuthorWithBooks(authorId: string) {
    const author = await this.authorsService.findOne(authorId);
    const books = await this.booksService.findByAuthor(authorId);
    return { ...author, books };
  }
}
```

---

### 方案 3：接口抽象 + 动态注册

**适用场景**：多个模块需要实现同一接口，且需要动态扩展

```typescript
// 1. 定义接口
export interface IDataProvider {
  getType(): string;
  getData(id: string): Promise<any>;
}
export const DATA_PROVIDER_TOKEN = Symbol('DATA_PROVIDER');

// 2. 各模块实现接口
@Injectable()
export class BooksService implements IDataProvider {
  getType() { return 'book'; }
  async getData(id: string) { return this.findBook(id); }
}

// 3. 注册到中央模块
@Module({
  providers: [
    BooksService,
    ArticlesService,
    {
      provide: DATA_PROVIDER_TOKEN,
      useFactory: (books, articles) => [books, articles],
      inject: [BooksService, ArticlesService],
    },
  ],
})
export class DataAggregationModule {}
```

---

### 方案 4：事件驱动架构

**适用场景**：模块间是通知/响应关系

```typescript
// 发布方
@Injectable()
export class OrdersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.save(dto);
    this.eventEmitter.emit('order.created', { orderId: order.id });
    return order;
  }
}

// 订阅方
@Injectable()
export class NotificationService {
  @OnEvent('order.created')
  async handleOrderCreated(event: { orderId: string }) {
    await this.sendNotification(event.orderId);
  }
}
```

---

### 方案 5：forwardRef() ⚠️ 最后手段

```typescript
@Module({
  imports: [forwardRef(() => OtherModule)],
})
export class MyModule {}
```

**警告**：这只是延迟解析，没有真正解决架构问题！

---

# 第二节：Swagger DTO 循环引用

## 问题特征

```
Error: A circular dependency has been detected (property key: "PERMISSION_GRANT").
Please, make sure that each side of a bidirectional relationships are using lazy resolvers ("type: () => ClassType").
```

## 根本原因

Swagger 在生成 OpenAPI 文档时，发现 DTO 类之间存在循环引用：
- DTO A 引用了 DTO B 的类型
- DTO B 又引用了 DTO A 的类型

## 解决方案：Lazy Resolver

### ❌ 错误写法

```typescript
// 直接引用类型 - 会导致循环引用
export class UserDto {
  @ApiProperty({ type: OrderDto })  // ❌ 直接引用
  orders: OrderDto[];
}

export class OrderDto {
  @ApiProperty({ type: UserDto })   // ❌ 直接引用
  user: UserDto;
}
```

### ✅ 正确写法：使用 Lazy Resolver

```typescript
// 使用箭头函数延迟解析
export class UserDto {
  @ApiProperty({ type: () => OrderDto })  // ✅ lazy resolver
  orders: OrderDto[];
}

export class OrderDto {
  @ApiProperty({ type: () => UserDto })   // ✅ lazy resolver
  user: UserDto;
}
```

## 常见场景与修复

### 场景 1：枚举类型的循环引用

```typescript
// ❌ 错误
@ApiProperty({
  enum: AuditAction,  // 直接引用枚举
  description: '操作类型',
})
action: AuditAction;

// ✅ 正确
@ApiProperty({
  enum: AuditAction,
  enumName: 'AuditAction',  // 添加 enumName
  description: '操作类型',
})
action: AuditAction;
```

### 场景 2：嵌套 DTO 数组

```typescript
// ❌ 错误
@ApiProperty({ type: [ItemDto] })  // 数组语法
items: ItemDto[];

// ✅ 正确
@ApiProperty({ type: () => [ItemDto] })  // lazy resolver + 数组
items: ItemDto[];
```

### 场景 3：可选的自引用

```typescript
// ❌ 错误 - 自引用
export class CategoryDto {
  @ApiProperty({ type: CategoryDto })
  parent?: CategoryDto;
}

// ✅ 正确 - 使用 lazy resolver
export class CategoryDto {
  @ApiProperty({ type: () => CategoryDto })
  parent?: CategoryDto;
}
```

## 修复流程

1. **定位问题 DTO**：从错误信息的 `property key` 找到对应的 `@ApiProperty`
2. **检查类型引用**：看是否直接使用了 `type: ClassName`
3. **改为 lazy resolver**：`type: () => ClassName`
4. **验证修复**：重新启动应用，确认错误消失

---

# 第三节：Prisma 双向关系处理

## 问题场景

Prisma schema 中定义了双向关系：

```prisma
model User {
  posts    Post[]
}

model Post {
  author   User    @relation(fields: [authorId], references: [id])
  authorId String
}
```

当这些模型用作 DTO 时，Swagger 无法处理循环引用。

## 解决方案

### 方案 1：分离响应 DTO（推荐）

不要直接使用 Prisma 模型作为响应，创建专门的 DTO：

```typescript
// ❌ 错误：直接使用 Prisma 模型
@Get('users/:id')
findOne(@Param('id') id: string): Promise<User> {  // User 是 Prisma 模型
  return this.usersService.findOne(id);
}

// ✅ 正确：使用专门的响应 DTO
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: () => [PostSummaryDto] })  // 使用摘要 DTO
  posts: PostSummaryDto[];
}

export class PostSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  // 不包含 author，避免循环
}

@Get('users/:id')
findOne(@Param('id') id: string): Promise<UserResponseDto> {
  return this.usersService.findOne(id);
}
```

### 方案 2：使用 Omit 排除循环字段

```typescript
import { User, Post } from '@prisma/client';

// 创建不含循环引用的类型
export type UserWithoutPosts = Omit<User, 'posts'>;

export class UserDto implements UserWithoutPosts {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  // posts 字段单独处理，使用 lazy resolver
  @ApiProperty({ type: () => [PostDto] })
  posts?: PostDto[];
}
```

### 方案 3：使用 class-transformer 排除

```typescript
import { Exclude, Expose } from 'class-transformer';

export class UserDto {
  @ApiProperty()
  id: string;

  @Exclude()  // 排除 posts 避免序列化循环
  posts: Post[];

  constructor(partial: Partial<UserDto>) {
    Object.assign(this, partial);
  }
}

// 在控制器中使用
@UseInterceptors(ClassSerializerInterceptor)
@Get('users/:id')
findOne(@Param('id') id: string): Promise<UserDto> {
  return this.usersService.findOne(id);
}
```

---

# 诊断与执行流程

## 完整诊断流程

```
1. 识别问题类型
   ├── 模块导入循环 → 使用第一节方案
   ├── Swagger DTO 循环 → 使用第二节方案
   └── Prisma 双向关系 → 使用第三节方案

2. 定位问题代码
   ├── 模块循环：分析 imports 关系
   ├── DTO 循环：查找 property key 对应的 @ApiProperty
   └── Prisma 关系：检查 schema 和 DTO 定义

3. 选择解决方案
   └── 根据场景选择最合适的方案

4. 实施修复
   └── 提供具体代码示例

5. 验证修复
   └── 重新启动应用确认错误消失
```

---

# 架构检查清单

## ✅ 正确的做法

- [ ] 模块依赖形成 DAG（有向无环图）
- [ ] DTO 使用 `type: () => ClassName` lazy resolver
- [ ] 响应 DTO 与 Prisma 模型分离
- [ ] 共享类型放在 common 模块
- [ ] 编排逻辑放在更高级别模块

## ❌ 错误的做法

- [ ] 模块相互导入
- [ ] DTO 直接引用类型 `type: ClassName`
- [ ] 直接使用 Prisma 模型作为响应
- [ ] 过度使用 forwardRef
- [ ] 在 common 模块导入业务模块

---

# 参考资源

- [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)
- [NestJS Swagger OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [Prisma Relations](https://www.prisma.io/docs/concepts/components/prisma-schema/relations)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
