# Issue 编号映射（GitHub → Gitea）

2026-10-12 由 GitHub mxcad/cloudcad 全量迁移生成：共 428 个 issue（86 open / 342 closed）。

每个迁移后的 Gitea issue body 头部带 `> **从 GitHub 迁移**：原 GitHub issue #N` 标记，可反向核对。
代码注释 / ADR / 旧 issue 正文里引用的 GitHub 编号，用本表换算成 Gitea 编号后再操作。

## 全部映射

| GitHub # | Gitea # | 状态 | 标题 |
|---|---|---|---|
| 44 | 1 | closed | Map: 批量下载 + 文件夹下载为 ZIP |
| 45 | 2 | closed | 异步批量下载后端方案设计 |
| 46 | 3 | closed | BullMQ NestJS 集成调研 |
| 47 | 4 | closed | 前端批量下载 UX 设计 |
| 48 | 5 | closed | 文件夹 ZIP 下载改进方案 |
| 49 | 6 | closed | PRD: 批量下载 + 文件夹下载为 ZIP |
| 50 | 7 | closed | Ticket 1: 后端基础 + API 端点 |
| 51 | 8 | closed | Ticket 2: Worker 真实文件处理 |
| 52 | 9 | closed | Ticket 3: 前端批量下载全流程 |
| 53 | 10 | closed | Ticket 4: 文件夹树形弹窗下载 |
| 54 | 11 | closed | Ticket 5: 逐个下载模式 |
| 55 | 12 | closed | Ticket 6: 清理 + 收尾 |
| 56 | 13 | closed | 后端: 扩展外部参照数据接口，返回文件大小/类型信息 |
| 57 | 14 | closed | 后端: 新增替换外部参照 API（支持非同名文件上传） |
| 58 | 15 | closed | 前端: 实现外部参照管理面板组件并集成 |
| 59 | 16 | closed | Map: 权限系统全面审计与规范整合 |
| 60 | 17 | closed | 绘制全量权限拦截点地图 |
| 61 | 18 | closed | 定位 PROJECT_UPDATE 拦截漏洞根因 |
| 62 | 19 | closed | 定位 FILE_DOWNLOAD 拦截链路漏洞 |
| 63 | 20 | closed | 复盘 permission-audit.md 审计报告落实情况 |
| 64 | 21 | closed | 审计权限文档与当前代码实现一致性 |
| 65 | 22 | closed | 评估死代码清理：RolePermissionsMapper |
| 66 | 23 | closed | 定义 VIEWER 下载权限边界与修复方案 |
| 67 | 24 | closed | 设计权限总览 UI 方案 |
| 68 | 25 | closed | 迁移 RolePermissionsMapper 到 RoleInheritanceService |
| 69 | 26 | closed | ThumbnailController 添加 Guard 防止公开写入 |
| 70 | 27 | closed | 定义格式导出权限边界 |
| 71 | 28 | closed | 修复权限文档与代码一致性 |
| 72 | 29 | closed | CacheMonitorController 添加认证和权限 Guard |
| 73 | 30 | closed | 决定 PROJECT_UPDATE 修复方案 |
| 74 | 31 | closed | 整合权限统一规范文档并淘汰冗余 |
| 75 | 32 | closed | 移动端图纸库与图块库浏览界面 — 实现规格说明 |
| 76 | 33 | closed | LibraryPanel 组件架构与数据流设计 |
| 77 | 34 | closed | 移动端分类级联选择器 UI |
| 78 | 35 | closed | 网格视图 + 无限滚动 + 搜索方案 |
| 79 | 36 | closed | 菜单注册与 FloatingPopup 集成流程 |
| 80 | 37 | closed | 长按预览 + 单击操作交互设计 |
| 81 | 38 | closed | Mx_Insert 图块插入命令集成 |
| 82 | 39 | closed | 重构 IAuthProvider 为可替换认证插件体系 |
| 83 | 40 | closed | 修复 mxVersionTool 命令注入漏洞（10 个文件） |
| 84 | 41 | closed | 拆分 Config Service server.js（1636 行）为多文件结构 |
| 85 | 42 | closed | OwnershipStrategy 收拢 Project/PersonalSpace/Library 三路分支 |
| 86 | 43 | closed | OAuth 2.0 设备授权流（Device Authorization Flow）支持 EXE 登录 |
| 87 | 44 | closed | Ticket 1 — Prefactor: RuntimeConfig + DTO + Redis key 常量 |
| 88 | 45 | closed | Ticket 2 — 后端: 设备码生成 + 授权确认 |
| 89 | 46 | closed | Ticket 3 — 后端: Token 签发 + 轮询端点 |
| 90 | 47 | closed | Ticket 4 — 前端: /device 授权确认页 |
| 91 | 48 | closed | 权限服务接口化 -- PermissionService / ProjectPermissionService / FileSystemPermissionService |
| 92 | 49 | closed | 缓存架构简化 -- 移除 L3 数据库缓存层 |
| 93 | 50 | closed | 搜索体验改进 -- 语法发现与 UI 打通（chip 标签 + 搜索框联动） |
| 94 | 51 | closed | 搜索性能优化 -- pg_trgm 索引加速 ILIKE/中文搜索 |
| 95 | 52 | closed | 可观测性：结构化日志 — nestjs-pino + CLS traceId |
| 96 | 53 | closed | 可观测性：Prometheus RED 指标端点 |
| 97 | 54 | closed | 可观测性：Sentry 后端错误上报 |
| 98 | 55 | closed | 可观测性：Sentry 前端错误上报 |
| 99 | 56 | closed | i18n: 修复 DTO 装饰器中 I18nContext.current() 非请求时求值问题 |
| 100 | 57 | closed | i18n: CustomValidationPipe 添加国际化支持 |
| 101 | 58 | closed | i18n: 补全 PrismaExceptionFilter 的翻译覆盖 |
| 102 | 59 | closed | i18n: 创建移动端 AGENTS.md 文档 |
| 103 | 60 | closed | i18n: 添加前端僵尸翻译条目清理流程规范 |
| 104 | 61 | closed | API 契约：删除单端 SDK 生成命令，防止移动端 SDK 过期 |
| 105 | 62 | closed | 测试: 集成测试加入 CI 流程 |
| 106 | 63 | closed | 测试: 添加移动端测试基础设施 (Vitest) |
| 107 | 64 | closed | 测试: 前端 Playwright E2E 加入 CI |
| 108 | 65 | closed | 测试: 测试代码 strictNullChecks 与生产对齐 |
| 109 | 66 | closed | 测试: 补 version-control 模块单元测试 |
| 110 | 67 | closed | T1 — Prefactor: Create seam for private auth module |
| 111 | 68 | closed | T2 — Create private auth-impl package and wire forRoot to try-catch require |
| 112 | 69 | closed | T3 — Clean up old directories and add .gitignore |
| 113 | 70 | closed | Define IFunctionExecutor and IStorageProvider interfaces with embedded implementations |
| 114 | 71 | closed | Formalize URL cache busting with t/v parameters |
| 115 | 72 | closed | Multi-level priority queues for conversion tasks |
| 116 | 73 | closed | Storage service (standalone deployment mode) |
| 117 | 74 | closed | Cloud FaaS adapters (Huawei FunctionGraph / Alibaba FC / AWS Lambda) |
| 118 | 75 | closed | Function workflow service (standalone deployment mode) |
| 119 | 76 | closed | Presigned upload token flow for standalone storage service |
| 120 | 77 | closed | Storage service directory-group sharding and routing |
| 121 | 78 | closed | L3 in-memory LRU cache and L2 Nginx cache configuration |
| 122 | 79 | closed | SVN version history proxy through storage service |
| 123 | 80 | closed | Cross-node batch download streaming ZIP |
| 124 | 81 | closed | Deployment templates for all three operating modes |
| 125 | 82 | closed | PRD: Three-mode function workflow & storage architecture for elastic drawing conversion |
| 126 | 83 | closed | auth-impl 私有包运行时路径解析问题 |
| 127 | 84 | closed | 可替换认证模块架构：契约包 @cloudcad/contracts + 多实现体系 |
| 128 | 85 | closed | T1 — 新增 VipTier + DurationPricing + ConfigKeyRegistry 领域模型 |
| 129 | 86 | closed | T2 — UserMembership 迁移至 tierLevel 整数 |
| 130 | 87 | closed | T3 — 支付流程改用VipTier + DurationPricing正交计价 |
| 131 | 88 | closed | T4 — 额度守卫QuotaEnforcementService + 项目大小缓存 + 日转换次数 |
| 132 | 89 | closed | T5 — 契约：删除MembershipPlan + storageQuota |
| 133 | 90 | closed | Map: 旧官网用户同步到 CloudCAD（私有认证） |
| 134 | 91 | closed | T1 — 旧官网 API 契约调研 |
| 135 | 92 | closed | T2 — 登录认证代理流程设计 |
| 136 | 93 | closed | T3 — VIP 映射规则设计 |
| 137 | 94 | closed | Map: VIP 权限限制架构（策略管道） |
| 138 | 95 | closed | T1 — 策略管道核心接口设计 |
| 139 | 96 | closed | T2 — 配置键的 JSON Schema 与 ConfigKeyRegistry 运行时角色 |
| 140 | 97 | closed | T3 — 接入策略点枚举（Controller/Service 清单） |
| 141 | 98 | closed | Spec: 旧官网用户同步到 CloudCAD 私有认证 |
| 142 | 99 | closed | T4 — Implement RestrictionEngine + 3 Quota Strategies |
| 143 | 100 | closed | T5 — Integration: upload/save endpoints |
| 144 | 101 | closed | T6 — Integration: conversion quota & project creation |
| 145 | 102 | closed | [弹性转换] Slice 1: 接口抽象与嵌入式重构 |
| 146 | 103 | closed | [弹性转换] Slice 2: 异步转换端点（嵌入式模式） |
| 147 | 104 | closed | [弹性转换] Slice 3: Function Workflow 独立服务 |
| 148 | 105 | closed | [弹性转换] Slice 4: Storage 独立服务 |
| 149 | 106 | closed | [弹性转换] Slice 5: Cloud FaaS 适配器 |
| 150 | 107 | closed | [弹性转换] Slice 6: SVN 代理与跨节点批下载 |
| 151 | 108 | closed | [弹性转换] Slice 7: L2/L3 缓存层 |
| 152 | 109 | closed | [弹性转换] Slice 8: 部署模板与迁移指南 |
| 153 | 110 | closed | Map: ESA 缓存策略决策 + 后端适配方案 |
| 154 | 111 | closed | Research: ESA 缓存规则机制调研 |
| 155 | 112 | closed | Research: 后端当前缓存头现状审计 |
| 156 | 113 | closed | Decision: mxweb 文件 ESA 缓存策略 |
| 157 | 114 | closed | Decision: 缩略图 ESA 缓存策略与后端改造 |
| 158 | 115 | closed | Decision: 协同服务 ESA 兼容性确认 |
| 159 | 116 | closed | Decision: 前端静态资源 ESA 缓存策略确认 |
| 160 | 117 | closed | Map: ADR-0017 Contract Phase — 清理旧存储配额系统 |
| 161 | 118 | closed | StorageInfoService 改读 VipTier.configs + GET /quota 保留仅个人空间 |
| 162 | 119 | closed | 删除 UserQuotaModal 和 useLibraryQuota |
| 163 | 120 | closed | NestJS DI module graph compile-time check |
| 164 | 121 | closed | 认证实现边界：单点维护 vs 源码闭源 |
| 165 | 122 | closed | 调研：开源认证源码的真实风险面 |
| 166 | 123 | closed | 调研：当前 impl-mx 的真私有面实测 |
| 167 | 124 | closed | 产品：OSS 自部署用户对开箱认证的需求 |
| 168 | 125 | closed | 决策：认证边界 A/B/C 分叉 |
| 169 | 126 | closed | 落地：认证单点收敛 + impl-mx 覆盖层瘦身 |
| 170 | 127 | closed | Map: 认证安全硬控制（统一错误消息/限流/常量时间/密钥治理/MFA） |
| 171 | 128 | closed | Map: AI 编程项目架构地基（扩展机制总纲 + @cloudcad/db） |
| 172 | 129 | closed | [research] Prisma 7 monorepo 共享 client 最佳实践 |
| 173 | 130 | closed | [grilling] 总纲 ADR 0026《扩展机制总纲》内容定稿 |
| 174 | 131 | closed | [grilling/task] @cloudcad/db 建包 + 替换 IDatabaseService + 清 impl-mx + 0027 ADR |
| 175 | 132 | closed | [task] 规则文件三处 + 两 skill 落地 |
| 176 | 133 | closed | 前端 AI 开发地基建设（对齐后端架构调整） |
| 177 | 134 | closed | 前端依赖分层与门禁 |
| 178 | 135 | closed | 前端状态管理归属规则 |
| 179 | 136 | closed | 前端可替换与扩展点选型规则 |
| 180 | 137 | closed | api-sdk 能力盘点：blob/文件流/FormData |
| 181 | 138 | closed | 死代码与重复实现清点 |
| 182 | 139 | closed | 前端样式统一规范 |
| 183 | 140 | closed | 移动端（frontend_mobile）地基范围 |
| 184 | 141 | closed | 巨型文件拆分契约 |
| 185 | 142 | closed | 直连 fetch 治理决策 |
| 186 | 143 | closed | 前端 Façade/模块入口规则 |
| 187 | 144 | closed | 地基文档与 ADR 落地 |
| 188 | 145 | closed | AI 探针验收 |
| 189 | 146 | closed | 前端依赖违反清理 |
| 190 | 147 | closed | Façade/模块入口执行：同名 hook 归位 + 孤儿 barrel 清理 |
| 191 | 148 | closed | 状态管理执行：僵尸 store 删除 + server 状态迁移 |
| 192 | 149 | closed | [task] 部署链路修复 — @cloudcad/db 迁移后的构建/打包/CI 全链路 |
| 193 | 150 | closed | 样式迁移执行：内联 style 收编 + 模板 CSS 消灭（LoginStyles 试点先行） |
| 194 | 151 | closed | 巨型文件拆分执行：FileIcons + useDirectoryImport 试点 |
| 195 | 152 | closed | fetch 收编执行：SDK 收编 + download util + 豁免门禁 |
| 196 | 153 | closed | 图纸摄入重构执行：DrawingIngestService 收敛上传/转换双管线 |
| 197 | 154 | closed | 会员状态读侧权威执行：MembershipService 收敛有效等级/配置推导 |
| 198 | 155 | closed | 节点变更校验执行：NodeMutationGuard 收敛变更不变量序列 |
| 199 | 156 | closed | 批量下载任务生命周期执行：BatchDownloadJob 收敛状态机与取消竞态 |
| 200 | 157 | closed | 图纸会话执行：DrawingSession 收敛打开图纸状态与事件 seam |
| 201 | 158 | closed | ExportModals 执行：useExportDrawing 收进自包含导出子系统 |
| 202 | 159 | closed | 前端测试修复：外部参照链路 5 文件失败（mxcadExtRef/useExternalReferenceUpload/ExternalReferenceModal/FileSystemManager） |
| 203 | 160 | closed | 前端测试修复：页面/MSW/react-query 5 文件失败（UserManagement/useUserCRUD/Login/useFileSystemCRUD/TourStartModal） |
| 204 | 161 | closed | 前端测试修复：mxcadManager DOM 与形状断言（mxcadCheck/mxcadThumbnail） |
| 205 | 162 | closed | IP 黑名单（后端）：schema + 权限点 + ip-blacklist 模块 + Guard + 管理 API（ADR-0044） |
| 206 | 163 | closed | IP 黑名单（前端）：管理页面 + 路由 + 导航 + MSW（ADR-0044） |
| 207 | 164 | closed | 审计日志重构：单表双视图 + 高价值动作清单 + 快照可读性 |
| 208 | 165 | closed | [P0] 告警基础设施：AlertRecord 表 + AlertService + 触发源接线 + 可选 Webhook |
| 209 | 166 | closed | [P0] 告警历史 UI：系统监控中心"告警历史"Tab |
| 210 | 167 | closed | [P1] 后台任务执行记录与控制（TaskRun + 开关补齐 + 手动触发） |
| 211 | 168 | closed | [P2] 后台任务 UI：系统监控中心"后台任务"Tab |
| 212 | 169 | closed | [P1] 转换队列监控：getQueueStats 接线 API + 监控中心卡片 |
| 213 | 170 | closed | [P1] /metrics 端点鉴权 |
| 214 | 171 | closed | [P3] K8s 探针：liveness/readiness/startupProbe（并入扩展高并发方案） |
| 215 | 172 | closed | 配额检查被 size 为 null 的 FILE 节点绕过（复制/粘贴/恢复增量算 0） |
| 216 | 173 | closed | 游客转换限制 code-review 遗留项：5 个问题处理完毕（黑盒前提推翻/拆分/耦合显式化） |
| 217 | 174 | closed | [P2] 缓存监控 UI：系统监控中心「缓存监控」Tab + CacheMonitorController 权限 Guard |
| 218 | 175 | closed | [BUG] logout 未清除 refresh_token cookie（path=/api/v1/auth/refresh 残留 7 天） |
| 219 | 176 | closed | [BUG] 双重全局 ValidationPipe 叠加：main.ts useGlobalPipes + APP_PIPE 每个请求体验证两次 |
| 220 | 177 | closed | [BUG] api-sdk 生成在 Windows 频繁失败（rimraf ENOTEMPTY，31 次失败记录） |
| 221 | 178 | closed | [BUG] 协同代理 /api/cooperate JWT 校验不完整：不查 type/黑名单/用户状态 |
| 222 | 179 | closed | [BUG] 策略配置变更后缓存不清除：clearCache() 空实现，旧策略最长 10 分钟仍生效 |
| 223 | 180 | closed | [BUG] 审计归档未实现：AUDIT_ARCHIVE_ENABLED=true 时日志仍被直接删除 |
| 224 | 181 | closed | refactor(vip): 用量聚合收敛为单一深 module StorageUsageService（架构审查候选 1） |
| 225 | 182 | closed | refactor(file-system): projectId 解析与子树遍历收敛为单一深 module TreeWalker（架构审查候选 2） |
| 226 | 183 | closed | refactor(mxcad): 摄入落盘编排抽内部深 module FileNodeMaterializer（架构审查候选 3） |
| 227 | 184 | closed | refactor(frontend): move/copy/undo action 三份重复收敛为纯函数构造器（架构审查候选 4） |
| 228 | 185 | closed | [架构] ownership 模块与 NodeMutationGuard 归属分派逻辑重复（#85 vs #198） |
| 229 | 186 | closed | refactor(frontend): ProjectDrawingsPanel 拆分 + 裸 API 收敛（架构审查候选 5 Step 1） |
| 230 | 187 | closed | refactor(frontend): FileBrowserCore 双文件浏览器内核合并（架构审查候选 5 Step 2 方向） |
| 231 | 188 | closed | refactor(vip): 会员到期数学归位 membership，billing 只做编排（架构审查候选 6） |
| 232 | 189 | closed | refactor(auth): 审计横切抽 @Audit 装饰器，门面回归纯转发（架构审查候选 7 重塑） |
| 233 | 190 | closed | Map: 架构地图总览 — 全量 OPEN issues 依赖关系与并发批次（#205-#232） |
| 234 | 191 | closed | [架构] 弹性存储迁移收尾：旧 storage（flydrive）体系双轨并行待合并（#113 contract 未执行） |
| 235 | 192 | closed | refactor(storage): 解剖 IStorageProvider_Elastic 缝合怪——文件 CRUD 与 SVN 按职责拆分（#234 决议） |
| 236 | 193 | closed | [命名] 弹性架构独立服务命名统一：function-workflow 名不副实，建议 conversion-service |
| 237 | 194 | closed | refactor(ownership): 合并归属分派进策略框架——guard 三分支迁入三策略，接口升级 action 粒度（#228 决议） |
| 238 | 195 | closed | fix(policy-engine): 实现 clearCache() pattern 删除——策略配置+评估缓存即时失效（#222 决议） |
| 239 | 196 | closed | fix(backend): 删除 main.ts 冗余 useGlobalPipes，全局 ValidationPipe 统一为 CustomValidationPipe（#219 决议） |
| 240 | 197 | closed | refactor(conversion-service): function-workflow 全量更名 conversion-service（#236 决议） |
| 241 | 198 | closed | Map: 告警基础设施（AlertRecord + AlertService + 触发源接线 + Webhook + 前端展示） |
| 242 | 199 | closed | 告警消息键规范与 AlertRecord 细节定案 |
| 243 | 200 | closed | 通用 Webhook 入站消息格式调研（钉钉/企微/飞书/Slack） |
| 244 | 201 | closed | AlertRecord 表 + AlertService 核心实现（去重/两态流转/单测） |
| 245 | 202 | closed | 触发源接线：磁盘 + 缓存 + 最小定时任务失败钩子 |
| 246 | 203 | closed | Webhook 适配器：条件启用 + 模板渲染 + 失败不阻断 |
| 247 | 204 | closed | 告警查询与手动解决 API（分页 + SYSTEM_MONITOR + SDK 重生成） |
| 248 | 205 | closed | SystemMonitorPage 告警展示（react-query + 轮询 + i18n） |
| 249 | 206 | closed | Map: #225 TreeWalker 重构实施地图（架构链龙头） |
| 250 | 207 | closed | wayfinder map: 解剖 IStorageProvider_Elastic 缝合怪（目的地 #235 落地） |
| 251 | 208 | closed | TreeWalker 核心落地（地基） |
| 252 | 209 | closed | decision(storage): 新存储接口命名与文件落点——token/接口/实现类归属 |
| 253 | 210 | closed | trash 域迁移至 TreeWalker |
| 254 | 211 | closed | guard/copy-move/project-crud 迁移至 TreeWalker |
| 255 | 212 | closed | mxcad 域迁移至 TreeWalker |
| 256 | 213 | closed | permission/library/search 迁移至 TreeWalker |
| 257 | 214 | closed | file-tree 内部迁移至 TreeWalker |
| 258 | 215 | closed | 收尾：删除旧树遍历实现 + 全量验证 |
| 259 | 216 | closed | getAllFilesUnderNode 改造：CTE 遍历 + 分页下推 + ANY 数组打包（#225 追加盘点） |
| 260 | 217 | closed | Map: 架构审查链实施地图（#224/#226/#229/#230/#231/#232/#237/#240） |
| 261 | 218 | closed | Map: 监控中心功能链（TaskRun 执行记录 + 后台任务 UI + 缓存监控 Tab） |
| 262 | 219 | closed | 项目角色管理权限模型：CRUD 迁移至项目权限 + 行为声明 |
| 263 | 220 | closed | [frontend] T1: Deepen save flow into saveCurrentFile deep module |
| 264 | 221 | closed | [frontend] T2: Unify permission checking into one module (pessimistic semantics) |
| 265 | 222 | closed | [frontend] T4: Fix auth dual-write register bug + unify wechat auth |
| 266 | 223 | closed | [frontend] T3: Collapse 6 move/copy orchestrations into one orchestrator |
| 267 | 224 | closed | [frontend] T5: Trash subdomain module + file system dead surface cleanup |
| 268 | 225 | closed | [frontend+backend] T6: Library real-format download + guard branch + batch delete unification |
| 269 | 226 | closed | [frontend] T7: Single notification interface (remove dead paths) |
| 270 | 227 | closed | [frontend] T8: Migrate NEW_FILE/PUBLIC_FILE_UPLOADED into typed bus |
| 271 | 228 | closed | task_runs 表保留期清理策略（无界增长治理） |
| 272 | 229 | closed | getAllFilesUnderNode 过滤路径参数上限残留（65535） |
| 273 | 230 | closed | storage 缝合怪拆除 T1：新接口落地 + 纯存储消费方迁移 |
| 274 | 231 | closed | storage 缝合怪拆除 T2：version-control 域归一 + storage-provider 并入 |
| 275 | 232 | closed | [frontend] Followup: split 4 files over ADR-0033 400-line limit |
| 276 | 233 | closed | Chore: add db.7z to .gitignore |
| 277 | 234 | closed | [frontend] Followup: collapse exportDXF/exportPDF re-export stubs |
| 278 | 235 | closed | [frontend] Followup: wire up useTrashView gate derivations (canRestore/canDelete) |
| 279 | 236 | closed | [frontend] Followup: defaultPermissions optimistic default in FileSystemContent |
| 280 | 237 | closed | [backend] Followup: fix test:permission script (--testPathPatterns typo) |
| 281 | 238 | closed | Coord: versionHistoryTotal already committed in be1f0c0b - version-history workline |
| 282 | 239 | open | Manual regression: wechat login full-scenario check before release |
| 283 | 240 | closed | FileBrowserCore 实施：无头 hooks 内核落地 + 两外壳适配（#230 方案 B） |
| 284 | 241 | closed | [test][backend] 协同 cooperate 集成测试（WebSocket 会话/事件/冲突/退出） |
| 285 | 242 | closed | [test][backend] 微信登录集成测试（三方回调/token 交换/绑定/双实例） |
| 286 | 243 | closed | [test][backend] 批量下载 batch-download 集成测试（任务→队列→转换→SSE→清理） |
| 287 | 244 | closed | [test][backend] 分享 share/public-file 集成测试（链接生成→访问→权限→过期） |
| 288 | 245 | closed | [test][backend] 图库 library 集成测试（浏览/引用/权限/配额链路） |
| 289 | 246 | closed | [test][backend] storage-quota-full 配额边界集成测试（打满/拒绝/清理/提示） |
| 290 | 247 | closed | [test][frontend] AdminBillingPage 计费/VIP 页面级测试（定价/支付回调/会员状态切换） |
| 291 | 248 | closed | [test][frontend] LibraryManager 图库页面级测试（浏览/搜索/引用/上传） |
| 292 | 249 | closed | [test][frontend] ShareManagePage 分享页面级测试（链接生成/复制/撤销/权限展示） |
| 293 | 250 | closed | [test][frontend] RoleManagement 角色管理页面级测试（角色树/权限勾选/保存同步） |
| 294 | 251 | closed | [test][frontend] 协同编辑 Playwright E2E（双会话开图/编辑/保存/退出） |
| 295 | 252 | closed | [test] 测试基础设施治理：默认命令语义分裂 + CI 重复跑集成 + docs 与实际不符 |
| 296 | 253 | closed | [test] 三层一致性契约门禁：CI 校验 SDK 生成后无破坏（AGENTS.md 铁律自动化） |
| 297 | 254 | closed | 收尾：项目角色双轨收口 + 权限迁移集成测试（#262 遗留） |
| 298 | 255 | closed | 角色双轨收口 T1：旧端点 isSystem 限制 + 集成测试 |
| 299 | 256 | closed | 角色双轨收口 T2：RoleManagement 页调整 |
| 300 | 257 | closed | [bug] 协同代理 POST body 请求可能挂起（缺 fixRequestBody） |
| 301 | 258 | closed | [bug] 微信回调 openid 缺失返回 500（应 400） |
| 302 | 259 | closed | [bug] batch-download 全失败任务仍 COMPLETED（addErrorLog 顺序） |
| 303 | 260 | closed | [bug] AdminBillingPage 失败路径 catch 死代码（throwOnError=false） |
| 304 | 261 | closed | [bug] 微信绑定 bindWechat openid 缺失同样 500 |
| 305 | 262 | closed | 日志监控运维方案（Log Monitor Ops）— wayfinder 地图 |
| 306 | 263 | closed | 后端日志落盘与脱敏（pino-roll + redact） |
| 307 | 264 | closed | 访问日志中间件与响应头中间件 |
| 308 | 265 | closed | 独立服务包零依赖 JSON 日志对齐 |
| 309 | 266 | closed | 后端出站调用点 requestId 透传注入 |
| 310 | 267 | closed | AlertLevel 三档枚举与触发点等级标注 |
| 311 | 268 | closed | AlertNotificationService 核心与 P0 实时邮件 |
| 312 | 269 | closed | AlertNotificationService P1 聚合与 P2 日报 |
| 313 | 270 | closed | 监控栈 docker-compose 变体（Prometheus/Grafana/Loki/Alertmanager + Promtail 配置） |
| 314 | 271 | closed | 监控栈裸机离线部署包（二进制预下载 + systemd） |
| 315 | 272 | closed | /metrics 端点 Bearer Token 认证 |
| 316 | 273 | closed | 指标告警规则与 Alertmanager 配置 |
| 317 | 274 | closed | Grafana 看板与登录认证 |
| 318 | 275 | closed | 备份 scheduler 与本地轮转（pg_dump） |
| 319 | 276 | closed | 备份异地推送（rsync / OSS / S3） |
| 320 | 277 | closed | 备份完整性校验与月度恢复演练 |
| 321 | 278 | closed | AUDIT_ADMIN 审计管理员角色（三权分立） |
| 322 | 279 | closed | 审计按月归档 CSV + SHA-256 校验（fail-closed） |
| 323 | 280 | closed | 审计受限删除（AUDIT_ADMIN + 已归档校验 + 二次确认） |
| 324 | 281 | closed | 审计归档 CLI 查询脚本 |
| 325 | 282 | closed | 清理任务指标埋点（cleanup_*） |
| 326 | 283 | closed | task_runs 保留期延长与清理记录可查 |
| 327 | 284 | closed | ADR-0049 日志监控运维方案正式落文 |
| 328 | 285 | closed | 审计触发点覆盖清单与运维制度文档 |
| 329 | 286 | closed | 日志落盘、轮转、访问日志与脱敏设计 |
| 330 | 287 | closed | 告警邮件外发链路设计（分级/聚合/恢复通知） |
| 331 | 288 | closed | Promtail / Loki / Grafana 采集端拓扑设计 |
| 332 | 289 | closed | Prometheus 指标告警规则设计 |
| 333 | 290 | closed | 数据库备份自动化设计（可配置化） |
| 334 | 291 | closed | 审计日志归档与防篡改设计 |
| 335 | 292 | closed | 清理任务可观测性设计 |
| 336 | 293 | closed | 跨服务 trace 透传设计 |
| 337 | 294 | closed | 等保三级合规条款映射调研 |
| 338 | 295 | open | Map: 测试覆盖补缺优先级决策（前后端集成测试盲区）— wayfinder 地图 |
| 339 | 296 | closed | [research] fonts 模块零测试：调研是死代码 / 未激活 / 待补测？ |
| 340 | 297 | open | [决策] policy-engine controller 无 HTTP 集成：补测试还是继续标未接线？ |
| 341 | 298 | open | [决策] notification 无专属测试：补单测/集成还是维持间接覆盖？ |
| 342 | 299 | open | [决策] audit 查询接口无专属测试：补集成还是维持间接覆盖？ |
| 343 | 300 | open | [决策] 协同 hook/service 纯逻辑单测（脱离 WS）：补还是不补？ |
| 344 | 301 | open | [决策] CAD 引擎启动链单测：补还是接受黑盒？ |
| 345 | 302 | open | [决策] 上传管线 hook 单测：补还是不补？ |
| 346 | 303 | open | [架构决策] collab-editing E2E 默认 skip：建真实后端基础设施还是 manual-only？ |
| 347 | 304 | open | [架构决策] 前后端契约校验机制：contract test / smoke E2E / 改造 MSW / 维持现状？ |
| 348 | 305 | open | Map: CloudCAD 架构成熟度提升路线图 — 安全/可观测/CD/质量门禁/构建编排 |
| 349 | 306 | closed | [P0-安全] @Throttle 死依赖清理：注册 ThrottlerModule 或删除无效装饰器 |
| 350 | 307 | open | [P0-安全] CSRF 策略：默认开启 vs Bearer-only 文档化 |
| 351 | 308 | closed | [P0-安全] WeChat OAuth state CSRF 修复方案：state 绑定 session + 令牌不走 URL fragment |
| 352 | 309 | closed | [P1-可观测] 采集层参考架构：Prometheus + Grafana + Loki 部署方案 |
| 353 | 310 | open | [P1-可观测] 生产日志级别可诊断化：审计/业务关键日志不被 prod 级别静默丢弃 |
| 354 | 311 | open | [P1-可观测] 引入 config schema 校验（zod / @nestjs/config validate） |
| 355 | 312 | open | [P2-质量门禁] 覆盖率阈值门禁 + pre-commit lint-staged 快速反馈 |
| 356 | 313 | open | [P2-质量门禁] CI 补齐 frontend depcruise + 清理幽灵步骤 |
| 357 | 314 | open | [P2-构建编排] 引入 Turborepo + 接通 TypeScript project references |
| 358 | 315 | open | [P1-CI/CD] CD 发布管道设计：CI 产物到 registry 到分阶段发布 |
| 359 | 316 | open | [P3-架构] 包边界加固：impl-mx 构建断言 + contracts-db 耦合审视 + service 接口共享 |
| 360 | 317 | open | [P3-架构] 缺失测试类型评估：负载测试 / a11y / 视觉回归 / 契约测试 |
| 361 | 318 | open | [P3-安全] CSP 收紧评估 + 审计日志补齐失败路径 |
| 362 | 319 | closed | [决策] fonts 是活模块但后端零测试：补 service 单测/集成到什么程度？ |
| 363 | 320 | open | [P3-架构] policy-engine 模块未激活：接线或下架收尾 |
| 364 | 321 | open | [tech-debt] 微信绑定接管收尾：接管非事务 / 旧账号 token 未失效 / txn 误判风险 |
| 365 | 322 | open | [tech-debt] AdminBillingPage 退款申请/订单两 Tab 同构：提取共享分页与筛选组件 |
| 366 | 323 | open | [tech-debt] 邮件 HBS 模板内联 CSS 重复：抽 Handlebar partial 共用布局 |
| 367 | 324 | open | [tech-debt] billing.service 裸英文 NotFound 统一 i18n 错误键 |
| 368 | 325 | open | [tech-debt] MemberCenter 超 ADR-0033 400 行门禁：拆分订单历史等区块 |
| 369 | 326 | open | [tech-debt] 滚动列表虚拟滚动（@tanstack/react-virtual）：与 DOM 测页/框选/累计合并深度耦合，需预研后分容器迁移 |
| 370 | 327 | open | [tech-debt] 快速滚动跳页加载（skip pages）：破坏『列表=已加载连续页』不变量，需先设计状态机 |
| 371 | 328 | open | [tech-debt] 后端分页设施统一：page/pageSize 与 page/limit 两套命名并存，service 手写 count+skip/take 重复 |
| 372 | 329 | open | 闇€姹傛祴璇?蹇界暐 |
| 373 | 330 | open | [浣庝紭鍏堢骇]闇€姹傦細浼佷笟鐢ㄦ埛鎺ュ叆C绔崗鍚屽钩鍙帮紝鏀寔璐﹀彿鍏宠仈涓庡绾х鐞嗙殑澶氱鎴稴aaS骞冲彴 |
| 394 | 331 | open | chore(storage): copy 物理复制中途失败留下的无 DB 记录存储目录缺少周期性清理 |
| 395 | 332 | open | test: 跨空间 move/copy 全链路集成测试（真实 PG）补齐 |
| 396 | 333 | open | bug(frontend): 库管理批量复制的 undo rollback 删除的是源节点而非副本 |
| 397 | 334 | open | chore(frontend): 删除死代码 crossProjectPaste.ts evaluateCrossProjectPaste |
| 398 | 335 | open | fix(db): PERSONAL_SPACE/LIBRARY 根行 transfer 默认值埋雷 + 重名检测大小写不一致、缺 (parentId,name) 唯一约束 |
| 399 | 336 | open | 【排票】运营统计端点集成测试（每日新增用户/会员购买统计） |
| 400 | 337 | open | 监控栈许可证合规整改（去 AGPL）+ Windows 离线部署交付 |
| 401 | 338 | open | Wayfinder 地图｜等保三级达标：CloudCAD 在线版随时可送测 |
| 402 | 339 | closed | 研究｜GB/T 22239-2019 三级控制点全景对照表 |
| 403 | 340 | closed | 任务｜定级备案材料草案（定级报告+备案表要点） |
| 404 | 341 | closed | 拷问｜身份鉴别强化：MFA 方案与双因素认定 |
| 405 | 342 | closed | 拷问｜口令策略与账号生命周期参数 |
| 406 | 343 | closed | 拷问｜PII 数据保密性路线（字段级加密 vs 补偿说明） |
| 407 | 344 | closed | 拷问｜边界防护零成本补强选型（WAF/堡垒机替代） |
| 408 | 345 | closed | 拷问｜内部传输加密处置（全链路 TLS vs 可信内网隔离） |
| 409 | 346 | closed | 拷问｜审计归档开启与记录完整性姿态 |
| 410 | 347 | closed | 拷问｜上传文件病毒扫描引入与否 |
| 411 | 348 | closed | 拷问｜制度缺口评估与 6 模板生效计划 |
| 412 | 349 | closed | 拷问｜CI 依赖漏洞扫描门禁选型 |
| 413 | 350 | closed | 拷问｜secrets 管理零成本升级与否（SOPS+age vs 维持 .env） |
| 414 | 351 | open | 任务｜西部数码控制台实配盘点（HITL 核对清单） |
| 415 | 352 | closed | [等保三级] 管理员 TOTP 双因素鉴别落地（#404 决策执行） |
| 416 | 353 | closed | [等保三级] 口令策略强化与账号生命周期落地（#405 决策执行） |
| 417 | 354 | closed | [等保三级] PII 字段级加密落地：phone/email 加密+索引与审计脱敏（#406 决策执行） |
| 418 | 355 | closed | [等保三级] 边界防护零成本补强落地：端口收口+fail2ban+运维留痕（#407 决策执行） |
| 419 | 356 | closed | [等保三级] 内部链路加固：Redis 必填密码+服务间共享密钥+边界说明（#408 决策执行） |
| 420 | 357 | closed | [等保三级] 审计归档强化：默认开启+异地同步+哈希链（#409 决策执行） |
| 421 | 358 | closed | [等保三级] 主机侧恶意代码防范落地：ClamAV 夜间批扫+隔离+告警（#410 决策执行） |
| 422 | 359 | closed | [等保三级] 制度生效工程：总体方针起草+六模板发文化+公司事实总单（#411 决策执行） |
| 423 | 360 | closed | [等保三级] CI 依赖漏洞扫描门禁落地：audit-ci+存量清理（#412 决策执行） |
| 424 | 361 | closed | [等保三级] secrets 加固落地：生产 .env chmod 600 + gitignore 全覆盖 + .env.bak 删除（#413 决策执行） |
| 425 | 362 | closed | [等保三级] MFA 登录链路集成测试（#415 关键路径排票） |
| 426 | 363 | open | [等保三级] PII 字段级加密 contraction：删 users.phone/email 明文列 + 显示读切解密（#417 收尾） |
| 427 | 364 | closed | [等保三级] 口令策略登录链路集成测试（#416 关键路径排票） |
| 428 | 365 | open | Wayfinder 地图｜图纸转换服务化 + 全链路队列化（单机 · 独立 conversion-service · 只 POST 通信） |
| 429 | 366 | closed | 【转换服务化】事实源收口：存在性/缓存/已转判据经 IStorageProvider + conversion_task |
| 430 | 367 | closed | 【转换服务化】conversion_task 表 schema 定稿 |
| 431 | 368 | open | 【转换服务化】队列与执行器：单机 Redis/BullMQ + 多 worker 安全 + 崩溃可恢复 |
| 432 | 369 | closed | 【转换服务化】部署拓扑与 env 变量统一（CONVERSION_MODE + STORAGE_MODE） |
| 433 | 370 | open | 【转换服务化】全部转换入口同步→异步 + 前端配合 |
| 434 | 371 | open | 【转换服务化】永久失败标记（判据 + 拦截 + 复位 + 前端呈现） |
| 435 | 372 | open | 【转换服务化】侧边栏「图纸」tab 队列面板 + 游客观察态 |
| 436 | 373 | open | 【转换服务化】conversion-service 全 TS 化 + 补测试 |
| 437 | 374 | open | 【转换服务化】监控 UI 激活（SystemMonitorPage 转换队列 Tab，并入旧观测性拷问） |
| 438 | 375 | closed | 【转换服务化｜research】standalone 存储路径（storage-service:3200）是否端到端可用 |
| 439 | 376 | closed | 【转换服务化】版本管理收口：provider 逻辑路径 + 历史版本转换入队 + 保存走 provider |
| 440 | 377 | open | 【转换服务化】转换分队列与优先级（open/thumbnail/export/batch + 缩略图丢弃限流） |
| 441 | 378 | open | 【转换服务化】API 契约与前端收口（新端点 + api-sdk/MSW + 全量转换调用点改异步） |
| 442 | 379 | open | 【转换服务化】转换触发 / 取消权限模型 |
| 445 | 380 | closed | [依赖漏洞] 第二批存量清理：multer/nodemailer/uuid 定点升级（#423 拆出） |
| 446 | 381 | open | [依赖漏洞] 第三批存量清理：three/hono/html-minifier 上游阻塞跟踪（#423 拆出） |
| 447 | 382 | closed | Wayfinder 地图｜移动端 App 化：常驻 CAD 编辑器 + 子页栈（微信式导航） |
| 448 | 383 | closed | test-probe |
| 449 | 384 | closed | T1 移动端常驻 CAD 编辑器容器方案（形态 A 常驻壳） |
| 450 | 385 | closed | T2 移动端子页导航模型与路由结构（Vue Router + PersistentEditorShell） |
| 451 | 386 | closed | T3 移动端子页复用 PC 功能 vs 重写（api-sdk 消费面盘点） |
| 452 | 387 | closed | T4 移动端子页功能边界（文件浏览器 / 个人资料 / 分享管理） |
| 453 | 388 | closed | T5 移动端 App 化实施票分解 + ADR + 回归矩阵 |
| 454 | 389 | closed | T6 移动端设计系统与主题定稿（微信简约 × CAD 暗色统一，全局视觉基线） |
| 455 | 390 | closed | T7 移动端页面全景与信息架构（页面清单 + 导航层级 + 图纸库/图块库列表 UI 复用盘点） |
| 456 | 391 | closed | T8 文件系统域页面设计（文件浏览器/个人空间/图纸库/图块库） |
| 457 | 392 | closed | T9 个人中心域页面设计（个人资料 / 分享管理） |
| 458 | 393 | closed | T10 CAD 编辑器菜单裁剪与编辑器根设计 |
| 459 | 394 | closed | T11 登录/鉴权引导与异常态页面设计 |
| 460 | 395 | open | Spec: 图纸转换服务化 + 全链路队列化（单机 · 独立 conversion-service · 只 POST 通信） |
| 461 | 396 | open | conversion-service 队列机制（Redis/BullMQ） |
| 462 | 397 | open | conversion-service 状态机扩展（加 CANCELLED 状态） |
| 463 | 398 | open | conversion-service 取消路由（POST /tasks/:id/cancel） |
| 464 | 399 | open | conversion-service 去重（content hash + source format + target format） |
| 465 | 400 | open | conversion-service 永久失败负缓存（content_hash + dst_fmt） |
| 466 | 401 | open | conversion-service TS 化 + 补测试 |
| 467 | 402 | open | backend 异步转换服务扩展（支持不同任务类型 open/download + 目标 nodeId/version/format） |
| 468 | 403 | open | backend 统一提交端点（POST /conversions/tasks） |
| 469 | 404 | open | backend 统一状态查询端点（GET /conversions/tasks） |
| 470 | 405 | open | CAD 编辑器场景（open 类型）：上传流程接入统一队列 |
| 471 | 406 | open | 前端悬浮可拖动按钮 + 展开面板 |
| 472 | 407 | open | CAD 编辑器场景（open 类型）：完成后打开文件 |
| 473 | 408 | open | 历史版本（download 类型）：接入统一队列 |
| 474 | 409 | open | 导出/下载（download 类型）：接入统一队列 |
| 475 | 410 | open | 前端统一转换面板：全部转换列表 + 搜索 |
| 476 | 411 | open | 前端：waitForFileReady 超时 60s→120s |
| 477 | 412 | open | 永久失败的前端呈现（文件列表红色×徽标 + 打开时弹窗提示 + 管理后台转换任务页面） |
| 478 | 413 | open | 监控 UI（SystemMonitorPage 转换队列 Tab） |
| 479 | 414 | open | M1 移动端 App 壳骨架：Vue Router + PersistentEditorShell |
| 480 | 415 | open | M2 UnifiedFileList 统一文件列表组件（四域共用） |
| 481 | 416 | open | M3 文件浏览器页（项目 + 个人空间） |
| 482 | 417 | open | M4 项目详情 + 图纸库 + 图块库专门页 |
| 483 | 418 | open | M5 个人中心 + 分享管理页 |
| 484 | 419 | open | M6 壳顶栏「+」+ 底部 Action Sheet 导航 |
| 485 | 420 | open | M7 编辑器菜单裁剪 + 编辑器根设计 |
| 486 | 421 | open | M8 登录/鉴权引导 + 6 态异常态组件 |
| 487 | 422 | open | M9 i18n 全量 + 部署入口 + 回归矩阵落地 |
| 488 | 423 | closed | 移动端 401 刷新重试失效修复 — fetch 层覆写替代 interceptor retry |
| 489 | 424 | open | api-sdk 生成产物移出 git 跟踪（.gitignore .gen.ts + clone 后一键生成 + CI 联动） |
| 490 | 425 | open | session 中间件 Redis 故障降级——NOAUTH/宕机不 500 每个请求（游客打开图纸 500 根因） |
| 497 | 426 | open | storage-service：接线 ADR-0015 多节点路由（FileHandler prefix→节点转发） |
| 498 | 427 | open | 移动端 mxweb IndexedDB 缓存逐次打开/保存只增不减：clearMxwebCache 只删精确键、?t= 旧版本永久驻留 |
| 499 | 428 | open | PC 保存路径写引擎私有 IDBFS store：无键空间契约、无容量上限（有界但脆弱，动它有打断保存链风险） |
