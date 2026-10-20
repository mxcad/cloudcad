# 安全模式/普通模式：待决策清单与拍板记录

> 生成于 2026-10-20。本轮已把「零决策依赖」的缺陷全部实施并提交（`765400d`）。
> 2026-10-20 两轮共拍板十题：§二 五项（落成 ADR-0077 / ADR-0078）、§三 下游五问（落成 ADR-0079）。
> 无剩余阻塞项，下游可机械推进（见 §四）。
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

**结论：不造运行时等价物。T14 改为「打包期按 variant 设不同出厂默认值」。**

⚠️ **修正（本轮二轮勘察后推翻我第一版建议）**：我最初建议 T14 降级为「管理员手工开关」。
这是**绕过 bug 的 workaround，不是修 bug**。T14 真身是「私有化默认值断裂三件套」，
其中最严重的 `freeExportDownloadEnabled=false` 会抛 403 弹「开通 VIP」引导，
而私有化部署包**没有付费体系** → 死路。正解：给该 key 与 `batchDownloadEnabled`
补 `envKey`（两项当前都没有），由打包/首部署脚本按 variant 写 `.env`——
**variant 是打包期概念，它决定的正是出厂默认值**，仍在 ADR-0078 边界内，
不需运行时感知形态。`.env` 层优先级低于 runtime，出厂值可被管理员覆盖。

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

**影响面比我第一版说的大（二轮勘察补充）**：不止口令长度。`accountLockFailThreshold`
validator `min=3`、`accountLockWindowSeconds` / `accountLockDurationSeconds` `min=60`
（`account-rate-limit.service.ts:75-88` 注释里的「max=0 关闭」仅适用 4 个限流维度，
**不适用账号锁定**）→ 现状下 normal 模式**无法彻底关闭账号锁定**，管理员输错 10 次
仍被锁 60 秒起。这三项同样要放宽到 0。

**与 T6 的耦合（选 A 的直接后果，必须一并认识）**：因为「安全模式=等保」现在是
**弱断言**（靠管理员不改，而非系统禁止写弱值），T6「审计证据链能否自证现在合规」
的价值随之**上升为刚需**——它是唯一能让「当前处于合规配置」可被证明的东西。
若当初选 B（secure 模式禁止下调 profile 值），T6 可降级为可选。

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

---

## 三、第二轮拍板：下游五问（2026-10-20，全部按推荐）

### R1 — 批量应用**覆盖**用户已手工修改的值（ADR-0077 D5）

**结论：覆盖**，把目标值写到 profile 覆盖的全部 key 上，不论 `updatedBy` 是否非空。

⚠️ **我第一版建议（跳过手改项 + 预览列出）是错的**：被跳过的偏离项会变成
**静默的违规**——管理员在普通模式下调弱一项，切到安全模式后该项继续以弱值生效，
而界面显示「已切换至安全模式」。这比覆盖更糟（制造看起来合规实际不合规的状态）。
救这个洞要再建「偏离项追踪 UI」，成本更高收益为零。

**不违背「不替用户做决定」**：该哲学针对**默默改写用户意图**，而这里是用户主动执行
「切换至安全模式」这个动作后按其字面含义收敛，用户是动作发起者。

代价用三条手段兜：①应用前影响面预览（复用 `ResetCategoryModal` 三段式）列出将改动项及前值；
②每项一条 `runtime_config_logs`（前后值可查、可手工改回）；
③模式切换进 `audit_logs`（ADR-0079）。

**明确不做「比较严格度、只覆盖变弱项」的部分覆盖**：需要一个跨 69 个异构 key
（string/number/boolean/array/json，MFA 模式是字符串枚举）的通用严格度比较器，
定义表里没有对应物，要发明 per-key comparator，维护成本不值。

### R2 — profile 目标值表挂在 definition 上（T1）

`RuntimeConfigDefinition` 加可选 `profiles?: { secure, normal }`。
普通 TS interface 加可选字段不破坏兼容，最低改动；
且「定义表是唯一事实源」是铁律，另立文件等于开第二份 key 清单（要守卫测试兜）。

### R3 — 「历史密码不复用」拆出本次范围（T3）

6 项新口令配置里，只有 `passwordPolicyHistoryCheckEnabled` 需要新建
`password_history` 表 + 新校验 + **新迁移**（本次唯一 schema 膨胀点）→ 单独排票。
其余 5 项本次做，缺它安全模式口令策略也能大幅合规。

⚠️ **两项已实证的前置**：初始管理员创建路径**当前不调用 `assertPasswordPolicy`**
（secure 模式下必须拦，否则部署完仍是 `12345678`）；
`setup-wizard.js` 三分支里 `n`=自定义口令的 `isPasswordWeak` 只判 ≥8 位 + 两类，
比后端策略宽松，须模式感知。

### R4 — T6 审计证据链：补两项、不做全量审计（ADR-0079）

做：①新增 CONFIG 类 `AuditAction`，配置变更进 `audit_logs`；
②`mlps3-drill.sh` 改读 `runtime_configs` 实际生效值（现状只读 `.env` 裸值 =
**假阳性**，env 写 true 后台被改 false 仍报 ✅，比不报更危险）。
**不做**「强制全量审计」：容量未核算（`FILE_*` 每编辑动作一条，随在线编辑线性增长）、
写入是热路径同步 `await` 无异步退路、且 D1 已覆盖「配置合规可证明」这一等保诉求。
⚠️ 因 T17 选 A（弱断言），D1 + D2 从可选升为**刚需**。

### R5 — 管理员入口：先做判定收敛，再谈开关（T4）

`role?.name === 'ADMIN'` 散落 **6 处**、`@IsAdmin` **全仓零命中**、`@Roles` 仅 1 处。
只做入口开关不做收敛，`jwt.strategy.ts` 两处 ADMIN 分支仍按旧语义放行，开关形同虚设。
开关判断必须放在**一切写库/emit 之前**，拒绝路径统一走防枚举文案——
前科被注释固化在 `login.service.ts:329-340`：三个 provider 曾把恢复逻辑放在
管理员门之前，导致「已注销的 ADMIN 凭一次普通入口尝试即触发写库 + `user.restored` 审计」
随后才被拒，恢复成为无意义且有害的副作用。

**第 1 步（判定收敛）已落地**：实际是 **8 处**（本条记的 6 处 + `jwt.strategy.ts`
MFA 锁定与口令到期锁定两处），全部改走 `@cloudcad/contracts` 的
`isAdminRole()` / `isAdminUser()`，`SystemRole.ADMIN` 是唯一事实源
（`common/enums/permissions.enum` 一并 re-export，保持业务代码既有 import 路径）。
`contracts/test/system-role.test.js` 新增 8 例钉死判定语义（严格全等 + 大小写敏感 +
role/name/user 各级缺失不命中不抛错）。**零行为变化**：backend tsc 0 错、
全量 225 套件 / 3151 例绿、contracts 41 例绿 + 纯度门禁通过。

**第 2 步（入口开关）已落地**：新增 `adminLoginEntry` 配置项
（`ISOLATED` / `MERGED`，profiles `{ secure: 'ISOLATED', normal: 'MERGED' }`，
`defaultValue: 'ISOLATED'` = 升级零行为变化），闸门落在 **`assertLoginEligible`**
而非 `admin-auth.service.login()`——后者只管管理员专用入口，而普通入口的四条登录路径
（密码/微信/手机码/邮箱）共同收口在 `assertLoginEligible`，闸门放这里才覆盖全部入口，
且仍在注销冷静期恢复逻辑之前（守住第 1 步的前科）。
配置读取**仅当用户是管理员时**才发生，普通用户的登录尝试不产生额外查询。

**语义取「放宽」而非「合并后禁用专用入口」**：`MERGED` = 管理员可走任一入口，
专用入口两种形态下都可用。不采用「MERGED 时禁用专用入口」——那会打断既有部署的
管理员登录 URL/书签，且纯放宽已完全满足「便利高于一切」的目标。
`MERGED` 下管理员走普通入口照常触发注销冷静期恢复并被放行——这正是「两个入口合一」
的语义，不复现前科里的「恢复后立即被拒」。管理员级拦截（口令到期 / TOTP 绑定 /
`jwt.strategy` 两处分支）基于 DB 实时角色与口令时间判定，与从哪个入口登录无关，不受影响。

**未做前端路由门控**：`adminLoginEntry` 为 `isPublic: false`，且放宽语义下普通登录
表单本就无需改动（管理员直接可用），专用入口始终保留，故前端零改动、SDK/MSW 零改动。

⚠️ **`@Roles('ADMIN')`（`admin-mfa.controller.ts:83`）刻意不动**：`RolesGuard` 的
语义是通用 `requiredRoles.includes(userRole)`（支持任意角色名），不是 ADMIN 专用判定；
改成 `@Roles(SystemRole.ADMIN)` 会让通用 guard 绑死一个具体值。

---

## 四、下游推进顺序

两轮十题已全部拍完（§二 五题 + §三 五题），下游全部可机械推进，无阻塞项：

1. **T1**（profile 目标值表形状）→ 已拍板：definition 加可选 `profiles` 字段
2. **T11**（25 项目标取值，取值已在计划文档 §四 定稿）→ 依赖 T1
3. **T12**（`isPublic` 语义）→ 已拍板「不开放给普通用户，改为配置页计数」
4. **T2 落地**（ADR-0077 实施：D4 单事务 + D5 覆盖）→ 解锁 **T10**（profile 应用 UI）
5. **T14**（私有化默认值断裂三件套）→ 按 ADR-0078 D2 走「打包期按 variant 设出厂默认值」
6. **T3**（口令策略全面模式化，最大结构项）→ 6 项配置本次做 5 项，历史密码新表单独排票
7. **T6**（审计证据链）→ 按 ADR-0079：CONFIG 类 `AuditAction` + `mlps3-drill.sh` 改读现值
8. **T4**（管理员入口）→ **已完成**：判定收敛（8 处 → `isAdminRole`/`isAdminUser`
   唯一出口）+ `adminLoginEntry` 开关（`ISOLATED`/`MERGED`，闸门落 `assertLoginEligible`）
9. **T15**（错误契约）→ 先修 7 处缺陷，ErrorCode 枚举另开票（形状待定）
10. **待排票**：历史密码不复用新表、`runtime_config_logs` 补字段并入收尾票、
    现值纳入哈希链、配置基线快照、全量审计容量核算

---

## 五、明确降级 / 接受的项（本轮已判断，不必再议）

- **T7-1（CSRF Bearer 短路）不作为漏洞修**：`csrf_token` cookie 是 `SameSite:'lax'`，
  跨站 POST 根本不会带；伪造 Bearer 会在 `jwt.strategy` 的 `jwtFromRequest` 阶段
  校验失败返回 401；跨站攻击者也设不了 `Authorization` 头。
  该分支是「已带合法 Bearer 时跳过冗余 CSRF 检查」的优化，不是绕过。
- **T16-2（魔数校验未接线）不就地扩展**：`FileValidationService` 零消费者，
  其 JSDoc 明确写着「接线属上传链路重构（独立任务），勿就地扩展」。
  要接就得动 drawing-ingest / upload-utility / file-node-materializer，
  且现有 `validateFileContentDeep` 对 DXF 缺标记会抛错——
  直接接上会让格式不规范的合法 DXF 被拒，需要产品确认能否承受误杀。

---

## 六、Gitea 票据映射

**编号规则：`Tn → #(448+n)`**（2026-10-20 核实，此前未记录在文档中，
导致 ADR 里写的「子票 T2」在 Gitea 上按 ID 搜不到）。

| 文档编号 | Gitea | 状态 |
|---|---|---|
| 地图 | **#448** | 已落 |
| T1-T17 | **#449-#465** | 已落（`Tn → #448+n`） |
| T2 spec（预览/应用契约与验收） | **#475** | 新增 |
| 历史密码不复用（`password_history` 新表，ADR-0079 拆出） | **#476** | 新增，blocked by #451 |
| `runtime_config_logs` 补字段 expand + contract 收尾（ADR-0079 拆出） | **#477** | 新增，blocked by #454 |
| 运行时配置现值纳入审计哈希链（ADR-0079 拆出） | **#478** | 新增，blocked by #454 |
| 合规基线快照与偏离对照（ADR-0079 拆出） | **#479** | 新增，blocked by #454 |
| 强制全量审计容量核算（ADR-0079 拆出） | **#480** | 新增，blocked by #454 |

已就本轮裁定对 4 张旧票加了指向性评论：**#450**（六问全解 + 指向 #475）、
**#451**（历史密码拆出 + T17 影响面修正）、**#454**（范围裁定 + 拆出 #477-#480）、
**#462**（T14 范围修正为打包期出厂默认值）。
目的是避免 agent 领票时被「待裁决」的旧 body 误导。

### 编号映射的三个坑（已踩）

1. **ADR 与文档里的 `Tn` 不是 issue ID**。必须走 `Tn → #448+n` 换算。
2. **旧票 body 会过期**。裁定落在 ADR 后，原票的「待裁决」段落变成误导；
   本轮用评论而非改 body（评论是追加的、可追溯，body 编辑会抹掉历史证据）。
3. **Gitea API 的 `labels` 参数要重复传整数**，逗号拼接报
   `[Labels]: Value could not be parsed as integer`。标签 ID：
   `58`=ready-for-agent、`63`=wayfinder:task、`68`=line-a、`70`=line-b。
