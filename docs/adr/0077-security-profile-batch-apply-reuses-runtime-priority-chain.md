# 0077 — 安全模式 profile 批量应用复用既有优先级链（不引入第四层、不动 schema）

**Status**: accepted（2026-10-20）

安全模式 / 普通模式的切换**不引入新的配置优先级层、不改数据库 schema**，直接复用
runtime-config 现有的「runtime 值 > env > DB 默认行 > 代码默认」四段链：应用 profile =
批量写 `value` 并记 `updatedBy`；切换回退 = 批量清 `updatedBy`（复用 `resetToDefault()` 语义）。

## 背景

本轮模式化承诺要求：安全模式（等保三级）与普通模式（便利高于一切，默认）
各自拥有一套 runtime config 目标取值，管理员在界面上点一次「切换到安全模式」即可生效。
这套目标取值覆盖 25 项（T11）。

真正未定的是**这个「一次写 25 项」动作的语义**，它有两个互相纠缠的子问题：

1. **env 层算不算终态？** `resolveValue()` 的优先级是
   runtime(`updatedBy != null`) > env(`envKey`) > DB 默认行 > 代码默认。
   env 是**中间层不是终点**——写了 runtime 值后 env 会被覆盖，但一旦清掉 runtime 值，
   env 立即重新生效。那么 profile 批量写入后，运维若在 `.env` 里手改同名键，是期望
   profile 生效还是 env 生效？
2. **实现手段**：直接动 `value`（现状路径），还是引入**第四优先级层**（例如 profile 专属
   字段/表），还是靠 **schema migration** 把 profile 归属固化进 DDL？

三个实现方案的分歧不在「能不能做」，而在**回退成本**：`resolveValue()` 的调用点遍布
`runtime-config.constants.ts` 的 69 个 key 消费方，加一层意味着四段链变五段、每个 key
要标注层归属；schema migration 会把「便利」的承诺写进 DDL，等保回普通模式时 DDL 无法
随 UI 切换而退。

## 决策

### D1 复用 `value` + `updatedBy`，不引入新层

profile 应用 = 对目标 key 集做批量 `update`：写 `value`、置 `updatedBy = <当前管理员>`。
这与运维在配置页手工逐项修改**走的是同一条路径**，没有第二套写入机制，因此不会出现
「页面显示 A、实际生效 B」的双轨。

`updatedBy != null` 这条既有判据即成为「该值被 profile 或手工覆盖过」的标记，
不需要额外的 `source: 'profile' | 'manual'` 字段。代价是**无法从单条记录区分**
「这是 profile 批量写的」还是「这是运维手工改的」——接受，理由见后果。

### D2 env 不是终态，profile 写入优先级高于 env

延续既有语义：写了 runtime 值即覆盖 env。运维若手改 `.env` 同名键，需知悉
**必须同时清掉 runtime 值**（重置该 key）env 才会重新生效。这条在 ADR-0075 体系里
已有先例（`resetToDefault()` 的职责就是这件事），不做新解释。

### D3 切换回退 = 批量「写回 `def.defaultValue` + 清 `updatedBy`」

从安全模式切回普通模式，对同一目标 key 集逐项执行与 `resetToDefault()` 等价的写入：

```
value: JSON.stringify(def.defaultValue), updatedBy: null
```

**不可写 `value: null`**。`resetToDefault()` 的实际实现（`runtime-config.service.ts:612`）
是写回 `def.defaultValue` 再清 `updatedBy`，不是把值置空：`resolveValue()` 的第三分支
对 `updatedBy == null` 的行会 `parseValue(row.value, def.type)`，传 null 会在解析阶段抛错。

清掉后 `resolveValue()` 自然落回 env / DB 默认行 / 代码默认，无需任何反向映射表。

`resetToDefault()` 因此从「单 key 重置」升级为 profile 回退的**天然原型**，
批量版是它的 `where: { key in [...] }` 变体（按 definition 逐项写回默认值）。

### D3a 缓存失效复用既有 `invalidateCacheKeys(keys[])`

`runtime-config.service.ts:411` 的 `invalidateCacheKeys` **已接受数组**，逐键删
`runtime_config:<key>` 并额外删聚合缓存 `runtime_config:all`，Redis 不可达时静默降级。
批量应用一次传整个目标 key 集即可，**不需要新的失效机制**。
注意聚合缓存：只删单键会让 `getAllConfigs` 继续吐旧值，必须让 `runtime_config:all`
也一起失效（既有实现已覆盖）。

### D3b 审计日志噪声是已接受的代价

每次写入都落一条 `runtimeConfigLog`（`key/oldValue/newValue/operatorId/operatorIp`）。
因此「一次切换到安全模式」= 目标 key 集中**实际发生变化的每个 key 一条日志**，
数量级是几十行。

`resetToDefault()` 已有「值实际变化才留审计」的判断（`:625`），批量应用沿用该判断，
可把噪声压到「真正变了的项」。但**仍是 N 条而非 1 条**——等保审计按单条配置变更记，
这是既有模型，不为 profile 造「批量变更」日志聚合。

### D4a 不生成 schema migration

profile 归属不落 DDL。代价是**没有持久化的「当前处于哪个模式」状态**——它只能从
目标 key 集的实际 `value` 反推。这是有意的：模式是**运行时状态**而非**部署形态**，
形态才进 schema（ADR-0078）。

**落地补充（2026-10-20，T2 实施）**：这条代价已被 `securityMode` 标记键消解。
该键在定义表里声明了 `profiles: { secure: 'secure', normal: 'normal' }`，因此
**参与 profile 批量应用、与取值同在一个事务里提交**——不存在「值改了一半而标记
没更新」或反之的中间态。UI 直接读这个键即可显示当前模式，不必反推目标 key 集，
也不必另建 profile 应用记录表。

选它而不是「profile 应用记录表」的理由：标记与取值同事务提交，而记录表是另一张表
的另一笔写入，那会重新引入 D1 刻意回避的「profile 归属字段」语义。代价是这个键
**不该被手工修改**（手工改标记会让标记与取值分叉），故标 `dangerous: true` 并在
`impact` 里写明只走「应用安全模式」入口切换。

边界不变：它仍不是一张 profile 表、不进 DDL，只是一个普通 runtime config 键，
沿用 D1 的 `value` + `updatedBy` 语义。

### D4 一次切换 = 一次事务

现状 Controller **只有单键 `PUT /runtime-config/:key`**，而 `POST reset-category` 是
循环调 `resetToDefault` 的**批量重置**（逐项 upsert + 逐项日志 + 逐项失效缓存），
**没有事务**——半成功不可回滚。等保切换不允许出现「改了 15/25 项，剩下 10 项没改成」
的中间态。

因此批量应用必须包在**单个数据库事务**里（写入 + 日志 + 缓存失效中的写入部分），
事务失败则整体回滚。缓存失效留在事务之外（它是尽力而为，失败不应回滚 DB）。

### D5 覆盖用户已手工修改的值（已裁决，2026-10-20）

**结论：覆盖。** 批量应用把目标值写到 profile 覆盖的**全部** key 上，
不论该项 `updatedBy` 是否为 null。

**我第一版建议是错的，记录在此以免重蹈**：我曾建议「跳过手改项 + 在预览里列出
被跳过的项」，理由是「符合仓库哲学、不替用户做决定」。这个建议站不住，因为
**被跳过的偏离项会变成静默的违规**：

管理员在普通模式下调弱了一项（MFA 关闭、锁定阈值调到 0），切到安全模式后，
如果该项被跳过，它就会**继续以弱值生效**，而界面显示「已切换至安全模式」。
这比覆盖更糟——它制造了一个**看起来合规、实际不合规**的状态，而系统不报告它。
要救这个洞必须再建「偏离项追踪 UI」，成本比覆盖高，收益为零。

**不违背「不替用户做决定」**：该哲学针对的是**默默改写用户的配置意图**
（`mergeExampleIntoEnv` 的注释记述的历史缺陷）。D5 的选择不是默默改写，
而是在用户**主动执行了「切换至安全模式」这个动作之后**按其字面含义收敛。
用户是这个动作的发起者。

**代价用三条手段兜住，而不是用「不覆盖」兜住**：

1. **应用前影响面预览**（`ResetCategoryModal` 三段式可直接复用）：
   列出「将改动的项」及其**前值**，含已被用户手改的项，二次确认后才写入。
2. **每项一条 `runtime_config_logs`**（`oldValue`/`newValue`/`operatorId`/`operatorIp`）：
   前值可查，随时可以手工改回。
3. **模式切换本身进 `audit_logs`**（ADR-0079）：谁、何时、切到哪个模式、
   影响了哪些 key——这是可被等保验收审计的证据。

**代价：不做「比较严格度、只覆盖变弱的项」这种部分覆盖。** 理由：
需要一个跨 69 个异构 key（string/number/boolean/array/json，MFA 模式是字符串枚举、
限流阈值是数字、开关是布尔）的**通用「严格度比较器」**，这个抽象在
`RUNTIME_CONFIG_DEFINITIONS` 里没有对应物，要为它发明一套 per-key comparator，
维护成本与出错面都不值得。全量覆盖 + 可追溯比部分覆盖 + 更复杂的规则更可靠。

## 后果与代价

- **无法从单条记录区分 profile 写入与手工写入**。要判断「现在是安全模式」不能靠
  反推单条值。UI 层需自带权威来源：已由 `securityMode` 标记键承担（见 D4a 的
  落地补充），不需要 profile 应用记录表。
- **env 与 profile 冲突时的责任在运维**：改了 `.env` 却不重置对应 key，会得到
  「页面显示已切安全模式、实际生效 env 值」的分叉。需在 profile 应用流程里
  对冲突 key 给出显式告警，而不是静默覆盖。
- **69 个 key 无需逐个改造**。这是本 ADR 最主要的收益：`RUNTIME_CONFIG_DEFINITIONS`
  的 shape 不变，T1 的 profile 目标值表可以挂在 definition 上作为可选字段
  （见 T1），不影响现有消费方。
- **回退成本最低**：切回普通模式 = 一次 `updateMany`，无 DDL、无数据清理脚本、
  无升级包特殊分支。这与「普通模式为默认、安全模式为可选加严」的产品定位一致——
  加严的退出路径必须比加严本身便宜。
- **T15 的错误码形状待定**：错误码是否按 profile 分档取决于本 ADR 之外的产品决策，
  枚举统一票须等该结论后再定形状，否则返工。

## 相关

- **ADR-0078** — `variant` 不下沉运行时（与「模式是运行时状态」互为对照：形态进打包期，
  模式进运行时）
- **ADR-0075** — 统一打包入口与交付形态矩阵（variant 为打包期概念的既定事实）
- `packages/backend/src/runtime-config/runtime-config.constants.ts` — `RUNTIME_CONFIG_DEFINITIONS` 单一事实源
- 子票：**T2**（本 ADR）/ **T10**（profile 应用 UI，被本 ADR 解锁）/ **T11**（25 项目标取值）

> **2026-10-27 裁定**：安全模式的**计划文档已删除**
> （`docs/security-mode-dual-profile-plan.md` / `docs/security-mode-deferred-decisions.md`）。
> 不做部署期模式 env（`DEPLOY_SECURITY_MODE`），出厂恒普通模式；切换安全模式走本 ADR
> 的 `POST /runtime-config/profile/apply` 按钮即可。profile 键出厂默认统一取 normal 侧
> （不变式钉死，见 `runtime-config.invariants.ts`）。
