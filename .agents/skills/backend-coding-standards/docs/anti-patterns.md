# 后端反模式清单

## DI 反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `import type { XService }` 用于 DI 类 | `import { XService }` |
| `forwardRef(() => XModule)` | Token 注入 + 单向依赖 DAG |
| 直接注入具体类 `XService` | 必要时用 `@Inject(TOKEN)` 注入接口 |
| Module 互相 imports | 单向 DAG，提取公共接口 |
| 用 `organizeImports` 类工具（如 Biome）格式化后不检查 | 确认 DI 类未被转为 `import type` |

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

## 响应格式反模式

全局 `ResponseInterceptor`（`common/interceptors/response.interceptor.ts`）已统一包装
`{ code, message, data, timestamp }`，Controller **只返回 payload**，禁止任何手动包装。

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| Controller 返回 `{ message, data: result }` | 直接 `return result`（包装由全局 Interceptor 完成） |
| Controller 返回 `{ message: 'xxx', data }` | 同上；文案由 interceptor 的 i18n 统一生成 |

> **为什么是 bug（实例：IP 黑名单列表恒空）**：Controller 手包 `{ message, data }`
> 会与全局 interceptor 的 `data` 字段形成**双层嵌套**
> （`{ code, message, data: { message, data: [...] } }`）。前端
> `clientSetup.ts` 的 `responseTransformer` 只解包一层，`res.data` 拿到的是
> `{ message, data: [...] }`，`body.items` 为 `undefined` → 列表永远为空 / "添加后不刷新"。
> 且前端 MSW handler 直通返回 DTO，无法暴露该问题——新写/修改 Controller 时必须
> 对照 ① 全局 interceptor ② 前端 `clientSetup.ts` responseTransformer ③ SDK 生成的
> Response 类型，三层格式必须一致（实际响应 = interceptor 包装后的形状）。

## 模块健康反模式（防孤儿/空壳/双轨）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 新建模块前不问三个问题 | 新建模块必须能回答：① 有无消费者（先搜 import）？② 有无测试？③ 是否值得独立成模块（<5 个文件的考虑并入相关模块）？三问任一不过 → 不建模块 |
| 无消费者代码（孤儿服务/孤儿 barrel/空壳模块） | 一律删除，或在模块头加 JSDoc 状态标注并登记 issue（实例：file-system/services barrel、permission/RolesCacheService 已删；ownership 空壳见 #228） |
| 已实现未激活的模块（接线未完成） | 必须在 module 类上方加 JSDoc：标注「未激活」+ 未接线证据 + 激活条件（模板见 `policy-engine/policy-engine.module.ts`），并登记 issue |
| 扩展架构迁移（expand-contract）只扩不缩 | 扩的同时必须排收尾票（contract：旧路径退休），不允许停留在双轨并行（实例：storage vs storage-provider，见 #234） |
| 为避免模块循环直接 import 别模块的实现类 | 走正规解法：接口 token + 单向依赖 DAG（参照 ADR-0007）；循环时用 token 注入而非物理类引用 |
| 模块命名靠猜（同域多个模块语义不清） | 命名统一单复数与语义，避免 `storage` / `storage-management` / `storage-provider` 式三件套；新模块名先与 #228 模块清单对照 |

> **背景**：2026-08-10 模块健康盘点（#228）发现 ownership、policy-engine 为"已注册无消费者"，storage 三模块为迁移未收尾的双轨。此清单防止同类问题再出现。
