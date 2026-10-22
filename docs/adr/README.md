# ADR 索引

CloudCAD 架构决策记录（`docs/adr/`）。编号唯一；`superseded` 表示已被后续决策取代（保留原文供追溯）。

| 编号 | 状态 | 决策 |
|------|------|------|
| [0001](0001-merge-conversion-engine-into-backend.md) | `superseded` | Merge conversion-engine into backend |
| [0002](0002-decouple-file-operations-module.md) | `accepted` | Decouple file-operations module and trim FileSystemService facade |
| [0003](0003-permission-store-strategy-pattern.md) | `accepted` | 引入 IPermissionStore 策略模式解耦权限检查和持久化 |
| [0004](0004-frontend-css-layer-system.md) | `superseded` | Frontend CSS Z-Index Layer System |
| [0005](0005-mxcad-manager-command-pattern.md) | `accepted` | Deepen mxcadManager god module with Command pattern |
| [0006](0006-auth-provider-strategy-pattern.md) | `accepted (significant update 2026-07)` | 可替换认证两层 seam 架构 |
| [0007](0007-three-layer-dependency-architecture.md) | `accepted` | 三层依赖约束架构 |
| [0008](0008-incremental-strict-null-checks.md) | `accepted` | 增量开启 strictNullChecks |
| [0009](0009-ownership-strategy-pattern.md) | `accepted` | OwnershipStrategy 收拢 Project/PersonalSpace/Library 三路分支 |
| [0010](0010-filesystem-node-single-table.md) | `accepted` | FileSystemNode 保持单表不拆分 |
| [0011](0011-save-transaction-flow.md) | `accepted` | 保存流程使用 per-save backup + auto-restore 保证原子性 |
| [0012](0012-cache-architecture-simplification.md) | `accepted` | 缓存架构简化：移除 L3 数据库缓存层 |
| [0013](0013-observability-pino-prometheus-sentry.md) | `accepted` | ADR-0013: 可观测性 — pino + Prometheus RED + Sentry |
| [0014](0014-conversion-service.md) | `accepted` | Extract conversion engine into standalone conversion service |
| [0015](0015-storage-service-svn-colocated-sharding.md) | `accepted` | Storage service with SVN-colocated sharding |
| [0016](0016-progressive-deployment-three-modes.md) | `accepted` | Progressive deployment: embedded / standalone / cloud FaaS |
| [0017](0017-vip-tier-quota-configuration.md) | `accepted` | VIP 等级 + 键值对配额配置系统 |
| [0018](0018-old-site-user-sync.md) | `accepted` | 旧官网用户同步到 CloudCAD 私有认证方案 |
| [0019](0019-subpackage-architecture.md) | `accepted` | 私有包分包架构 (@cloudcad/*) |
| [0020](0020-replaceable-vs-internal-service.md) | `accepted` | 扩展点 vs 内部服务：接口抽象的边界规则 |
| [0021](0021-contracts-impl-boundary.md) | `accepted` | Contracts 与 Impl 的分界约定 |
| [0022](0022-drawing-version-deployment-verification.md) | `accepted` | 图纸版本部署采用轻量验证方案 |
| [0023](0023-external-ref-facade-token.md) | `accepted` | 0023 — External-ref module uses module-local facade token |
| [0024](0024-external-ref-url-filesdata-engine-resolver.md) | `accepted` | ADR-0024: 外部参照文件存储与路径的 mxcad 引擎耦合约束 |
| [0025](0025-prorated-upgrade-pricing.md) | `accepted` | ADR-0025: VIP 升级按价差折算延期 |
| [0026](0026-extension-mechanism-master.md) | `accepted` | 扩展机制总纲：三类扩展 + 类型获取 + 契约先行 + 六场景验收 + AI 探针 |
| [0027](0027-shared-prisma-client.md) | `accepted` | @cloudcad/db 共享 Prisma Client |
| [0028](0028-frontend-dependency-layering.md) | `accepted` | 前端依赖分层与门禁 |
| [0029](0029-frontend-module-entry-facade.md) | `accepted` | 0029 — 前端模块入口（Façade/barrel）规则 |
| [0030](0030-frontend-state-ownership.md) | `accepted` | 0030 — 前端状态管理归属规则 |
| [0031](0031-frontend-replaceability-rule.md) | `accepted` | 0031 — 前端可替换与扩展点选型规则 |
| [0032](0032-frontend-style-system.md) | `accepted` | 0032 — 前端样式统一规范（单一主范式 + 变量统一 + z-index 门禁） |
| [0033](0033-frontend-file-splitting-contract.md) | `accepted` | 0033 — 前端巨型文件拆分契约（400 行上限 + 组合式拆分） |
| [0034](0034-frontend-fetch-governance.md) | `accepted` | 0034 — 前端直连 fetch 治理（收编 SDK + 豁免清单 + 门禁） |
| [0035](0035-drawing-ingest-module.md) | `accepted` | 0035 — 图纸摄入深模块（Drawing Ingest deep module） |
| [0036](0036-membership-read-authority.md) | `accepted` | 0036 — 会员状态读侧权威（Membership read authority） |
| [0037](0037-node-mutation-guard.md) | `accepted` | 0037 — 节点变更校验（Node Mutation Guard） |
| [0038](0038-batch-download-job.md) | `accepted` | 0038 — 批量下载任务生命周期（Batch Download Job） |
| [0039](0039-drawing-session.md) | `accepted` | 0039 — 图纸会话深模块（Drawing Session） |
| [0040](0040-export-modals.md) | `accepted` | 0040 — ExportModals 导出子系统深模块 |
| [0041](0041-exe-vip-purchase-flow.md) | `accepted` | ADR-0041: EXE 客户端 VIP 购买流程契约（设备码流 + 授权重定向） |
| [0042](0042-toc-launch-boundary-and-feature-switch.md) | `accepted` | ADR-0042: C 端（TOC）首版开放边界与功能开关灰度 |
| [0043](0043-conversion-frequency-limit.md) | `accepted` | 0043 — 转换频率限制（窗口化）替代每日转换配额 |
| [0044](0044-ip-blacklist.md) | `accepted` | 应用层手动管理 + 自动封禁预留 |
| [0045](0045-audit-log-refactor.md) | `accepted` | 单表双视图 + 高价值动作清单 + 快照可读性 |
| [0046](0046-offline-incremental-upgrade-package.md) | `accepted` | 解压即升级 + 固定正向子集 + 无条件全量 store |
| [0047](0047-tier-config-registry-shared-module.md) | `accepted` | ADR-0047: 会员配置注册表共享模块 |
| [0048](0048-documentation-governance.md) | `accepted` | 0048 — 文档治理（Documentation governance） |
| [0049](0049-external-ref-operation-permissions.md) | `accepted` | 0049 — 外部参照操作权限（写=CAD_EXTERNAL_REFERENCE、读=FILE_OPEN、移动端范围） |
| [0050](0050-scroll-pagination-unified-controller.md) | `accepted` | 0050 — 前端滚动分页统一控制器（useScrollPagination + mergeNodesByMode，四场景共用） |
| [0051](0051-project-role-templates-autonomy.md) | `accepted` | 0051 — 项目角色模板化与项目自治（创建时复制模板；私人空间/公开资源库零角色；OWNER 数据驱动保护；删除降级 + 删光自愈自动重建默认成员角色） |
| [0052](0052-frontend-list-interaction-unification.md) | `accepted` | 0052 — 前端列表交互机制统一架构（单一选择内核/快捷键/框选 preventDefault 协议 + SelectableTable 表格唯一入口 + BatchActionBar） |
| [0053](0053-vip0-system-tier-guard.md) | `accepted` | 0053 — VIP0 系统固有等级治理（不可创建/下架/删除，仅权益配置可编辑；后端守卫 + 前端 UI 保护；`GET /vip/tiers` 恒含 level 0） |
| [0054](0054-cross-project-transfer-matrix.md) | `accepted` | 0054 — 跨项目转移 6 域模式矩阵（出向/入向×项目/个人空间/库四态 + PROJECT_TRANSFER_MANAGE；库 API 透传 userId 方案 B；配额修正） |
| [0055](0055-log-monitoring-ops.md) | `accepted` | 0055 — 日志监控运维方案（日志落盘/访问日志/脱敏、告警分级邮件外发、Prometheus+Loki+Grafana 采集端、备份自动化、审计归档防篡改、清理可观测、trace 透传；等保三级合规） |
| [0056](0056-deployment-runtime-packager-modularization.md) | `accepted` | 0056 — 离线部署运行时与打包工具工程化（双包架构 runtime-cli/packager + 两步迁移 + 前台真修复 + 入口双 facade + 分层测试策略） |
| [0057](0057-history-version-access-permissions.md) | `accepted` | 0057 — 历史版本访问的权限与限频模型（游客 401 / 登录用户窗口限频 / 分享放行不限频；分享+v 口子有意不封堵，理由：缓存兜底 + 滥用面有限） |
| [0058](0058-conversion-queue-monitoring.md) | `accepted` | 0058 — 转换队列监控（Conversion Queue Monitoring） |
| [0059](0059-runtime-deps-release-bundle-and-airgap-verify.md) | `accepted` | 0059 — runtime 依赖 Release 复用（内容寻址资产）+ 发行版收敛 3 档 + dev preinstall 按需拉标准组件 + 断网启动验证成 release 硬门禁 + 下载源多源有序回退（双形态 + 内置公开镜像 + 自定义源；不破坏离线部署自包含红线） |
| [0060](0060-conversion-concurrency-and-caching.md) | `accepted` | 0060 — 转换并发与缓存策略（孤儿进程泄漏根因止血 + 进程组杀除 + 启动清理 + 三条 mxcadassembly 路径收进同一限流器 + 批量路径复用结果缓存 + 批量并行度削峰；否决 in-flight 去重/调大超时/同步改异步，含「3 并发=3 不同格式故去重无效」「60s 非根因是 CPU 饥饿」洞察） |
| [0061](0061-project-member-self-role-protection.md) | `accepted` | 0061 — 项目成员自改角色 / 自移除保护（Project member self-role protection） |
| [0062](0062-mobile-app-shell-architecture.md) | `accepted` | 0062 — 移动端 App 壳架构：常驻 CAD 编辑器 + 子页栈（微信式导航） |
| [0063](0063-external-reference-file-naming-convention.md) | `accepted` | 0063 — 外部参照文件磁盘命名约定 |
| [0064](0064-conversion-service-http-param-contract.md) | `accepted` | 0064 — conversion-service 两级参数契约：HTTP 用 camelCase，低层二进制用 lowercase |
| [0065](0065-conversion-queue-panel-ux.md) | `accepted` | 0065 — 转换队列悬浮面板 UX —— 常驻按钮 + 数据管道接通 + 自动展开/收起 |
| [0066](0066-exe-auto-order-purchase.md) | `accepted` | 0066 — EXE 桌面端自动下单购买流程（`/member-center?auto=1` + `POST /orders/auto` + 双层限流防刷单） |
| [0067](0067-file-queue-panel-and-retry.md) | `accepted` | 0067 — 文件队列：取消悬浮药丸 + 入口迁移顶栏按钮/CAD 命令 + 删除永久失败机制 + 失败重试端点 + 配额可见 + 行内 Tooltip |
| [0068](0068-mobile-native-member-center.md) | `accepted` | 0068 — 移动端原生会员中心：购买/续费/升级/微信支付/订单/退款全在移动端完成（后端 billing/vip 零改动，交易类型按 UA 分流 MWEB/NATIVE，MWEB 回跳靠 localStorage 恢复） |
| [0069](0069-mxcad-engine-contract-and-contracts-purity.md) | `accepted` | 0069 — mxcad 两级参数契约收进 @cloudcad/contracts（唯一 builder/parser + CONTENT_KEY_FIELDS 派生 + ConversionTask 判别联合删 printToPdf）+ contracts 纯函数式契约准入四条与纯度门禁 |

| [0070](0070-platform-package-and-pc-mobile-url-interop.md) | `accepted` | 0070 — `@cloudcad/platform` 跨端公共层（准入四条：纯函数/不绑框架/不绑端/重复已成立）+ PC↔移动端 URL 互通走「语义等价 + 双向翻译层」（映射表单一事实源、两端参数名同名铁律、移动端 URL 形态固定 `base?query#path`）+ 双向逃生入口 + 消灭整页重载 + 守卫异步刷新 |
| [0071](0071-ops-center-on-config-service.md) | `accepted` | 0071 — 运维中心建在 config-service（部署全程存活的唯一长任务宿主 + require 复用 CLI 命令函数 + 后台 job/落盘/轮询；否决 backend+React 方案的「部署中途自停」死穴；删 admin123 回退；排障菜单项按部署形态门控） |
| [0072](0072-admin-password-recovery-channel.md) | `accepted` | 0072 — 管理员密码恢复走带外运维 CLI（`admin:reset-password` 与 `mfa:totp-unbind` 同构；信任边界=部署机 shell 权限，否决 HTTP 应急端点与「永远在线的免密改密面」；重置即全量撤销会话同事务提交；刻意不清 Redis session、不校验弱口令黑名单；新增 `AuditAction.ADMIN_PASSWORD_RESET` 需迁移，迁移未应用时重置仍成功仅审计告警；补 `cloudcad.bat` 的 `%*` 透传；兑现部署说明里落空的「密码向导」承诺） |
| [0073](0073-infra-password-reset-ledger-consistency.md) | `accepted` | 0073 — 数据库 / Redis 密码重置走同一条带外运维通道（`db:reset-password` / `redis:reset-password`），核心安全性质=**先用新密码验证成功才允许写 `.env`**（防服务端与账本分叉，验证失败尽力回滚并大声报错）；嵌入式 PG 全仓库 `-A trust` 且从未写过 `pg_hba.conf`，故本轮只做账本一致、**刻意不在重置命令里加 pg_hba 硬加固**（逃生舱不得依赖正在被重置的门禁，单独排票）；`DB_PASSWORD` 与 `DATABASE_URL` 成对写；Redis 改密走裸 RESP 不留进程列表痕迹、`AUTH`+`CONFIG REWRITE` 同请求；ADR-0071 收尾=3002 两条旧路由改薄壳并加源码扫描断言防双轨回归；`psql`/审计写入收敛进 `lib/psql.js` 唯一出口 |

| [0077](0077-security-profile-batch-apply-reuses-runtime-priority-chain.md) | `accepted` | 0077 — 安全模式/普通模式 profile 切换**不引入新优先级层、不改 schema**：应用 = 批量写 `value` 并记 `updatedBy`，回退 = 逐项写回 `def.defaultValue` + 清 `updatedBy`（**不可写 `value:null`**，会让 `parseValue` 抛错）；env 保持中间层非终态（改 `.env` 须同时重置对应 key）；`RUNTIME_CONFIG_DEFINITIONS` 的 69 个 key 零改造；代价=无法从单条记录区分 profile 写入与手工写入，「当前模式」须由 UI 自带权威来源；D4=一次切换必须单事务（现有 `reset-category` 循环调用无事务、半成功不可回滚）；**D5=覆盖用户已手改的值**（否决「跳过手改项」：被跳过的偏离项会变成静默违规，即界面显示已切安全模式而弱值继续生效；改用影响面预览 + `runtime_config_logs` 前值 + `audit_logs` 三条可追溯手段兜底，明确不做跨 69 个异构 key 的通用严格度比较器）；加严的退出路径必须比加严本身便宜 |
| [0079](0079-audit-evidence-chain-scope-for-secure-mode.md) | `accepted` | 0079 — 安全模式审计证据链范围：为让「当前处于合规配置」可自证，**只做两件事**——①新增 CONFIG 类 `AuditAction` 让配置变更进 `audit_logs`（现状 `runtime-config.controller.ts` 零 Audit、枚举无 CONFIG 类；替代表 `runtime_config_logs` 无 `success`/`userAgent`/哈希链可删改）②`mlps3-drill.sh` 改读 `runtime_configs` 实际生效值（**现状只读 `.env` 裸值=假阳性**：env 写 true、后台被改 false 仍报 ✅，比不报更危险）。**明确不做**「强制全量审计」：容量未核算（`FILE_*` 每编辑动作一条、随在线编辑线性增长）、写入是热路径同步 `await` 无异步退路；且「安全模式无全量审计」易被读成缺陷，故把延期理由写成 ADR。硬约束=`AuditLogService.log()` 无条件写库全仓无总开关，`HIGH_FREQUENCY_READ_ACTIONS` 硬编码丢弃仅 `success===true` 的登录/上传/下载（失败保留），故全量审计**无法配置化**必须改代码。缺口 2/3/4（补字段、现值纳入哈希链、配置基线快照）单独排票。因 T17 选 A（弱断言）本 ADR 的两件事从可选升为刚需 |
| [0078](0078-variant-stays-pack-time-no-runtime-equivalent.md) | `accepted` | 0078 — `variant=private|oss` 保持 ADR-0075 的**打包期**语义，不造运行时等价物：子票 T14（私有部署默认放开免费导出）的前提「运行时知道自己是私有变体」不成立，按「管理员手工开关」优雅降级且默认仍关闭；关键事实=private 包为公司内部私人包、不对外交付，故 variant 打包期即终局、不存在交付后形态可变的需求面；打包脚本/config center/增量升级包三处零改动（增量升级包按 variant 出包，运行时可变 variant 会让升级 key 产生二义）；与 ADR-0077 对照=形态进打包期、模式进运行时，两者都不进 DDL |
| [0074](0074-docker-oneclick-deploy-half-containerization.md) | `proposed` | 0074 — Docker 一键部署包半容器化：宿主只留 mxcadAssembly 折叠的协同服务 + conversion-service + config-service 运维中心（零反向依赖已核实，升级窗口全程存活；PM2 一律不用），容器只 3 个（pg / redis / app 双进程），全 `network_mode: host` 使 `.env` 端口直接生效；挂载一律「宿主绝对路径 = 容器绝对路径」以让宿主引擎能读容器算出的 `srcPath`；单一 `.env`（不新增配置文件，复用 `fillEmptySecrets` / `mergeExampleIntoEnv`）；Redis 与裸机对齐不设 maxmemory（修旧 compose LRU 驱逐转换队列缺陷）；app 镜像装 postgresql-client 保住备份通道；Docker 静态二进制 20.10.24 + compose v2 自装，**无 root 即硬失败不降级裸机形态**；升级 = 同目录覆盖 + start.sh 自动识别；SystemLib 由构建期按发行版替换改为运行时 `1.dwg` 探针失败再替换（探针走 `@cloudcad/engine-exec` 唯一出口、判据只认 JSON `code` 不按退出码） |
| [0080](0080-notice-presentation-tiering-and-ack-viewed-split.md) | `accepted` | 0080 — 通知呈现分级 + 常驻横幅改铃铛下拉 + ack/viewed 双簿记：按 `level` 三级分流（`danger` 模态 / `warning` 可点 toast → 打开列表 / `info` 只进列表不主动打扰），呈现**入口**由 `useCADEditorStore.isActive` 决定（普通页 = 无遮罩 Popover 下拉、CAD 编辑器 = Modal，因 CAD 路由渲染 `<></>` 且 `CADEditorDirect` 是 `fixed inset-0` 覆盖层、header 不可达）；`warning` toast 带 `forceOverlay` 旁路 `routeToCadMessage`（CAD 消息条不可点，路由过去会让「点 toast 看列表」失效）；`PopoverTrigger` 不用 `asChild`（项目 `Button` 未 `forwardRef`，Radix 拿不到定位 ref），故 `Tooltip` 在外（`Tooltip` 不 clone children，反向不安全）；**ack 与 viewed 必须双簿记**——ack 带 24h TTL（停机公告跨天要再提醒，刻意）而 viewed 无 TTL（用户点开看过，红点不该 24h 后复亮），复用同一套会让二者语义互相污染；两套都按 `<ownerId>` 分键；`pruneViewed` 在 `validIds.size===0` 时直接返回原值（首屏未拉回数据时按「全消失」清理会抹掉已读、红点集体复亮）；长内容用滚动（下拉 420/CAD 弹框 480）不做「展开更多」两段式；删除=硬删不可恢复 + `AuditAction.NOTICE_DELETE`/`ResourceType.NOTICE` 审计留痕，下线=软删可重发，二者并存不合并语义；`POST /notices/batch-delete` 须声明在 `@Post(':id/...')` 之前否则被 `:id` 吃掉；状态筛选纯前端（`deriveNoticeStatus` 复用）；migration `20261020000000_add_notice_audit_enum` 只 `ADD VALUE` 在线变更。**已知未做**：移动端 `NoticeDialog.vue` 仍对所有未 ack 公告（含 `info`）弹模态且无列表页/菜单入口，属独立工作项；`NOTICE_STATUS_LABELS` 的值以变量形式传 `t()` 故 i18n 无法静态提取（既有行为未改） |
| [0082](0082-channel-credentials-in-runtime-config-with-verification-gate.md) | `accepted` | 0082 — 通道凭据进运行时配置（加密落库 + 掩码回读 + 验证门禁 + 依赖联动），env 降级为部署期默认层：五个面向用户通道（邮件/短信/微信/支付/告警）的配置含凭据可在管理 UI 填写；env-only 边界 = 启动期必需 + 主密钥 + 进程间共享密钥（末类是兄弟进程架构硬约束）；活回落否决一次性播种（「改 .env 静默不生效」升级陷阱）；通道主密钥 `CHANNEL_ENCRYPTION_KEY` 新增（与 PII 密钥同样式，否决复用 PII 密钥与分通道密钥）；通道开关须「配置完整 + 通道测试通过」才可开启（硬阻断无绕过，验证随配置变更失效，测试动作入审计）；`requires` 依赖声明（补上 `alertEmailEnabled→mailEnabled` 缺失边），开启自动开启（通道自身门禁仍生效）、关闭拒绝（否决静默偏离与静默不生效）；机制扩展现有运行时配置体系不新建子系统；支付证书路径留 env；分期 = 机制+邮件先行；等保 = 加密落库 + SYSTEM_CONFIG_WRITE + 测试动作审计 + 掩码可见 |
| [0081](0081-intent-chain-for-blocked-editor-actions.md) | `accepted` | 0081 — 意图链：编辑器动作被前置阻塞后跨登录中断可恢复。触发=`Mx_Share` 缺云端节点只弹无出口 toast「请先保存到云端后再分享」；根因是三个既有机制各自成立却没串起来——登录闸门只能挡不能恢复、另存为成功后不回写会话、编辑器重建有严格时序。**根因缺口**：`handleSaveAsSuccess` 上传完只问「是否开新标签」，全仓 `setCurrentFileInfo` 仅 `openSession`/reset 三处，故本地文档另存为建新节点后当前编辑器 `currentFileId` 仍为空串、重跑 `Mx_Share` 必再失败——链路在现状下数学上走不完。D1 命名「意图链」声明式、与单向的登录闸门划上下游；D2 前置仅 `auth` 与 `cloud-existence` 且**非因果关系**（登录用户游客模式新建图纸缺的是云端节点不是登录态），判定先 `auth`；**明确不做**协同 `local` 降级救援、导出配额门控合并；D3 载体 sessionStorage 单键 + 纯状态机进 `@cloudcad/platform`（存储走依赖注入 port，遵守该包「吃参数不读全局存储」纪律），否决 hash（与 ADR-0070 移动端 `base?query#path` 形态冲突）与 `ttl` 字段（session 生命周期已是过期语义）；D4 续跑锚点 `document-loaded` 挂 `useFileOpenGuard`（`reloadCurrentFile`→`waitForDocumentLoaded`），否决挂 Login 页；D5 失败不回滚但保留原始意图、**不自动重试**；**D6 本地文档会话回填**=唯一改变用户可见行为的决策，回填不重开文档（另存为上传的就是当前 blob），硬约束=只加在另存为成功回调的**链分支**内不改全局「另存为=建议开新标签」语义，顺带修正原提示语对本地文档的语义错误；D7 复用 `useLoginGate.requireLogin` 不新建组件；D8 重跑不二次确认。测试三层=platform 纯状态机单测为主 + 两端 adapter 只断言副作用 + 链路冒烟手动验（不进 CI）。三层影响：后端/DB/SDK 全零改动无 migration，PC 与移动端分两个 PR |

## 规则

- 新 ADR 编号 = 当前最大编号 + 1；被取代的决策在原 ADR 中标注 `**Status**: superseded by ADR-NNNN`。
- 决策记录规范见 `docs/adr/0048-documentation-governance.md` 与 domain-modeling 技能。
