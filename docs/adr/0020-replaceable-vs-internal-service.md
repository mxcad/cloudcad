# 扩展点 vs 内部服务：接口抽象的边界规则
**Status**: accepted

后端 18 个模块使用了 `interfaces/` + DI token 模式，但其中大部分模块只有一个实现。在 OSS/Pro/Enterprise 多版本并存的场景下，提前预留扩展点是必要的，但无差别地全量抽象增加了维护成本和新人认知负担。我们需要一个明确的规则来区分哪些模块应该走接口抽象，哪些应该走 class-based DI。

**Decision**

对于每个 Service，在创建时判断它属于「可替换模块」还是「内部服务」：

- **可替换模块**：在不同部署场景（OSS/Pro/Enterprise）下有不同实现的可能 → 接口 + DI token
- **内部服务**：所有部署场景下实现一致 → class-based DI，不需要接口文件

判断规则：问一个问题——**这个模块在 OSS 和 Pro 版本中实现会不同吗？**。如果答案是明确的「不会」，则不做接口抽象。

**Guidance**

| 分类 | 模块 | 做法 |
|------|------|------|
| 可替换 | auth, storage, conversion, email, sms, permission | 保留主接口 + DI token |
| 内部服务 | cache, policy-engine, version-control, 纯业务编排层 | class-based DI，无接口 |
| 存疑 | file-system, users, roles, billing, library | 当前保留现有实现，有争议时讨论 |

> 分类表针对模块的**活跃服务接口**。死代码接口（0 消费者、0 `@Inject` 引用）无论归属哪个分类都可以清理。
>
> **例外说明**：
> - `conversion` 归类为可替换，活跃接口 `IMxcadConversionService`（token: `MXCAD_CONVERSION_SERVICE`）已保留。同文件中 `IFileConversionService` 是死代码（0 消费者）所以被删除。
> - `function-executor` 归类为可替换，活跃接口 `IFunctionExecutor`（token: `IFunctionExecutor`）有 **3 个实现**（`ProcessPoolExecutor` 嵌入式 / `HttpConversionExecutor` 独立转换服务 / `CloudFaaSExecutor` 云函数），6 个跨模块消费者（conversion-task / async-conversion / conversion-reconciliation / node-trash / conversion-monitor / health-queue）。容器侧由 `function-executor.module.ts` 的 `useFactory` 按 `FUNCTION_EXECUTOR` 配置一次选定 adapter；消费者一律只注入 token，不做 mode 字符串分支（队列/耗时统计与任务列表也走 seam，见 ADR-0058/0067）。
> - `permission` 归类为可替换，活跃接口 `IPermissionService` / `IProjectPermissionService` 已保留。`file-system/file-permission` 子模块的 `IFileSystemPermissionService` 是死代码（10+ 消费者全部注入具体类，从未使用 token）所以被删除。
> - `cache` 归类为内部服务，`interfaces/` 目录下若保留纯数据类型（DTO-like interface，如 `ICachePerformanceMetrics`、`ICacheHealthStatus`），不作为服务抽象使用，则不违反规则。

新模块：
- 创建时先自问「OSS/Pro 实现会不同吗」。
- 不会 → 直接写 class，不建 interfaces/ 目录。
- 会或有合理怀疑 → 接口 + token，套用 `replaceable-module` skill。

存量模块：
- 分类表决定哪些接口**可删**（内部服务），哪些**不可删**（可替换模块中活跃的接口）。
- 死代码接口（无消费者、无 @Inject 引用）无论分类都可以清理。
- 当模块因其他需求被大规模重构时，可重新评估并简化。

**Status**: accepted

**Cross-references**
- ADR-0007 三层依赖约束：可替换模块的接口是 Layer 1 → Layer 2 解耦的核心手段
- `replaceable-module` skill：接口定义和实现组织的详细规范
- `backend-coding-standards/docs/service-patterns.md`：class-based DI 和 token DI 两种写法示例
