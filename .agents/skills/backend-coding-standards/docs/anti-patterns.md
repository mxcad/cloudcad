# 后端反模式清单

## DI 反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `import type { XService }` 用于 DI 类 | `import { XService }` |
| `forwardRef(() => XModule)` | Token 注入 + 单向依赖 DAG |
| 直接注入具体类 `XService` | 必要时用 `@Inject(TOKEN)` 注入接口 |
| Module 互相 imports | 单向 DAG，提取公共接口 |
| Biome `organizeImports` 后不检查 | 确认 DI 类未被转为 `import type` |

## 分层反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| Controller 写业务逻辑 | Service 负责业务，Controller 只做路由委托 |
| 外部消费者绕过 Façade 直接调子 Service | 外部走 `FileSystemService` Façade |
| Façade 中编排业务逻辑 | Façade 只做委托 |
| 直接注 Prisma 到 Controller | Controller → Service → Prisma |

## 数据库反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 修改 schema 后只 `db push` | 生成 migration 脚本并提交 |
| Prisma 枚举 `$Enums.X` 用在 `@ApiProperty` | 本地枚举 + 显式转换 |
| 关联写操作不使用事务 | 包裹 `$transaction` |
| 返回 null 表示未找到 | 抛出 NotFoundException |
| 吞异常不处理 | 让异常过滤器统一处理 |

## 审计反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 敏感操作不记录审计日志 | `this.logger.log({...}, 'audit')` |
| 日志缺少 action/userId | action, resourceType, userId 必填 |

## 代码规范反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `console.log()` | NestJS Logger |
| `@Req()` / `@Res()` 直接使用 | DTO + 正确返回类型 |
| 硬编码配置字符串 | ConfigService 或 RuntimeConfig |
| `any` 类型 | 正确定义 DTO 类型 |
| 不验证 DTO 输入 | class-validator 装饰器 |
