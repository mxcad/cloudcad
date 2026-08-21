# Service 组织模式

后端业务逻辑的标准写法和模块组织方式。

## 标准 Service 结构

```typescript
@Injectable()
export class XxxService {
  constructor(
    // 依赖注入 — 使用 Token 或具体类
    private readonly dependencyA: DependencyAService,
    @Inject(SOME_TOKEN) private readonly dependencyB: ISomeInterface,
  ) {}

  // 公共方法 — 对外暴露的 API
  async doSomething(dto: DoSomethingDto): Promise<Result> {
    // 1. 校验
    this.validate(dto);
    // 2. 业务逻辑
    const result = await this.dependencyA.process(dto);
    // 3. 审计日志（敏感操作）
    this.logger.log({ action: 'XXX', resourceType: 'Yyy', userId: dto.userId, success: true }, 'audit');
    // 4. 返回
    return result;
  }

  // 私有方法 — 内部实现细节
  private validate(dto: DoSomethingDto): void { ... }
}
```

## 关注点分离

- **Service 只负责业务逻辑** — 不处理 HTTP 请求/响应格式
- **Controller 只做路由委托** — 提取参数 → 调用 Service → 返回结果
- **DTO 负责校验** — `class-validator` 装饰器

```typescript
// ✅ Controller — 极简，只做路由
@Post('create')
async create(@Body() dto: CreateDto) {
  return this.xxxService.create(dto);
}

// ✅ Service — 所有业务逻辑在这里
async create(dto: CreateDto): Promise<Xxx> {
  // 业务校验、数据转换、外部调用...
}
```

## 事务使用

关联写操作必须包裹在事务中：

```typescript
// ✅ 正确 — $transaction
await this.prisma.$transaction(async (tx) => {
  const parent = await tx.fileSystemNode.create({ data: parentData });
  await tx.fileSystemNode.create({ data: { ...childData, parentId: parent.id } });
});
```

## 异常处理

- 使用 `HttpException` 或自定义异常（`src/common/exceptions/`）
- 不吞异常 — 让 NestJS 异常过滤器统一处理
- 不返回 `null` 表示错误 — 抛异常

```typescript
// ❌ 错误
async findUser(id: string): Promise<User | null> {
  return this.prisma.user.findUnique({ where: { id } });
  // 调用方需要 null check，容易遗漏
}

// ✅ 正确
async findUser(id: string): Promise<User> {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundException(`User ${id} not found`);
  return user;
}
```

## 命名约定

| 类型 | 命名 | 示例 |
|------|------|------|
| Service 类 | `XxxService` | `FileOperationsService` |
| 查找单个 | `getXxx`, `findXxx` | `getNode(nodeId)` |
| 查找多个 | `getXxxs`, `listXxx` | `getChildren(parentId)` |
| 创建 | `createXxx` | `createFile(dto)` |
| 更新 | `updateXxx` | `updateFile(nodeId, dto)` |
| 删除 | `deleteXxx` | `deleteFile(nodeId)` |
| 校验 | `validateXxx` | `validateQuota(userId, size)` |

## 可替换模块 vs 内部服务

创建 Service 时，判断是「可替换模块」还是「内部服务」：

- **可替换模块**：OSS/Pro/Enterprise 有不同实现 → `interfaces/` + DI token（参考 `replaceable-module` skill）
- **内部服务**：所有场景实现一致 → class-based DI，无接口文件

判断依据：问「这个模块在 OSS 和 Pro 中实现会不同吗？」。明确不会则不做接口抽象。

```typescript
// 可替换模块 — 接口 + token
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
export interface IStorageProvider { ... }
@Module({ providers: [{ provide: STORAGE_PROVIDER, useClass: OssStorage }] })
// 消费方
@Inject(STORAGE_PROVIDER) private provider: IStorageProvider

// 内部服务 — class-based DI
@Injectable()
export class CacheService { ... }
@Module({ providers: [CacheService] })
// 消费方
private cache: CacheService
```

详见 ADR-0020。

## 文档引用

- Façade 模式：`backend-coding-standards/docs/facade-pattern.md`
- 审计日志：`backend-coding-standards/docs/audit-logging.md`
- 可替换模块判断：ADR-0020 + `replaceable-module` skill
