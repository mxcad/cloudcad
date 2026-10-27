# 0079 — 安全模式审计证据链的范围：补配置变更审计与测评脚本，暂不做全量审计

**Status**: accepted（2026-10-20）

为让安全模式能**自证「当前处于合规配置」**，本轮只做两件事：
①配置变更进 `audit_logs`（新增 CONFIG 类 `AuditAction`）；
②`runtime/scripts/mlps3-drill.sh` 改读 DB `runtime_configs` 现值。
**明确不做**「强制全量审计」（移除高频读操作的硬编码丢弃）。

## 背景

等保评审会问「你怎么证明**现在**处于合规配置」，而当前系统无法自证。这不是单一缺口，
是四重叠加：

1. **配置变更不进 `audit_logs`**：`runtime-config.controller.ts` grep `Audit` 零命中；
   `AuditAction` 枚举里**没有任何 CONFIG 类**（已核实）。
2. **替代表 `runtime_config_logs` 证明力不足**：字段只有
   `key/oldValue/newValue/operatorId/operatorIp/createdAt`——**无 `success`、无 `userAgent`、
   无哈希链、可删改**。对照 `AuditLog` 的字段（`userId/ipAddress/userAgent/success/errorMessage`
   齐全）明显更弱，而配置链路不用它。
3. **哈希链覆盖不到运行时**：`audit-chain.ts` 的 SHA-256 + `prev_hash` 链只覆盖
   `audit_logs` 归档，**不含 `runtime_configs` 现值** → 能证明「过去」，证明不了「现在合规」。
4. **测评脚本读错层**：`runtime/scripts/mlps3-drill.sh`（9957B）**只读 `.env` 静态值**。
   但 `resolveValue()` 的优先级是 runtime > env，env 层是**中间层不是终层** →
   env 写 `true`、后台被改成 `false` 时，脚本仍报 ✅。这是**假阳性**，比不报更危险。

缺口 1、4 是可以直接修的；缺口 2、3 涉及表结构与哈希链扩展，属更大改造。

### 硬约束（决定了「全量审计」不能配置化）

- `AuditLogService.log()` **无条件写库**，全仓**无审计总开关**。
- `HIGH_FREQUENCY_READ_ACTIONS`（`audit-log.service.ts:77-81`）硬编码丢弃
  `FILE_UPLOAD / FILE_DOWNLOAD / USER_LOGIN`；过滤在 `:129` 且**仅当 `success === true`**，
  即**只丢弃成功的登录/上传/下载，失败保留**（暴力破解场景反而被放大）。
  实际只有 `USER_LOGIN` 有调用点（`auth-facade.service.ts:114/128/380`）。
- 写入是内联 `await prisma.auditLog.create()`，**同步阻塞在请求热路径**，无法降级为异步。
- 容量：63 个 `AuditAction`、49 处 `log(` 调用点；`FILE_CREATE / UPDATE / NODE_RENAME /
  MOVE / COPY / RESTORE` **每编辑动作一条** → 量随在线编辑量线性增长。

所以「安全模式开全量审计」**无法通过配置实现**，必须改代码移除硬编码过滤，
且没有异步化的退路。

## 决策

### D1 新增 CONFIG 类 `AuditAction`，配置变更进 `audit_logs`

`PUT /runtime-config/:key`、批量 reset、**以及 profile 批量应用**都写 `audit_logs`，
从而获得 `userId/userAgent/success` 字段与被哈希链覆盖的属性。
`runtime_config_logs` 保留（细粒度前后值），`audit_logs` 是权威审计层。

profile 批量应用写**一条**切换级审计记录（谁、何时、目标模式、影响的 key 集），
逐项的前后值仍在 `runtime_config_logs`——两者分工，不重复。

### D2 `mlps3-drill.sh` 改读 `runtime_configs` 现值

改查 `resolveValue()` 等价的实际生效值（DB 行 `value` + `updatedBy` 判定 + env 回落），
而不是 `.env` 裸值。这是**修正假阳性**，不是增强——现状的 ✅ 是不可信的。

### D3 不做「强制全量审计」，单独排票

不移除 `HIGH_FREQUENCY_READ_ACTIONS` 过滤。理由：

- **容量未核算**：`FILE_*` 每编辑动作一条，量随在线编辑线性增长；
  全量开之前需要容量与归档带宽核算，否则可能压垮 `audit_logs` 或备份窗口。
- **无异步化退路**：写入是热路径同步 `await`，全量开启的延迟影响无法预知、无法缓解。
- **收益与 D1 重叠**：等保考核的是**配置合规可证明**（D1 + D2 已覆盖），
  不是「所有操作都被记录」。全量审计是另一类诉求。

**这条是刻意延期，不是遗漏**——记在此处以免下一个人把「安全模式没有全量审计」
当成 bug 重新发现一遍。

### D4 缺口 2、3 本轮不做

`runtime_config_logs` 补字段、把 `runtime_configs` 现值纳入哈希链，
涉及表结构变更与哈希链语义扩展（哈希链覆盖「现值」需要定义快照语义），
单独排票。缺口 4（无配置基线快照）同理。

## 后果与代价

- **等保「自证现在合规」的最小闭环成立**：配置变更有 `audit_logs` 记录 + 测评脚本读实际生效值。
  这补上了 ADR-0077 / T17 选 A 留下的**弱断言**缺口——因为「安全模式 = 等保合规」现在
  靠管理员不改而非系统禁止写弱值，证据链是**唯一**能让当前配置可被证明为合规的手段，
  故 D1 + D2 从「可选增强」升为「刚需」。
- **`audit_logs` 写入量上升但可控**：只增配置变更类，数量级是运维操作次数，
  不是在线编辑量。这与 D3 拒绝的全量审计量级完全不同。
- **`runtime_config_logs` 与 `audit_logs` 短期双写**（D1 之后）：
  细粒度前后值在 `runtime_config_logs`，权威审计在 `audit_logs`。
  属 expand-contract 的「扩」阶段，须排收尾票决定 `runtime_config_logs` 是否最终并入
  （参照 AGENTS.md「扩的同时排收尾票」）。
- **「安全模式无全量审计」会被读成缺陷**：D3 已把延期理由写在这里，
  验收说明里也应引用本 ADR。

## 相关

- **ADR-0077** — 安全模式 profile 批量应用复用既有优先级链（D1 的调用方；
  且 T17 选 A 使本 ADR 的 D1 + D2 从可选升为刚需）
- **ADR-0078** — `variant` 不下沉运行时（形态进打包期、模式进运行时）
- 子票：**T6**（本 ADR）；相关待排：`runtime_config_logs` 补字段、现值纳入哈希链、配置基线快照、全量审计容量核算
