# 0045 — 审计日志重构：单表双视图 + 高价值动作清单 + 快照可读性
**Status**: accepted

现有审计日志（AuditLog）"记了没法看"：30 种枚举中权限变更/项目生命周期/文件删除全部零调用（最大缺口），而登录、下载等高价值最低的操作占据全部记录（auth 18 处、下载 10 处）；记录结构是 `action + resourceId(UUID) + details(JSON blob)`，前端表格只能显示 UUID 和截断 JSON，无项目维度、无可读文案。决定：重构为"管理员审计视图 + 项目操作历史视图"共用同一张表，记录范围收窄到高价值操作，存储结构改为"事件模板 + 参数 + 名称快照"，存量噪音数据随 migration 全清。

**Decision**

1. **领域模型：两个概念、一个存储**。审计日志（AuditLog，管理员全局合规视图）与操作历史（Operation History，项目成员的项目级视图）是同一事件流的两个投影，共用一张 `AuditLog` 表，写入端唯一（业务代码只调一次 `audit()`），查询端按视图过滤（全局 vs `projectId`）。不做两张表（事件重叠 >90%，双写 = 双倍漏记风险与维护成本）。
2. **动作清单收窄**（"日志不能太多"的落点）：只记"改变了系统状态且难以察觉或不可逆"的操作——权限/角色变更（PERMISSION_GRANT/REVOKE、ROLE_*，现零调用，必须补齐）、项目生命周期（创建/删除/转移）、成员变更（已有）、文件危险操作（删除/公开分享，现零调用，必须补齐）、账号安全（改密码/解绑/停用，已有）。**高频读操作降级为只记失败**：FILE_UPLOAD/FILE_DOWNLOAD/USER_LOGIN 成功不记（现 10 处下载调用是噪音主源），登录失败保留（异常才有审查价值）。
3. **Schema 可读性改造**（"没法看"四痛点的根治）：
   - 新增 `projectId`（系统级操作可空）→ 项目维度过滤；
   - 新增 `resourceName` 名称快照（记录时存当时的文件/项目/用户名称）→ 资源被删后记录依然可读，不依赖关联查询；
   - `details` JSON blob 改为结构化 `params` JSON（如 `{targetUserId, targetUserName, fromRole, toRole}`），前端按 action 渲染 i18n 文案（"张工 将 李工 的角色从 查看者 改为 编辑者"）。
   - 原则：**"谁对谁做了什么"必须在不查其他表的情况下读出来**——人名/文件名/项目名全部快照入库。
4. **保留策略**：默认 180 天，环境变量 `AUDIT_LOG_RETENTION_DAYS` 可配，复用现有 `cleanupOldLogs` + 调度器每日清理。不做永久保留/防篡改（SaaS ToB 合规底线 180 天足够，监管证据场景已排除）。
5. **可靠性 = fail-open + 失败可见**：审计写库失败不阻塞业务操作（ToC 产品不能让 DB 抖动连带"移除成员"失败），但必须打点/告警让运维发现"审计通道坏了"，禁止静默失败。事件量收窄后同步 `await` 写库的延迟影响可忽略。
6. **ToB 导出 = 异步任务**：独立导出接口（按筛选条件导出 CSV/Excel），量大时异步生成 + 文件下载，导出动作本身记录一条审计日志；不做定时自动导出/签名校验（无真实客户要求）。
7. **操作历史前端入口**：文件系统根目录工具栏"操作历史"按钮（与"成员"并列），弹窗展示项目动态；owner/admin 可见全部、普通成员只读。不放在成员弹窗内（操作历史不只是成员事件）。
8. **存量数据**：现有噪音日志（登录/下载/绑定类）随 migration 全清——旧值在动作清单精简后失配、且本身不可读零价值。
9. **三层联动**：后端 DTO/Schema 变更走 `generate:swagger` → `generate:api-types` 重生成 SDK；前端审计页改造 + 操作历史弹窗一律走 SDK 生成函数；Prisma schema 变更走 `migrate dev`（禁 db push）。

**Rejected options**

- **两张表（AuditLog + ProjectActivity 分离）**：事件重叠 >90%，双写入路径、双查询/清理/导出逻辑，漏记风险翻倍；领域上本就是同一事件流的两个投影。
- **全量记录（保留登录/下载成功）**：ToC 海量用户下日志量失控（现下载单模块 10 处埋点即是噪音源），且对安全审查无价值。
- **fail-closed（审计写失败则业务拒绝）**：一次 DB 抖动连带所有权限变更/成员管理失败，ToC 产品不可接受的用户伤害。
- **details 字段保留 JSON 原文 + 前端格式化展示**：仅修症状不修病根，列表仍不可读、仍无法按语义过滤；结构化 params + i18n 模板渲染才是可读性的来源。
- **不做名称快照、依赖关联查询**：资源（文件/项目）删除后记录即失效，"查不到"正是本次重构要消除的痛点；快照冗余是必要代价。

**后续演进（2026-08-14）**

动作清单在收窄决策后按"项目操作历史"语义补齐了三组埋点缺口：

1. **文件变更埋点落地**（原决策列为"必须补齐"但未实现）：上传成功且新建节点记 `FILE_CREATE`（uploadFiles + fileisExist 秒传两条路径，秒传新建节点此前是盲区）、编辑器显式保存记 `FILE_UPDATE`、另存为项目记 `FILE_CREATE`。埋点区分"真正新建节点"（`IngestResult.created` 标志）：skip 冲突返回已有节点不算新增，避免误报。
2. **节点操作动作新增**：`FOLDER_CREATE`（新建文件夹）、`NODE_RENAME`（重命名，仅名称实际变化时记）、`NODE_MOVE`、`NODE_COPY`（resourceId 用新节点）、`NODE_RESTORE`（回收站恢复，仅文件/文件夹）。批量移动/复制循环复用单点埋点。同步 Prisma schema 枚举 + migration（`20260814_add_audit_node_actions`）。
3. **账号安全埋点补齐**：`USER_CHANGE_PASSWORD`（UserPasswordService，成败都记，params 带 changeType）、`USER_DEACTIVATE`（自助注销 service + 管理员软删/彻底删除 controller，params 带 deactivatedBy/immediate）。前端枚举/模板/i18n 四语言同步。
4. **写入口收敛**：项目内节点动作统一走 `AuditLogService.logProjectNodeAction(action, nodeId, userId, extraParams?, resourceType?)`（按 nodeId 查 projectId，仅项目内记录；resourceType 默认 FILE，文件夹操作传 FOLDER），项目生命周期/账号安全/系统级动作直接 `log()`。
5. **后续补齐（同日）**：`createDrawingFromTemplate`（从模板新建图纸，第 4 条创建路径）补 FILE_CREATE；`restoreProject`（项目恢复）补 NODE_RESTORE（项目根 projectId 为空，直接 log 并以项目自身 id 作 projectId）；IP 黑名单伪埋点（`logger.log(...,'audit')` 未落库）替换为真实 `log()`（IP_BLACKLIST_ADD/REMOVE，名称快照=IP）。审计埋点全景至此无已知缺口。

**Status**: accepted

**Cross-references**
- CONTEXT.md「审计日志（AuditLog）」「操作历史（Operation History）」
- `packages/backend/src/common/enums/audit.enum.ts`（动作清单收窄对象）
- `packages/backend/src/audit/`（audit-log.service / audit-logger.service / controller，保留期与清理机制复用）
- `packages/frontend/src/pages/AuditLogPage/`（审计视图改造对象）
- `packages/frontend/src/components/modals/OperationHistoryModal.tsx`（操作历史弹窗：时间分组 + 点击定位节点所在位置）
- AGENTS.md 数据库迁移工作流（migrate dev → 提交 migration → 生产 migrate deploy）
