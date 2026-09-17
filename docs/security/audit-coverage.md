# 审计触发点覆盖清单

> 对应等保 8.4.3.1（安全审计——审计覆盖到每个用户）/ 8.4.3.2（审计记录内容要求）验收条目。
> 本文与代码同步维护：**新增/删除审计埋点时必须更新本清单**（评审抽查依据）。
>
> - 枚举单一事实源：`packages/backend/src/common/enums/audit.enum.ts`（`AuditAction`）
> - 写入统一收敛：`AuditLogService.log()` / `logProjectNodeAction()`（`src/audit/audit-log.service.ts`）
> - 声明式埋点：`@Audit()` 装饰器（`src/common/decorators/audit.decorator.ts`）→ `AuditLogger` 全局单例
> - 重构背景：ADR-0045（《审计日志重构》）

## 1. 审计记录字段说明

每条审计记录（`audit_logs` 表）包含：

| 字段                          | 说明                                                | 等保 8.4.3.2 对照                           |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------- |
| `action`                      | 操作类型（`AuditAction` 枚举）                      | 事件类型                                    |
| `resourceType` / `resourceId` | 资源类型与资源 ID                                   | 资源定位                                    |
| `userId`                      | 操作者用户 ID（强外键，关联 user 摘要）             | 事件主体（日期时间+用户+事件类型+成功失败） |
| `projectId` / `resourceName`  | 项目维度过滤 + 资源名称快照（资源删除后记录仍可读） | —                                           |
| `params`                      | 结构化参数快照（JSON），替代已废弃的 `details` blob | 事件详情                                    |
| `ipAddress` / `userAgent`     | 客户端信息（部分入口记录）                          | 来源可追溯                                  |
| `success` / `errorMessage`    | 结果与失败原因                                      | 事件结果                                    |
| `createdAt`                   | 记录时间                                            | 日期与时间                                  |

**通用约定**：

- **失败也记**：绝大多数直接调用点对异常路径同样写审计（`success=false` + `errorMessage`），写库失败不阻塞业务。
- **高频读过滤**（#207 阶段 1）：`USER_LOGIN` / `FILE_UPLOAD` / `FILE_DOWNLOAD` 的**成功**记录在写入入口统一丢弃（零审查价值）；**失败**记录保留。文件上传成功改由 `FILE_CREATE` 记录承载。
- **`@Audit` 装饰器仅成功路径**：包装方法抛异常时不写审计（异常向上传播）；无法取得合法 `userId` 时跳过（避免外键占位噪音）。登录失败等安全事件由对应服务独立留痕（如 `ADMIN_LOGIN` 失败记录）。

## 2. 必审操作清单

### 2.1 认证与会话（账号安全）

| 操作                         | AuditAction                                                    | 触发位置                                                                                                                         | params 快照要点                                               | 敏感数据/脱敏                    |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| 用户注册（含第三方自动注册） | `USER_REGISTER`                                                | `auth/auth-facade.service.ts` @Audit ×3                                                                                          | 默认 `{}`                                                     | 邮箱经日志关联表可见，导出需权限 |
| 邮箱验证                     | `USER_VERIFY_EMAIL`                                            | 同上 ×1                                                                                                                          | 默认 `{}`                                                     | 否                               |
| 用户登录                     | `USER_LOGIN`                                                   | 同上 ×3（密码/手机/第三方）                                                                                                      | 默认 `{}`；**成功记录被高频读过滤器丢弃，失败留痕依赖各服务** | IP 属个人信息                    |
| 用户登出                     | `USER_LOGOUT`                                                  | 同上 ×1                                                                                                                          | 默认 `{}`                                                     | 否                               |
| 管理员入口登录               | `ADMIN_LOGIN`                                                  | `auth/impl/services/admin-auth.service.ts:188`（成功）、`:240`（失败）                                                           | errorMessage 含失败原因                                       | 高敏：仅管理员专用入口           |
| 绑定邮箱/手机/微信           | `USER_BIND_EMAIL` ×2、`USER_BIND_PHONE` ×2、`USER_BIND_WECHAT` | auth-facade @Audit                                                                                                               | 默认 `{}`                                                     | 手机号不落审计字段               |
| 换绑邮箱/手机                | `USER_REBIND_EMAIL`、`USER_REBIND_PHONE`                       | 同上                                                                                                                             | 默认 `{}`                                                     | 同上                             |
| 解绑微信/邮箱/手机           | `USER_UNBIND_WECHAT`、`USER_UNBIND_EMAIL`、`USER_UNBIND_PHONE` | 同上                                                                                                                             | 默认 `{}`                                                     | 否                               |
| 密码修改                     | `USER_CHANGE_PASSWORD`                                         | `users/services/user-password.service.ts:73`（成功）/`:91`（失败）                                                               | 无参数快照                                                    | **不记录任何口令值**             |
| 账号注销/停用                | `USER_DEACTIVATE`                                              | `users/services/user-status.service.ts:61`（管理员软删）、`:114`（彻底删除，`immediate:true`）、`:239`（自主注销）；各配失败分支 | `{ deactivatedBy, immediate? }`，`resourceName` 存 email 快照 | email 快照属个人信息，导出管控   |

### 2.2 权限与角色变更

| 操作     | AuditAction         | 触发位置                                                                                   | params 快照要点 | 敏感数据/脱敏 |
| -------- | ------------------- | ------------------------------------------------------------------------------------------ | --------------- | ------------- |
| 角色创建 | `ROLE_CREATE`       | `roles/roles.service.ts:161`（系统角色）、`roles/project-roles.service.ts:249`（项目角色） | —               | 否            |
| 角色更新 | `ROLE_UPDATE`       | `roles.service.ts:259`、`project-roles.service.ts:337`                                     | —               | 否            |
| 角色删除 | `ROLE_DELETE`       | `roles.service.ts:326`、`project-roles.service.ts:493`                                     | —               | 否            |
| 权限授予 | `PERMISSION_GRANT`  | `roles.service.ts:388`、`project-roles.service.ts:813`                                     | —               | 否            |
| 权限回收 | `PERMISSION_REVOKE` | `roles.service.ts:451`、`project-roles.service.ts:893`                                     | —               | 否            |

### 2.3 项目生命周期

| 操作           | AuditAction              | 触发位置                                      | params 快照要点 | 敏感数据/脱敏                |
| -------------- | ------------------------ | --------------------------------------------- | --------------- | ---------------------------- |
| 项目创建       | `PROJECT_CREATE`         | `file-operations/project-crud.service.ts:144` | —               | 否                           |
| 项目更新       | `PROJECT_UPDATE`         | `project-crud.service.ts:667`、`:734`         | —               | 项目名称随 resourceName 快照 |
| 项目移入回收站 | `PROJECT_DELETE`         | `file-operations/node-trash.service.ts:250`   | —               | 否                           |
| 项目恢复       | `NODE_RESTORE`（项目级） | `node-trash.service.ts:591`                   | —               | 否                           |
| 项目转移所有权 | `PROJECT_TRANSFER`       | **枚举已定义，暂无调用点（已知缺口，见 §4）** | —               | —                            |

### 2.4 成员变更

均位于 `file-system/project-member/project-member.service.ts`，成功/失败双路记录：

| 操作           | AuditAction          | 触发位置             | params 快照要点 | 敏感数据/脱敏 |
| -------------- | -------------------- | -------------------- | --------------- | ------------- |
| 添加成员       | `ADD_MEMBER`         | `:200` / 失败 `:223` | —               | 否            |
| 更新成员角色   | `UPDATE_MEMBER`      | `:356` / 失败 `:384` | —               | 否            |
| 移除成员       | `REMOVE_MEMBER`      | `:469` / 失败 `:492` | —               | 否            |
| 转让项目所有权 | `TRANSFER_OWNERSHIP` | `:635` / 失败 `:658` | —               | 否            |

### 2.5 文件危险操作与节点变更

| 操作                             | AuditAction                 | 触发位置                                                                                                                                                                       | params 快照要点                        | 敏感数据/脱敏                     |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------- |
| 文件/文件夹移入回收站            | `FILE_DELETE`               | `node-trash.service.ts:289`                                                                                                                                                    | resourceType 按 FILE/FOLDER 区分       | 文件名随 resourceName             |
| 图纸新建（上传成功且为全新节点） | `FILE_CREATE`               | `mxcad/upload/mxcad-upload.controller.ts:189`、`:305`（上传链路）；`mxcad/save/save.controller.ts:294`（另存为新图）；`file-system/file-tree/file-tree.service.ts:298`（建树） | —                                      | 否                                |
| 图纸修改（显式保存/覆盖更新）    | `FILE_UPDATE`               | `mxcad/save/save.controller.ts:134`                                                                                                                                            | —                                      | 否                                |
| 上传失败                         | `FILE_UPLOAD`（失败保留）   | `mxcad-upload.controller.ts:314`                                                                                                                                               | errorMessage                           | 否                                |
| 文件分享创建                     | `FILE_SHARE`                | `share/share.service.ts:65`                                                                                                                                                    | —                                      | 分享链接本身不入审计              |
| 分享撤销                         | `FILE_SHARE`                | `share.service.ts:201`                                                                                                                                                         | `{ shareAction:'revoke', shareToken }` | shareToken 为访问凭据，展示时注意 |
| 文件夹创建                       | `FOLDER_CREATE`             | `project-crud.service.ts:206`                                                                                                                                                  | —                                      | 否                                |
| 节点重命名                       | `NODE_RENAME`               | `file-operations/file-operations.service.ts:92`                                                                                                                                | `{ oldName, newName }`                 | 否                                |
| 节点移动                         | `NODE_MOVE`                 | `file-operations/node-copy-move.service.ts:235`                                                                                                                                | `{ oldParentId, newParentId }`         | 否                                |
| 节点复制                         | `NODE_COPY`                 | `node-copy-move.service.ts:381`                                                                                                                                                | `{ sourceNodeId, sourceName }`         | 否                                |
| 回收站恢复                       | `NODE_RESTORE`              | `node-trash.service.ts:520`                                                                                                                                                    | `{ restoredName }`                     | 否                                |
| 文件下载                         | `FILE_DOWNLOAD`（失败保留） | `file-system/file-download/file-download-export.service.ts` 多处                                                                                                               | errorMessage                           | 成功记录被高频读过滤器丢弃        |

### 2.6 网络安全管控（IP 黑白名单）

均成功/失败双路记录：

| 操作             | AuditAction           | 触发位置                                                 | params 快照要点     | 敏感数据/脱敏                                  |
| ---------------- | --------------------- | -------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| 黑名单加入       | `IP_BLACKLIST_ADD`    | `ip-blacklist/ip-blacklist.service.ts:273` / 失败 `:293` | IP 值在被管控对象上 | **IP 地址属个人信息**，查询/导出按 §3 权限管控 |
| 黑名单移除       | `IP_BLACKLIST_REMOVE` | 同上 `:328` / `:344`                                     | 同上                | 同上                                           |
| 管理员白名单加入 | `IP_WHITELIST_ADD`    | `ip-whitelist/ip-whitelist.service.ts:234` / 失败 `:249` | 同上                | 同上                                           |
| 管理员白名单移除 | `IP_WHITELIST_REMOVE` | 同上 `:290` / `:305`                                     | 同上                | 同上                                           |

### 2.7 审计自身与资金敏感

| 操作                       | AuditAction      | 触发位置                                                                | params 快照要点                                                                                                                                   | 敏感数据/脱敏                                                              |
| -------------------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 审计日志导出               | `AUDIT_EXPORT`   | `audit/audit-log.controller.ts`（exportLogs）                           | `{ format, action, startDate, endDate, success }`（过滤条件快照）                                                                                 | 导出文件含全量日志字段（email/IP），接口需 `AUDIT_ADMIN` 或 `SYSTEM_ADMIN` |
| 审计日志清理（含被拒尝试） | `AUDIT_CLEANUP`  | `audit-log.controller.ts` `writeCleanupTrail`（#323）                   | `{ confirm, requestedDaysToKeep, effectiveDaysToKeep, retentionDays, cutoff, reason?, violations?, deletedCount }`；成功与 400/409 被拒尝试均留痕 | 仅 `AUDIT_ADMIN` 可触发（三权分立）                                        |
| 告警解决                   | `ALERT_RESOLVE`  | `alert/alert.controller.ts:105`（经 `AuditLogger` 全局单例，fail-open） | —                                                                                                                                                 | 否                                                                         |
| 退款申请                   | `REFUND_APPLY`   | `billing/billing.service.ts:892`                                        | `{ orderId, applicationId, amount }`                                                                                                              | 金额敏感，仅授权角色可见                                                   |
| 退款审核通过               | `REFUND_APPROVE` | `billing.service.ts:1006`                                               | `{ applicationId, amount, note }`                                                                                                                 | 同上                                                                       |
| 退款审核驳回               | `REFUND_REJECT`  | `billing.service.ts:1067`                                               | 同上                                                                                                                                              | 同上                                                                       |

## 3. 日志留存与查阅（对照 8.4.3.2 / 运维制度）

- **留存期**：默认 **183 天**（环境变量 `AUDIT_LOG_RETENTION_DAYS`，严格大于 6 个月整，#322），每日定时清理超期记录（`common/schedulers/audit-cleanup.scheduler.ts`）。
- **归档**（#322 已实现）：fail-closed——`AUDIT_ARCHIVE_ENABLED=true` 时超期记录先按月分片导出 CSV + SHA-256 校验清单（`data/archives/audit-logs/YYYY-MM.{csv,sha256}`），**全部归档成功才从数据库删除**；任一分片失败整体失败、记录保留、任务告警。归档检索走 CLI 脚本（#324，`pnpm audit:archive-query`）。
- **手动清理**：`POST /audit/cleanup` 仅限审计管理员（三权分立，#321）；受限删除（#323）：请求须带 `confirm: true` 二次确认，且目标时间段必须已归档（未归档/产物不完整 409 拒删），清理动作本身记 `AUDIT_CLEANUP` 审计。
- **查询/统计**：审计日志列表/详情/统计接口按系统权限管控；项目维度另有 `ProjectAuditLogController`。
- **敏感字段处理**：口令类值一律不入审计（如密码修改无参数快照）；email/IP 等个人信息仅在受权限保护的查询与导出中可见，对外提供需按运维制度脱敏（见 `docs/ops/log-audit-policy.md`）。

## 4. 已知缺口（如实披露，供评审与整改排期）

| 缺口                        | 说明                                                           | 建议                                                         |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `PROJECT_TRANSFER` 无调用点 | 枚举已定义但业务未实现项目转移                                 | 实现该功能时补埋点并更新本清单                               |
| 高频读成功不留痕            | 登录/下载/上传成功的详细留痕依赖应用访问日志而非审计表         | 等保若要求"全部成功操作留痕"，启用应用层访问日志作为补充证据 |
| `@Audit` 仅成功路径         | 装饰器方法抛异常时不写审计；个别认证失败场景依赖服务内独立留痕 | 新增关键入口优先采用显式 `auditLogService.log()` 双路模式    |

> 已闭环：~~审计清理动作不落审计表~~ —— #323 已新增 `AUDIT_CLEANUP` 动作，手动清理的成功与被拒尝试均记录（见 §2.7）。

## 5. 维护约定

1. 新增 `AuditAction` 枚举值 → 同步本清单（表格加行）；
2. 新增 `@Audit` 装饰器或 `auditLogService.log()` 调用点 → 标注"触发位置"列的文件与行为；
3. 评审方式：抽查任一 action，用 `git grep "AuditAction.<ACTION>" packages/backend/src -- ':(exclude)*.spec.ts'` 应能在本文找到对应行。
