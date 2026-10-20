# 安全模式/普通模式：待决策清单

> 生成于 2026-10-20。本轮已把「零决策依赖」的缺陷全部实施并提交（`765400d`），
> 本文只收**必须由你拍板**才能继续的项。每张票对应 wayfinder 地图 **#448** 的子票。
>
> 阅读顺序：按「阻塞别人」的强度排序——T9/T17/T1 排在最前，因为它们各自卡住 3–4 张下游票。

---

## 一、本轮已落地（无需决策）

| 编号 | 内容 | 结果 |
|---|---|---|
| W3-1 | `clearTokenCookies` 与 `setAuthCookies` 不对称 | 抽出 `tokenCookieOpts` 单一出口，写清共用属性集 |
| W2-5 | ForgotPassword「账号已被禁用」死分支 | 删除（后端防枚举故意返回成功，永不可达），客服走 `useSupportContact` 回落默认值 |
| W2-4 | `/reset-password` 直访死路 | 无身份时 `replace` 跳回 `/forgot-password` |
| W2-7 | RegisterClosed 写死「请联系管理员」 | 改走 `useSupportContact` 显示真实客服 |
| W3-4 | 公告已读簿记跨账号串用 | `ackStorageKey(ownerId)` 按账号分键，PC + 移动端同构改造 |
| T16-1 | 验证码端点无限爆破 | `verify-email` / `verify-email-and-register-phone` 补 `@Throttle({limit:12, ttl:60000})` |

门禁：backend unit 217 suites / 2983 全绿；frontend 169 files / 1960 全绿；
mobile 79/80 files（2 例是 `useLoginPrompt` 既有基线）；三包 tsc / vue-tsc 0 错。

---

## 二、需要你的决策（按阻塞强度排序）

### T9 — `variant` × `securityMode` 的边界（**卡住 T14，需 ADR**）

`variant=private|oss` 是**打包期**概念（ADR-0075），运行时不存在这个配置。
T14（私有部署默认放开免费导出下载）想做的事，前提就是「运行时知道自己是私有变体」——
而这个前提要靠 T9 的新机制才能成立。

**决策点**：要不要为 `variant` 造一个运行时等价物？
- 若造：等于把打包期决定运行时化，涉及打包脚本 + 配置中心 + 升级路径。
- 若不造：T14 只能退化成「管理员手工开一个开关」，和现在没区别。

### T17 — validator 下限 vs 便利（**卡住 T1/T11 的取值，是本轮最大结构项**）

口令策略必须模式化（这条已定），但**全局 validator 的硬下限**放不放松是另一回事。
- **A（推荐）**：把全局最小长度下限放宽到 0，严格度由 profile 默认值承担。
  代价：「安全模式 = 完全等保」这句承诺要降级为弱断言。
- **B**：保留硬下限，普通模式仍受全局下限约束（用户想要的「便利高于一切」打折）。
- **C**：validator 也吃 `securityMode`（双轨，最灵活，也最难测）。

### T1 — profile 目标值表的形状

- **A**：在 `RuntimeConfigDefinition` 上加可选 `profiles: { secure, normal }` 字段。
- **B**：单独文件 + guard 测试。

### T2 — 批量写入语义（需 ADR，5 个子问题）

profile 应用是「一次性写 25 项」这个动作的语义未定。关键两个：
- 写了 DB 值后，**env 层会把它影子掉**——env 到底算不算终态？
- 要不要引入**第四优先级层**，还是直接动 schema migration？

### T14 — 私有部署默认放开免费导出下载（**被 T9 卡住**）

### T15 — ErrorCode 枚举 vs 先修 23 处文案

**推荐分期**：先修 7 处「静默失败 / 死代码 / 占位符」，ErrorCode 枚举单独开票。
枚举一次改 23 处，回归面太大。

### T3 — 普通模式下弱口令横幅是否保留

口令已改默认 `12345678`（便利优先）。横幅是**提示性**的：
- 保留 + 改文案（推荐）：管理员仍能看到「当前口令偏弱」，不打扰普通用户。
- 隐藏：普通模式彻底无安全提示，最纯粹但等于放弃最后一条提示。

### 其余（互相依赖，排在 T9/T17/T2 之后）

- **T4**：`adminLoginEntry` 的 MERGED / ISOLATED 精确语义
- **T6**：审计证据链（需 ADR）
- **T12**：`isPublic` 语义，涉及 6 处成本
- **T11**：25 项目标取值（依赖 T1 / T12 / T17）
- **T10**：profile 应用 UI（依赖 T2 / T11 / T12）

---

## 三、建议的拍板顺序

1. **T9**（运行时 variant 要不要造）→ 解锁 T14
2. **T17**（validator 下限 A/B/C）→ 决定 T1 的表形状和 T11 的取值
3. **T2**（批量写入语义，含 env 层与第四优先级层）→ 解锁 T10
4. **T15**（先修 7 处，枚举另开票）
5. **T3**（弱口令横幅保留与否）

拍完这 5 个，剩下 T4/T6/T11/T12/T14 基本都能机械推进。

---

## 四、明确降级 / 接受的项（本轮已判断，不必再议）

- **T7-1（CSRF Bearer 短路）不作为漏洞修**：`csrf_token` cookie 是 `SameSite:'lax'`，
  跨站 POST 根本不会带；伪造 Bearer 会在 `jwt.strategy` 的 `jwtFromRequest` 阶段
  校验失败返回 401；跨站攻击者也设不了 `Authorization` 头。
  该分支是「已带合法 Bearer 时跳过冗余 CSRF 检查」的优化，不是绕过。
- **T16-2（魔数校验未接线）不就地扩展**：`FileValidationService` 零消费者，
  其 JSDoc 明确写着「接线属上传链路重构（独立任务），勿就地扩展」。
  要接就得动 drawing-ingest / upload-utility / file-node-materializer，
  且现有 `validateFileContentDeep` 对 DXF 缺标记会抛错——
  直接接上会让格式不规范的合法 DXF 被拒，需要产品确认能否承受误杀。
