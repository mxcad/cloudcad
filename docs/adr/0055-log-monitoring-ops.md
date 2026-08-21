# 0055 — 日志监控运维方案（Log Monitor Ops）

**Status**: accepted

当前日志/告警/备份/审计的运维能力碎片化：后端 pino 仅 stdout、无访问日志、无落盘轮转；`alert_records` 只落库无外发（WebhookService 无调用方）；`audit_logs` 180 天只删不归档；备份仅手动触发（config-service 的 `POST /api/db/backup`，含 pg_dump 封装/恢复/清理，但**无自动调度**）；`/metrics` 端点就绪但无采集端；config/storage/conversion 三服务仅 `console.log`。本 ADR 定下一套**与部署形态无关**的日志监控运维方案，覆盖日志落盘/访问日志/留存、告警邮件外发、Prometheus + Loki + Grafana 采集端、备份/归档/清理自动化，达到**等保三级**「安全审计」与「数据备份恢复」要求。

**硬约束**：不依赖 docker logging driver（toB 多形态：单机/docker/多机/裸机；toC 当前单机离线部署、存储/转换多机），应用层自带日志落盘+轮转；离线部署场景监控栈二进制需提前下载随包分发。

## 决策

### 1. 日志落盘、轮转、访问日志与脱敏（实现 #306 / #307 / #308）

| 项 | 决策 |
|---|---|
| 落盘 | pino-roll 多流：stdout（容器/PM2 兜底）+ 文件，按天轮转，保留 `LOG_RETENTION_DAYS=180`（env 可配） |
| 访问日志 | 自定义轻量中间件：`time/ip/method/path/status/duration/requestId/traceId/userAgent`；排除 `/health`、`/metrics`、静态资源；敏感 query 打码 |
| 目录 | `data/logs/<服务>/app-YYYY-MM-DD.log`、`access-YYYY-MM-DD.log`（根目录经 `LOG_DIR` env 可配，默认 `data/logs`） |
| 脱敏 | pino `redact`：password/passwd/pwd/token/authorization/cookie/验证码/手机号/邮箱；错误消息保留 sanitizeMessage |
| 服务包 | config/storage/conversion 零依赖 JSON 单行（stdout + fs append 按天轮转），读 `X-Request-Id` 写日志并回传 |
| 防篡改 | 日志文件 0640、目录 0750；审计走 DB + 备份兜底 |
| 清理 | 移除 `LOG_LEVELS` 死配置、仓库根 `backend.log` 空文件 |

### 2. 告警邮件外发链路（实现 #310 / #311 / #312）

| 项 | 决策 |
|---|---|
| 分级 | `AlertLevel` 三档 P0/P1/P2（Prisma 枚举 migration，兼容既有 WARNING/CRITICAL） |
| 时序 | P0 实时；P1 同 source 15min 聚合（事件数+首末时间）；P2 每日 9:00 日报 |
| 恢复 | 仅对已发过邮件的告警发恢复通知 |
| 配置 | `ALERT_EMAIL_ENABLED` + `ALERT_EMAIL_TO`（逗号分隔），发件人复用现有 SMTP |
| 失败 | 发送失败记日志 + detail 标记；连续失败 ≥5 次升级 P0（source: alert-email） |
| 扩展 | WebhookService 并行可选（已实现未接线） |
| 实现 | 新增 `AlertNotificationService`（EventEmitter 解耦）；`AlertService` 保持纯 DB |

### 3. 采集端拓扑：Prometheus + Loki + Grafana（实现 #313 / #314 / #317）

| 项 | 决策 |
|---|---|
| 位置 | 独立监控栈节点（单机离线时同机；Loki 单二进制+文件存储 ~512MB） |
| 认证 | `/metrics` 抓取 Bearer Token（`SCRAPE_TOKEN`）+ BasicAuth 备选 |
| 裸机 | 提前下载二进制 + systemd unit（离线部署包脚本）；docker-compose 变体并存 |
| 留存 | Loki：访问日志 180 天 / 应用日志 90 天（本地文件 180 天双保险） |
| Grafana | 登录认证（单管理员），不匿名 |
| Promtail | 每台业务机一份，标签 `service/host/env/log_type`，指向监控栈内网 HTTP |

### 4. Prometheus 指标告警规则（实现 #316）

8 条基础规则（`alert-rules.yml` 可外部覆盖，上线 2-4 周调优）：

| 规则 | 阈值 | severity |
|---|---|---|
| CPU | >85% 5min | P1 |
| 内存 | >85% 5min | P1 |
| 磁盘 | <10% 10min | P1 |
| 5xx 占比 | >5% 5min | P0 |
| P99 延迟 | >2s 5min | P0 |
| 事件循环延迟 | >100ms 5min | P1 |
| 进程存活 | up=0 | P0 |
| DB 连接池 | 待实现 | P1 |

Alertmanager 随监控栈部署，routes 按 severity 分组；与 AlertService 两套独立（指标告警直接邮件，业务告警走决策 2）。

### 5. 数据库备份自动化（实现 #318 / #319 / #320）

| 项 | 决策 |
|---|---|
| 形态 | backup scheduler（每日 01:00，`BACKUP_CRON` 可配）走 TaskRun；`POST /api/admin/backup` 手动触发；`GET /api/admin/backups` 列表 |
| 内容 | `pg_dump -Fc` 全量（子进程，探活 `PG_DUMP_PATH`→PATH）；文件目录由存储层冗余承载 |
| 本地 | `data/backups`，14 份轮转（`BACKUP_KEEP_LOCAL`） |
| 异地 | 每日推送：`BACKUP_REMOTE_TYPE=none\|rsync\|oss\|s3`，失败告警 P1 |
| 验证 | 备份后 `pg_restore --list` 完整性校验；月度恢复演练（临时库+表行数校验）；恢复流程文档化 |

### 6. 审计归档与防篡改（实现 #321 / #322 / #323 / #324）

| 项 | 决策 |
|---|---|
| 归档 | 按月 CSV（复用 exportLogs 字段）+ SHA-256 清单，`data/archives/audit-logs/YYYY-MM.csv`，目录 0750/0640 |
| 保留 | 183 天（`AUDIT_LOG_RETENTION_DAYS`，原 180 变更，>6 个月整）；**归档成功才删，失败保留并告警（fail-closed）** |
| 受限删除 | 新增 `AUDIT_ADMIN` 角色（三权分立）；`POST /audit/cleanup` 仅 AUDIT_ADMIN + 已归档校验 + 二次确认 + 留痕 |
| 查询 | CLI `scripts/audit-archive-query.ts`（校验 SHA-256 后检索 CSV）；DB 只查热数据 |

### 7. 清理任务可观测性（实现 #325 / #326）

- 指标：`cleanup_records_deleted_total{task}`、`cleanup_space_freed_bytes{task}`、`cleanup_last_duration_seconds{task}` 挂 `/metrics` + 结构化日志双写
- 失败分级：完全失败 P1、部分成功 P2（errorSummary 记录）
- `TASK_RUN_RETENTION_DAYS` 默认 30→180 天

### 8. 跨服务 trace 透传（实现 #309）

- 沿用 `X-Request-Id` / `X-Trace-Id`；后端出站调用点（conversion/storage/config）逐点注入，无 CLS 时生成新 ID
- 下游三服务随决策 1 读头写日志 + 响应回传
- backend 全局中间件 set `X-Request-Id` / `X-Trace-Id` / `X-Node-Id` 响应头（CORS 已暴露）

**Rejected options**

- **依赖 docker logging driver / 托管日志收集器**（如 CloudWatch、Loki docker plugin）：toB 提供单机/docker/多机/裸机多种部署形态，docker logging driver 只在 docker 场景可用，且离线部署时无法拉取插件。故应用层自带 pino-roll 落盘 + 轮转，作为与部署形态无关的兜底。
- **使用托管可观测平台（Datadog / 阿里云 SLS / 腾讯云 CLS）**：toC/toB 均有离线单机部署需求，第三方 SaaS 需外网出口且按量计费，不符合"与部署形态无关 + 离线可跑"约束。故选自建 Prometheus + Loki + Grafana（单二进制，离线可分发）。
- **监控栈与业务节点同机合装**：单机离线场景同机部署可接受，但多机/裸机场景每台业务机全装监控栈会重复占用资源且无集中视图。故监控栈独立成节点，单机离线时退化为同机。
- **审计归档采用 fail-open（归档失败仍删除热数据）**：审计记录属等保三级合规硬性要求，删除后不可恢复，失败删除即违反"防篡改 + 留存"目标。故归档失败保留并告警（fail-closed），与 ADR-0045 审计写库 fail-open 针对不同环节，不冲突。
- **审计清理交给普通 ADMIN 角色**：等保三级 8.5.2 要求三权分立（系统/安全/审计管理分离）。普通 ADMIN 同时管理审计记录会导致"删改留痕"无监督，故新增独立 AUDIT_ADMIN 角色承载审计受限清理。
- **异地备份仅做 rsync**：toB 部署环境网络/存储差异大（内网 rsync / 对象存储 OSS/S3 均有需求）。故 `BACKUP_REMOTE_TYPE` 三态可配（none/rsync/oss/s3），不绑死单一通道。
- **跨服务 trace 用 OpenTelemetry 全链路**：ADR-0013 已明确延后到拆微服务时，当前单实例 + 独立三服务规模下引入 OTel 成本高于收益。故沿用轻量 X-Request-Id/X-Trace-Id 逐点注入。

## 环境变量配置清单（新增/变更）

```env
# 日志
LOG_DIR=data/logs                    # 日志根目录
LOG_RETENTION_DAYS=180               # 应用/访问日志保留天数
LOG_ACCESS_ENABLED=true              # 访问日志开关

# 告警邮件
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_TO=ops@example.com,admin@example.com
ALERT_P1_WINDOW_MINUTES=15           # P1 聚合窗口
ALERT_P2_DAILY_HOUR=9                # P2 日报时间
ALERT_EMAIL_FAIL_ESCALATE=5          # 连续失败升级阈值
ALERT_WEBHOOK_URL=                   # 可选 webhook

# 监控栈
SCRAPE_TOKEN=                        # /metrics Bearer 抓取令牌

# 备份
BACKUP_ENABLED=true
BACKUP_DIR=data/backups
BACKUP_KEEP_LOCAL=14
BACKUP_CRON=0 1 * * *                # 每日 01:00
BACKUP_REMOTE_TYPE=none|rsync|oss|s3
BACKUP_REMOTE_HOST=/USER/PATH=       # rsync
BACKUP_REMOTE_ENDPOINT/BUCKET/ACCESS_KEY/SECRET=  # oss/s3

# 审计归档
AUDIT_ARCHIVE_ENABLED=true           # 等保验收需开启
AUDIT_ARCHIVE_PATH=data/archives/audit-logs
AUDIT_LOG_RETENTION_DAYS=183         # 原 180 变更

# 清理
TASK_RUN_RETENTION_DAYS=180          # 原 30 变更
```

## 等保三级合规对照

| 条款 | 要求 | 落地位置 | 验收一句话 |
|---|---|---|---|
| 8.3.5.1/2 | 网络访问行为审计 | 决策 1 访问日志 | 访问日志含时间/IP/URL/结果/用户，留存 ≥180 天 |
| 8.4.3.1/2 | 审计功能与记录内容 | 现状 audit_logs + 触发点清单 | 关键操作均有审计记录且含成功/失败 |
| 8.4.3.3 | 审计记录保护 | 决策 6 | 归档 + SHA-256 + 仅 AUDIT_ADMIN 受限清理 |
| 8.4.9.1/2 | 本地/异地备份 | 决策 5 | 自动每日备份 + 异地推送 + 月度恢复演练 |
| 8.5.4 c/d | 集中监测/审计留存 | 决策 3 | Loki/Prometheus 集中收集，留存 ≥6 个月 |
| 8.5.4 f | 安全事件告警 | 决策 2/4 | 告警邮件外发有人接收，分级可达 |
| 8.5.2 | 三权分立 | 决策 6 | 审计管理员角色独立 |

另立任务（本 effort 范围外）：8.4.9.3 热冗余（架构级）；8.10.x 运维制度文档、漏洞扫描、应急预案（制度层）。

## 与既有 ADR 关系

- **ADR-0013**（可观测性：pino + Prometheus RED + Sentry）：本 ADR 是其采集端与落盘端的**落地实现**——0013 只输出 JSON、`/metrics` 就绪但无采集端；本方案补上 Promtail/Loki/Grafana 采集拓扑与日志落盘留存。
- **ADR-0045**（审计日志重构：单表双视图）：本 ADR 在其保留策略基础上扩展**归档 + SHA-256 + AUDIT_ADMIN 受限清理**；其"fail-open 审计写库"与本文档"归档失败 fail-closed"针对不同环节（写库 vs 归档），不冲突。
- **ADR-0044**（IP 黑名单）：访问日志/告警链路与之正交，无耦合。

## 实施映射

对应实现 tickets（issue #305 子票 10-30）：

| 决策 | tickets |
|---|---|
| 1 日志落盘/访问/脱敏 | #306、#307、#308 |
| 2 告警外发 | #310、#311、#312 |
| 3 采集端拓扑 | #313、#314、#317 |
| 4 指标告警规则 | #316 |
| 5 备份自动化 | #318、#319、#320 |
| 6 审计归档 | #321、#322、#323、#324 |
| 7 清理可观测 | #325、#326 |
| 8 trace 透传 | #309 |

**Status**: accepted

**Cross-references**
- ADR-0013 可观测性（pino + Prometheus RED + Sentry）
- ADR-0045 审计日志重构（保留策略 + 审计通道）
- ADR-0044 IP 黑名单
- `.scratch/log-monitor-ops/design.md`（wayfinder 决策设计稿，本 ADR 为其正式固化，若与 ADR 有出入以本 ADR 为准）
- 等保三级规范条款映射（见上文合规对照表）
