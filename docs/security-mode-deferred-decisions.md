# 安全模式/普通模式：待决策清单与拍板记录

> 生成于 2026-10-20。本轮已把「零决策依赖」的缺陷全部实施并提交（`765400d`）。
> 2026-10-20 已拍板五项（见 §二），其中 T2 与 T9 落成 ADR-0077 / ADR-0078。
> 每张票对应 wayfinder 地图 **#448** 的子票。

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

## 二、拍板结果（2026-10-20）

### T9 — `variant` 不下沉运行时（ADR-0078）

**结论：不造运行时等价物。T14 按「管理员手工开一个开关」优雅降级。**

理由：ADR-0075 已定死 `variant` 是打包期菜单项（打包类型 → variant → 交付形态 → 平台）。
形态是**交付决策**而非**运行决策**，运维需要的不是形态切换，是那个开关本身。
为开关建运行时等价物要同步打包脚本 + config center + 升级路径三处，而增量升级包模型
（按 variant 出包）与「运行时可变 variant」天然冲突。

**补充事实（本轮核实）**：private 包是公司内部私人包，不向任何公司或个人交付。
因此不存在「交付后形态可变」的需求面，variant 在打包期即为终局，运维侧无从切换也不应切换。

### T17 — 全局下限放宽到 0，严格度由 profile 默认值承载（选项 A）

**结论：放宽 validator 全局最小长度下限到 0，profile 默认值负责严格度。**

⚠️ **前提修正（本轮核实）**：`minLength` **不是**硬编码的 validator 下限。
`password-policy.service.ts:50` 读的是 `passwordPolicy.minLength`（默认 10，
env `PASSWORD_POLICY_MIN_LENGTH` 覆盖）。真正的约束是它是**构造函数一次性快照**
（`:39` `private readonly minLength`），即 profile 切换无法在运行时改它，需重启进程。
这是模块级单例的固有形状，不是设计缺陷。

代价（已知并接受）：「安全模式 = 完全等保」从硬保证降级为软断言——
配置可以写弱、只是默认值严。等保 8.1.4.1 考核的是**实际生效值**，不是代码里有没有地板。

### T2 — 复用 `value` + `updatedBy` 批量写入，不引入新层（ADR-0077）

**结论：profile 应用走批量 `update` 写 `value` 并记 `updatedBy`；切换回退走批量清
`updatedBy`（复用 `resetToDefault()` 语义）。不引入第四优先级层，不动 schema。**

理由：`resetToDefault()` 清 `updatedBy` 让 env 重生效，已是「反向操作的天然原型」。
引入第四层会让 `resolveValue()` 从四段链变五段、69 个 key 要逐个标注层归属；
schema 迁移会把「便利」的承诺写进 DDL、回退成本最高。

### T15 — 分期：先修 7 处，ErrorCode 枚举另开票

**结论：本轮先修 7 处「静默失败 / 死代码 / 占位符」（缺陷，零行为变化）；
ErrorCode 枚举统一拆独立票。**

理由：其余 16 处是活代码的风格统一，要改已工作调用方并跑全量回归；
且枚举的**错误码形状**取决于 T2 的结论（错误码要不要按 profile 分档），
现在定形状会返工。修 7 处是半天确定收益，先落。

### T3 — 弱口令横幅保留，改文案

**结论：保留横幅，文案从命令式改为陈述式。**

理由：横幅只针对**管理员**——180 天/首登改密判定本就 `仅 ADMIN 角色生效`
（`password-policy.service.ts:32-33`），普通用户完全看不到，不构成便利伤害。
而 `DEFAULT_ADMIN_PASSWORD` 是明写的弱默认值，运维不知情比被横幅打扰危险得多。
文案改为「当前使用默认口令，建议修改」——陈述事实而非命令。

---

## 三、下游推进顺序（五题拍完后）

五题已全部拍完，下游按依赖机械推进：

1. **T1**（profile 目标值表形状）→ 依赖 T17 已定的「默认值承载严格度」，表就是 `{secure, normal}` 默认值对
2. **T11**（25 项目标取值）→ 依赖 T1
3. **T12**（`isPublic` 语义）→ 独立
4. **T2 落地**（ADR-0077 实施）→ 解锁 **T10**（profile 应用 UI）
5. **T14**（私有部署默认放开免费导出下载）→ 已按 T9 降级为「管理员手工开开关」，独立可推
6. **T4**（`adminLoginEntry` MERGED/ISOLATED 语义）、**T6**（审计证据链，需 ADR）→ 独立

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
