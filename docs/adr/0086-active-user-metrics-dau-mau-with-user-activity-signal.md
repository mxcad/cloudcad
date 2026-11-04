# 0086 — 运营统计活跃用户指标（DAU/MAU/粘性）：audit_logs ∪ user_activity 双源实时聚合

**Status**: accepted（2026-11-03）

## 背景

用户管理「运营统计」（AdminStatsPage，/users 内嵌 tab + /admin/stats）已有总量概览、每日新增用户、每日会员购买三个区块。新增需求：活跃用户数量指标（日活 DAU、月活 MAU、粘性 Stickiness=DAU/MAU）+ 近 30 天 DAU/MAU 双折线趋势。

初版设计拍板「活跃 = 任意审计事件，数据源仅 audit_logs，零新表/零 cron/零 migration」。实现过程中交叉验证发现**前提不成立**：ADR-0045（#207 阶段 1）规定高频读操作（USER_LOGIN/FILE_UPLOAD/FILE_DOWNLOAD）的**成功**记录在 `AuditLogService.log()` 写入入口被过滤、只记失败。因此：

- 成功登录（含微信登录）根本不在 audit_logs 里——「只登录浏览图纸」的用户对 DAU 完全不可见；
- 纯读用户（打开图纸 = FILE_DOWNLOAD 成功）同样不可见；
- DAU 实际退化为「当日做过高价值操作（建/存图纸、节点操作等）的用户数」，系统性低估活跃规模，指标失去运营意义。

活跃信号必须补上「成功的高频操作」，但不能违背 ADR-0045 的降噪决策（合规审计视图不能被最高频事件淹没）。

## 决策

### D1 活跃口径 = audit_logs ∪ user_activity（双源去重）

- **活跃行为** = 任意审计事件（audit_logs：文件/项目/节点操作、账号安全、反馈等）或成功的高频操作（登录/上传/下载，记于 user_activity）。按 userId + 东八区自然日去重。
- 指标：DAU = 今日 0 点至现在的实时值；MAU = 近 30 天滚动窗口（含今日）；粘性 = DAU/MAU（保留 4 位小数，MAU=0 时为 null）。趋势图 = 区间内每日 DAU + MAU 双折线（MAU 为以该日为锚的滚动窗口值）。
- 不产生任何记录的操作（纯浏览、缩略图加载）不计入——这是口径的已知边界（见 D5）。

### D2 新增 UserActivity 表：高频读成功事件的降级留痕

- 新表 `user_activity`（`UserActivity`：id + userId + createdAt，FK→users onDelete Cascade，索引 [userId]、[createdAt]）——**只存 userId + 时间**，无资源/参数/成功失败细节：它是运营分析信号，不是合规记录，不承载审计语义。
- **写入收口在 `AuditLogService.log()` 的既有过滤分支**（单一 choke point）：`success && HIGH_FREQUENCY_READ_ACTIONS.has(action)` 时，原「直接丢弃」改为「降级写 user_activity」（userId 为 unknown/缺失时跳过；写失败仅记 error 日志——分析数据非合规数据，不告警、不阻塞业务）。
- 该收口**自动覆盖全部登录/上传/下载路径**（密码/手机验证码/微信/手机验证登录 + 各上传下载调用点），无需在 auth facade 逐处埋点；未来新增高频读 action 也自动纳入。
- ADR-0045 的合规视图**零变化**：audit_logs 的写入集合、保留期、归档清理、管理端审计日志页均不受影响。

### D3 实时聚合，零快照/零 cron

- 与既有 admin-stats 同架构：查询时实时聚合。KPI 两条 `COUNT(DISTINCT userId)`（两表 UNION 去重）；趋势一条 SQL——`user_days` CTE（两表 UNION 出 DISTINCT (userId, 东八区日)）+ `generate_series` 日期轴 + 条件聚合（`COUNT DISTINCT CASE`）一次算出每日 dau/mau，序列在应用层零填充。
- 东八区切日 SQL 与既有区块一致：`(("createdAt" AT TIME ZONE 'UTC') + INTERVAL '8 hours')::date`。

### D4 已否决备选

| 备选 | 否决理由 |
|---|---|
| 把 USER_LOGIN 移出高频过滤集（成功登录重新进 audit_logs） | 直接回退 ADR-0045 的团队决策：合规审计视图被最高频事件淹没，管理端审计日志页/导出/归档全部受累 |
| 仅用 audit_logs 单源，接受低估 | 指标语义错误（只登录浏览的用户全部漏计），对 CAD 平台（大量只读查看用户）不可用 |
| 复用 ADR-0083 统一用户事件流（SSE） | 那是浏览器实时推送通道（进程内 EventEmitter + Redis pub/sub），不落库、不可查历史，无法支撑 30 天回看 |
| cron 每日 rollup 快照表 | 引入定时任务 + 快照滞后（「今日」值非实时）+ 回填问题；当前量级实时聚合足够 |
| 在 auth facade 各登录方法逐处埋点 | 4+ 个登录路径各自维护，上传/下载信号仍缺失，且与 @Audit 装饰器双轨；收口在 log() 一处更稳 |

### D5 已知取舍

- **user_activity 暂不接入清理调度**：audit_logs 有 `auditRetentionDays`（默认 183 天）到期清理 + 归档，user_activity 暂无对应清理。行极小（userId+时间），按当前量级（每用户每日数次）年增百万行级，PG 无压力；量级增长后接入既有 audit-cleanup 调度器（按 createdAt 批量删）即可，表结构已预留 createdAt 索引。
- **纯浏览用户仍不计入**：只打开页面、不触发登录/上传/下载/任何审计操作的用户无信号。登录是主要信号源（会话过期后回访必重新登录），低估幅度有限；若未来需要更细粒度（如页面心跳），再评估。
- **微信登录的 @Audit(USER_LOGIN)**（本需求顺手补齐）：成功记录同样被过滤（降级进 user_activity），其价值在**失败**记录留痕（审计视图）——与本地登录一致。

## 后果与代价

- **数据库**：`packages/db/prisma/schema.prisma` 新增 `UserActivity` 模型 + User 反向关系；migration `20261103020831_add_user_activity`（生产随 `prisma migrate deploy` 自动执行，纯新增表无存量迁移）。
- **后端**：`AuditLogService.log()` 过滤分支加降级写入（~15 行）；`AdminStatsService.getActiveStats()` 三条查询改 UNION 双源；`loginWithWechat` 补 `@Audit(USER_LOGIN)`。
- **三层联动**：DTO/端点形状不变（`GET /api/v1/admin/stats/active`），API SDK/MSW 零改动；前端仅副标题口径文案更新（四语言，机翻劣质已手工修正 en/ko）。
- **测试**：audit-log spec 新增 3 例（降级写入/unknown 跳过/fail-open）+ 既有 2 例改断言；admin-stats spec 补 SQL 含 `user_activity`/`UNION` 断言；后端全量 3608 例绿。
- **术语**：CONTEXT.md 新增「用户活动（UserActivity）」词条，修正 DAU 词条口径与审计日志词条交叉引用。

## 相关

- ADR-0045（审计日志重构：高频读只记失败——本 ADR 的前置约束）
- ADR-0083（统一用户事件流——已否决的复用备选）
- CONTEXT.md「日活跃用户/月活跃用户/粘性/用户活动/审计日志」词条
