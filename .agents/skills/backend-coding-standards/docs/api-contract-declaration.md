# Controller 参数显式声明（Swagger/SDK 契约源头）

**规则**：Controller 方法只要读取 `req.params.X` / `req.query.X` 的字段，方法签名必须显式声明对应的 `@Param('X')` / `@Query('X')` 装饰器。仅需进入 Swagger 文档、方法体不消费的参数（如分享令牌由私有鉴权方法读取），至少加 `@ApiParam` / `@ApiQuery` 显式声明。

## 为什么（根源链路）

```
后端不声明 @Param/@Query
  → Swagger 无该参数
  → @cloudcad/api-sdk 生成类型为 path?: never / query?: never（SDK 层直接拒绝传参）
  → 前端无法走 SDK 函数调用
  → 被迫手拼 URL / 裸 fetch（绕开 baseUrl、{code,data} 解包、401 刷新、CSRF 保护）
  → 回到 ADR-0034 治理前的状态
```

**实例**：`@Get('filesData/*path')` 曾长期未声明 `@Param('path')`，SDK 类型 `path?: never` 不可调用，导致：
- 外部参照下载 1 处 fetch 豁免（登记于 ADR-0034 豁免清单）
- 历史版本预热（`v=` + `warmup=1`）无法走 SDK

2026-08-12 后端补齐 `@Param('path')` + `@Query('v')` + `@Query('warmup')` 声明后，豁免解除、预热走 SDK（见 `docs/adr/0034-frontend-fetch-governance.md` 的解除注记）。

## 怎么做

| 场景 | 写法 |
|---|---|
| 通配符路由 `@Get('file/*path')` | `@Param('path') path: string`。注意 Express 5 下 `req.params.path` 可能是**数组**（多段捕获），统一经 `extractPath()` 兼容（`Array.isArray ? join('/') : value`） |
| 可选 query 参数 | `@Query('v') version?: string` **且必须** `@ApiQuery({ name: 'v', required: false })`——运行时（无 cli plugin 反射）仅 `@Query` 的可选参数会被推断成 `required: true`，显式 `@ApiQuery` 才能纠正 required |
| 只进文档、方法体不消费（如鉴权在私有方法里读 `req.query.shareToken`） | 只加 `@ApiQuery({ name: 'shareToken', required: false })`，不注入方法参数（避免未使用参数） |
| 私有辅助方法（非端点）读 `req.params/req.query` | 无需声明（不参与 Swagger/SDK 契约），但**调用它的端点方法签名必须声明**，或按上一条只加文档声明 |

## 审计

`packages/backend` 下运行：

```bash
pnpm scan:undeclared-params   # = node scripts/scan-undeclared-params.js
```

扫描所有 controller 中「方法体使用 `req.params.X` / `req.query.X` 但签名区（含装饰器）未声明 `@Param('X')` / `@Query('X')`」的端点，输出文件:行号与签名。私有方法（`private`）自动跳过。提交后端代码前建议跑一次，输出应为 `✅ 未发现…`。

## 关联

- `docs/adr/0034-frontend-fetch-governance.md`：豁免清单与收编治理
- `AGENTS.md` 反模式表：「改后端 DTO 后不重新生成 SDK」
- 前端侧规则见 `frontend-coding-standards/docs/api-contracts.md`
