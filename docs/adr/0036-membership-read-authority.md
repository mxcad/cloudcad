# 0036 — 会员状态读侧权威（Membership read authority）
**Status**: accepted

「用户此刻是哪个等级、该等级配置是什么」这一事实长期被 5+ 处各自推导：`MembershipService.getEffectiveTier`（billing/，规范实现）之外，`RestrictionEngine.buildContext`（vip/，L65-78）与 `getConversionDailyLimit`（同文件 L130-136）各自完整重查 membership + vipTier；`StorageInfoService.getStorageQuota`/`getProjectQuota`（file-system/）与 `UserCrudService` 仪表盘（users/:474）绕过引擎直读 `vipTier.configs`。同一配额 key 的默认值互不相同：`PersonalStorageStrategy` 未配即 0（无限），`StorageInfoService` 展示默认 10MB，`ConfigKeyRegistry.defaultValue` 为 50——seed 表明平台本意 VIP0=50MB，「未配→无限」是潜在 bug。`MEMBERSHIP_SERVICE` token 经 `@cloudcad/contracts` 注入且 `IMembershipService` 用 `tx: unknown`/`Promise<unknown>` 擦除真实类型。本 ADR 记录架构评审（improve-codebase-architecture，candidate「会员状态」）定案，执行见 issue。

**Decision**

1. **`MembershipService` 成为读侧唯一权威并移入 `vip/`**：`vip/` 由此成为「订阅权益」完整模块（VIP 等级 + config registry + RestrictionEngine + strategies + membership）。interface 收敛为：
   ```ts
   getEffectiveMembership(userId): Promise<{ tierLevel: number; configs: Record<string, unknown> }>  // 唯一深查询
   getEffectiveTier(userId): Promise<number>         // 由快照推导
   getQuota(userId, key): Promise<number>            // 由快照推导 + 规范默认值
   ```
   `getEffectiveMembership` 是唯一真正查库的方法（一次取 membership + vipTier），后两个为薄推导。
2. **默认值唯一来源**：等级 configs 缺 key 时，有效值回落 `ConfigKeyRegistry` 该 key 的 `defaultValue`（seed：50/100/10/5）。registry 是管理后台可编辑的默认来源，执行（strategy）与展示（storage-info / user-crud）走同一解析路径，消除 0 / 10 / 50 三分歧，顺带修复「未配→无限」潜在 bug。
3. **初始不缓存**：`getEffectiveMembership` 每次现查，DB 成本与重构前一致（仍是 2 次查询）。未来若证明热点，在 implementation 内部加缓存，不改 interface。
4. **去掉 `MEMBERSHIP_SERVICE` token**：`MembershipService` 无 OSS/Pro 变体，属内部服务（ADR-0020「可替换模块才用接口 + DI token」）→ class-based DI。`auth.module.ts` 取消 token 绑定，auth-facade 直接注入具体类；`@cloudcad/contracts` 的 `IMembershipService` 在确认 impl-mx 私有包无引用后删除，消除 `tx: unknown` 类型擦除。
5. **配额 key 常量集中**：`RestrictionEngine.STRATEGY_KEYS` + 各 strategy 的 `const KEY` + 散落裸字符串（storage-info、user-crud）合并为单一 `QUOTA_KEYS` 常量（`vip/` 内）。strategies 不再自带默认值，统一经模块解析。
6. **消费方全部改走新 interface**：`RestrictionEngine.buildContext` / `getConversionDailyLimit`、`StorageInfoService.getStorageQuota` / `getProjectQuota`、`UserCrudService` 仪表盘（:474）、`AuthFacadeService`（:545）、`BillingService`（:79/:406）——默认值解析统一经 `getQuota`，等级推导统一经快照。

**Guidance**

1. scope 仅读侧。转换次数预扣/释放生命周期（6 处手工配对 `reserveConversionCountOrThrow`/`releaseConversionCount`）与 `QuotaExceededException` 异常样板（8 处 re-throw）不属本 ADR，另开。
2. 写侧（`BillingService` 订单/退款、`billing-cron` 降级）保持现有位置，仅把读等级/读配置的调用改走新 interface，不重构写逻辑。
3. 新增配额/配置消费方必须经 `MembershipService`，禁止再直接 `prisma.userMembership.findUnique` + `vipTier.findUnique` 推导。
4. 默认值解析的具体机制（`buildContext` 向 strategies 提供已解析 effective config，或 strategy 经 `getQuota` 解析）由执行票定，原则是**执行与展示走同一条解析路径**。
5. `auth-facade` 的 profile 展示（`getMembership` 完整结果）保留原语义，不因重构改变前端字段。

**Status**: accepted

**Cross-references**
- CONTEXT.md「会员状态（Membership）」术语（本次评审落账）
- ADR-0017 VIP 等级 + 键值对配额配置：本 ADR 是其读侧权威化
- ADR-0022 配置注册表共享模块：`ConfigKeyRegistry.defaultValue` 作为默认唯一来源
- ADR-0020 可替换模块 vs 内部服务：去 token、class-based DI 的依据
- ADR-0007 三层依赖：`vip/`（Layer 2）被 file-system / users / auth 同层消费，箭头方向合规
- issue #197 会员状态读侧权威执行（任务票，6 步序列）
