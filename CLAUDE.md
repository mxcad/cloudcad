# CLAUDE.md

使用中文对话和思考。

实现功能前先陈述所有假设和可能的解释，选择一种并说明理由，等待确认。

## GitNexus

此项目已注册 GitNexus 为 **cloudcad**。编辑符号前使用 `gitnexus_impact()`，提交前使用 `gitnexus_detect_changes()`。

## Architecture Decision Records

见 `docs/adr/`（完整索引与状态见 `docs/adr/README.md`）：
- **0001** — Merged conversion-engine into backend
- **0002** — Decoupled file-operations; FileSystemService is now a Façade
- **0003** — IPermissionStore strategy pattern (eliminates circular deps)
- **0004** — Frontend CSS z-index layering system
- **0005** — mxcadManager Command pattern
- **0006** — IAuthProvider strategy pattern for OSS/Pro/TOB
- **0007** — Three-layer constrained dependency architecture
- **0008** — Incremental strictNullChecks enablement
- **0009** — OwnershipStrategy 收拢 Project/PersonalSpace/Library 三路分支
- **0010** — FileSystemNode 保持单表不拆分
- **0011** — 保存流程 per-save backup + auto-restore 保证原子性
- **0012** — 缓存架构简化：移除 L3 数据库缓存层
- **0013** — 可观测性：pino + Prometheus RED + Sentry
- **0014** — 转换引擎独立为函数工作流服务
- **0015** — Storage service 与 SVN-colocated 分片
- **0016** — 渐进式部署：embedded / standalone / cloud FaaS
- **0017** — VIP 等级 + 键值对配额配置系统
- **0018** — 旧官网用户同步私有认证方案（机制①反例，已重构为 USER_SYNC_HOOK）
- **0019** — 私有包分包架构（@cloudcad/* + IMPL 加载机制）
- **0020** — 扩展点 vs 内部服务：接口抽象边界规则
- **0021** — Contracts 与 Impl 的分界约定
- **0022** — 图纸版本部署轻量验证方案
- **0023** — External-ref 模块本地 facade token
- **0024** — 外部参照文件存储与路径的 mxcad 引擎耦合约束
- **0025** — VIP 升级按价差折算延期
- **0026** — 扩展机制总纲：三类扩展判断 + 类型获取 + 契约先行 + 六场景验收 + AI 探针（**新增扩展点前必读**）
- **0027** — @cloudcad/db 共享 Prisma Client：schema 单一源 + 数据层类型唯一来源
- **0028** — 前端依赖分层与 depcruise 门禁
- **0029** — 前端模块入口 Façade
- **0030** — 前端状态归属规则
- **0031** — 前端可替换与扩展点选型规则（默认不抽象、配置优先，ADR-0026 三选一不适用于前端）
- **0032** — 前端样式统一规范（变量 token 唯一事实源 + CSS Modules + Tailwind 仅布局 + 模板 CSS 判死 + z-index 门禁）
- **0033** — 前端巨型文件拆分契约（400 行硬门禁 / 300 行软目标，页面目录化 + hook 组合式）
- **0034** — 前端直连 fetch 治理（收编 SDK + 4 项豁免清单 + no-restricted-globals 门禁）
- **0035** — 图纸摄入模块（Drawing Ingest deep module）
- **0036** — 会员状态读侧权威（Membership read authority）
- **0037** — 节点变更守卫（Node Mutation Guard）
- **0038** — 批量下载任务状态机（Batch Download Job）
- **0039** — 图纸会话模块（Drawing Session）
- **0040** — ExportModals 弹出系统重构
- **0041** — EXE 客户端 VIP 购买流程（设备码 + 授权重定向）
- **0042** — C 端（TOC）启动边界与功能开关灰度
- **0043** — 转换频率限制（基于会员等级每日转换次数）
- **0044** — IP 黑名单（应用层分布式 + 自动解封预研）
- **0045** — 审计日志重构（双层图 + 高价值动作清单 + 最终可读性）
- **0046** — 离线增量升级包（压缩产物 + 固定交付制品 + 条件性全量 store）
- **0047** — 会员等级配置注册表共享模块（原 0022-tier 重编号，0022 编号冲突已解决）
- **0048** — 文档治理（docs 三分类 + archive 规范 + ADR 状态模型）
- **0049** — 外部参照操作权限（写=CAD_EXTERNAL_REFERENCE、读=FILE_OPEN、移动端范围）
- **0050** — 前端滚动分页统一控制器（useScrollPagination + mergeNodesByMode）
- **0051** — 项目角色模板化与项目自治（创建时复制模板；私人空间/公开资源库零角色；OWNER 数据驱动保护；删除降级 + 删光自愈自动重建默认成员角色）
- **0052** — 前端列表交互机制统一架构（单一选择内核 useFileBrowserSelection / 单一快捷键 useSelectionShortcuts 超集 / 框选 preventDefault 协议 / SelectableTable 表格唯一入口 / BatchActionBar；新列表页禁止手写接线）
- **0053** — VIP0 系统固有等级治理（不可创建/下架/删除，仅权益配置可编辑；后端守卫 + 前端 UI 保护；`GET /vip/tiers` 恒含 level 0）
- **0054** — 跨项目转移 6 域模式矩阵（出向/入向×项目/个人空间/库四态 + PROJECT_TRANSFER_MANAGE 专属权限；库 API 透传 userId 方案 B；目标归属校验 + 配额修正）

## 项目信息

所有项目信息（包总览、命令、陷阱、规范、工作流）请查阅 **`AGENTS.md`**。领域术语请查阅 **`CONTEXT.md`** / **`CONTEXT-MAP.md`**。

## Issues

Issues 在 GitHub Issues 中跟踪。参见 `docs/agents/issue-tracker.md`。
