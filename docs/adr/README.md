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
| [0066](0066-exe-auto-order-purchase.md) | `accepted` | 0066 — EXE 桌面端自动下单购买流程（`/member-center?auto=1` + `POST /orders/auto` + 双层限流防刷单） |
| [0067](0067-file-queue-panel-and-retry.md) | `accepted` | 0067 — 文件队列：取消悬浮药丸 + 入口迁移顶栏按钮/CAD 命令 + 删除永久失败机制 + 失败重试端点 + 配额可见 + 行内 Tooltip |
| [0068](0068-mobile-native-member-center.md) | `accepted` | 0068 — 移动端原生会员中心：购买/续费/升级/微信支付/订单/退款全在移动端完成（后端 billing/vip 零改动，交易类型按 UA 分流 MWEB/NATIVE，MWEB 回跳靠 localStorage 恢复） |

## 规则

- 新 ADR 编号 = 当前最大编号 + 1；被取代的决策在原 ADR 中标注 `**Status**: superseded by ADR-NNNN`。
- 决策记录规范见 `docs/adr/0048-documentation-governance.md` 与 domain-modeling 技能。
