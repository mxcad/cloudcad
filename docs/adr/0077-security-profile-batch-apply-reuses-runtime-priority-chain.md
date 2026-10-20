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

### D3 切换回退 = 批量清 `updatedBy`

从安全模式切回普通模式，对同一目标 key 集执行与 `resetToDefault()` 等价的
`updateMany({ where: { key in [...] }, data: { value: null, updatedBy: null } })`。
清掉后 resolveValue 自然落回 env / DB 默认行 / 代码默认，无需任何反向映射表。

`resetToDefault()` 因此从「单 key 重置」升级为 profile 回退的**天然原型**，
批量版是它的 `where: { key in [...] }` 变体。

### D4 不生成 schema migration

profile 归属不落 DDL。代价是**没有持久化的「当前处于哪个模式」状态**——它只能从
目标 key 集的实际 `value` 反推。这是有意的：模式是**运行时状态**而非**部署形态**，
形态才进 schema（ADR-0078）。

## 后果与代价

- **无法从单条记录区分 profile 写入与手工写入**。要判断「现在是安全模式」只能查
  目标 key 集的整体状态，而不是读一个字段。UI 层因此必须自带一个权威来源
  （profile 应用记录表或 runtime 内标志位）来驱动「当前模式」显示，不能靠反推单条值。
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
- `docs/security-mode-deferred-decisions.md` — 拍板记录与下游推进顺序
- `packages/backend/src/runtime-config/runtime-config.constants.ts` — `RUNTIME_CONFIG_DEFINITIONS` 单一事实源
- 子票：**T2**（本 ADR）/ **T10**（profile 应用 UI，被本 ADR 解锁）/ **T11**（25 项目标取值）
