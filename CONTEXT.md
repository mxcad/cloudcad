# CloudCAD

在线 CAD 协同编辑平台。**TOB + TOC 双轨定位**：当前通过 TOB（企业私有化部署）盈利，未来主力发展 TOC（消费者公有云）。架构必须同时满足两类客户——TOB 需可替换的认证/存储/部署方案，TOC 需高安全性。所有代码开源，核心差异化能力通过接口策略模式 + 私有包隔离实现。

## Language

**图纸（Drawing）**:
用户编辑的核心业务实体，即一个 CAD 文件。图纸以 mxweb 格式存在——内存中、保存上传时、以及后端存储的都是 mxweb 二进制数据。
_避免_: 文档、file（在有歧义的上下文中）

**文件节点（FileSystemNode）**:
图纸在文件树中的组织单元，包含父子关系、权限归属、存储路径等元数据。每个文件节点对应一张图纸。代码中统一使用 Prisma 模型名称 `FileSystemNode`。
_避免_: 文件夹（folder 是另一种节点类型）、FileNode（旧称）

**mxweb 文件**:
图纸的运行时格式。CAD 引擎（MxCADView）操作的是 mxweb 数据，保存时也是将 mxweb 二进制上传到后端。.dwg/.dxf 上传后由后端转换为 .mxweb。

**角色（Role）**:
用户在某范围内的身份标签，决定其可执行的操作集合。分两个独立维度：
- **系统角色（System Role）**：控制后台管理功能。ADMIN（全部权限）> USER_MANAGER（用户/角色管理）> FONT_MANAGER（字体库管理）> USER（基础权限）。含继承层级。
- **项目角色（Project Role）**：控制项目内文件操作。OWNER（全部权限）> ADMIN（管理+编辑）> EDITOR（编辑但不能创建）> MEMBER（基本操作）> VIEWER（只读）。与系统角色完全解耦。**项目角色模板**（ADR-0051）：系统管理员维护"创建项目时的默认角色"（可增删，OWNER 模板保底不可删、模板名不可改）；项目创建时复制模板为项目自己的角色，项目内完全自治（可增删改含改名；项目所有者使用的角色不可删，数据驱动）；删除在用角色时成员自动降级为项目内可用角色，项目内永远保证至少存在一个非所有者角色——删光时自动重建默认项目成员角色（删除自愈）。私人空间与公开资源库零角色（分别按 ownerId / 系统权限判断）。
_避免_: 权限组、用户组、职位

**权限（Permission）**:
一个具体的原子操作许可，授予角色后生效。分两个维度：
- **系统权限（System Permission）**：后台管理操作（SYSTEM_USER_*、SYSTEM_ROLE_*、SYSTEM_FONT_*、SYSTEM_ADMIN、SYSTEM_MONITOR、LIBRARY_*_MANAGE、STORAGE_QUOTA、PROJECT_CREATE 等）。
- **项目权限（Project Permission）**：项目内操作（FILE_*、CAD_SAVE、CAD_EXTERNAL_REFERENCE、VERSION_READ、PROJECT_* 等）。
_避免_: 权利、许可

**文件状态（FileStatus）**:
FileSystemNode 在上传/转换管道中的生命周期状态。流转路径为：UPLOADING（上传中）→ PROCESSING（格式转换中）→ COMPLETED（完成）或 FAILED（转换失败）。已删除节点标记为 DELETED。
_避免_: 上传状态、处理状态

**版本（Version）**:
图纸在某个时间点的 MX 快照。每次保存图纸时，后端自动提交一次 MX，生成一个新的 VersionRecord。一个 FileSystemNode 拥有多个 VersionRecord，构成版本历史链。资源库不产生版本。
_避免_: 修订、历史记录

**审计日志（AuditLog）**:
管理员全局合规视图的操作事件记录——谁（用户）在何时（时间戳）对什么资源（含名称快照）做了什么（操作类型）。只记高价值操作（权限/角色变更、项目生命周期、成员变更、文件变更[新增/修改图纸]、节点操作[新建文件夹/重命名/移动/复制/回收站恢复]、文件删除/分享、账号安全[改密码/停用/解绑]），高频读操作（登录、下载、上传）只记失败；保留期可配置、到期清理（非不可篡改）。与操作历史共用同一事件存储。埋点写入统一走 `AuditLogService.log()`（系统级）与 `logProjectFileAction()`（项目内节点动作，仅项目内节点记录，个人空间/公共资源库不记）。
_避免_: 操作日志、系统日志

**操作历史（Operation History）**:
审计事件在项目维度的投影视图，供项目成员查看"最近发生了什么"。事件范围：成员变更、文件变更（新增/修改图纸）、节点操作（新建文件夹/重命名/移动/复制/回收站恢复）、文件删除/分享、项目设置变更、项目角色/权限变更。入口位于文件系统根目录工具栏（"操作历史"弹窗），owner/admin 可见全部、普通成员只读。与审计日志共用同一张表，仅查询范围与展示文案不同。弹窗列表按时间分组（今天/昨天/更早），文件/文件夹类记录点击可跳转文件管理器定位到节点所在位置。
_避免_: 项目动态、活动记录

**外部参照（External Reference / Xref）**:
图纸中引用的外部 DWG 文件或图片，作为当前图纸的参照底图。外部参照独立存储，不纳入 FileSystemNode 体系（非 CAD 文件如参照图片属于外部参照专项）。需要 CAD_EXTERNAL_REFERENCE 权限方可上传/管理。

**外部参照磁盘文件命名**:
外部参照文件按「源文件全名 + .mxweb」存储在源图纸目录下的外部参照子目录中，形如 `data/files/{日期}/{nodeId}/{src_file_md5}/{fileName}.mxweb`。
- DWG/DXF 外部参照：`A1.dwg` → `A1.dwg.mxweb`（保留原始扩展名，追加 `.mxweb`，**勿剥掉扩展名**）
- 图片外部参照：`image.png` → `image.png`（保持原名，不追加后缀）
- 外部参照子目录名取自 `preloading.json` 的 `src_file_md5`，降级为 `nodeId`
- 无 DB 节点（游客/临时上传）时写入 `mxcadUploadPath/{srcDwgNodeId}/` 临时目录
- **命名规则以写入端为准**：`handleExternalReferenceFile` 写入的文件名是单一事实源，所有消费端（`checkExists`、`getExternalRefDownloadPath`、`enrichFileInfoList`）须与之一致，禁止各自重复推导

_避免_: 外部引用、附件

**预加载索引（Preloading Index）**:
外部参照模块生成的 JSON 文件，记录图纸所引用的外部文件列表及其状态，用于编辑器打开时快速加载参照。位于外部参照存储目录下，由 `ExtRefPreloadingService` 统一管理读写。
_Avoid_: preloading.json（实现细节）、外部参照缓存

**回收站（Trash）**:
文件节点被删除后的暂存区域。删除操作不物理删除数据，而是将节点移入回收站（FileStatus 标记为 DELETED）。支持恢复（restore）和彻底删除（permanently delete）。需要 FILE_TRASH_MANAGE 权限管理。
_避免_: 已删除、垃圾箱

**秒传（Instant Upload / Dedup）**:
上传流程的前置守卫——上传前先通过文件 hash 检查文件是否已存在于存储中。若已存在（命中）则跳过整个分片上传流程，直接复用已有数据创建 FileSystemNode；未命中才进入分片上传。
_避免_: 去重上传、快速上传


**存储配额（Storage Quota）**:
用户可使用的存储空间上限。由用户的 VIP 等级配置中 `quota.personal_storage_mb` 决定。上传文件前主动检查配额是否充足，超出时阻止。改为用户级限制，不再存储于 FileSystemNode 节点。
_避免_: 空间限制、容量上限

**项目（Project）**:
图纸文件组织的核心容器。包含文件树、项目成员（按角色控制权限）、元数据。是图纸三种归属之一。创建用户时自动生成一个对应的个人空间。
_避免_: 团队、工作区、文件夹

**个人空间（Personal Space）**:
每个用户独有的归属容器。创建用户时自动创建，不可删除，没有项目成员（仅所有者一人），不设项目权限检查。是图纸三种归属之一。底层实现与 Project 共享同一模型（NodeType=PERSONAL_SPACE），但行为上有差异（无成员管理、保存不走权限检查）。用户可见名称统一为「个人空间」（旧称「我的图纸」已废弃，存量根名在访问时惰性迁移）。
_避免_: 私人空间、我的图纸、我的文档

**资源库（Library）**:
公共图纸和图块的集中存储。不产生版本（不提交 SVN），保存时直接覆盖 mxweb。分两种子类型：图纸库（drawing library）和图块库（block library）。是图纸三种归属之一。保存需库管理权限，无权限时弹出"另存为"。
_避免_: 公共库、共享库

**项目成员（Project Member）**:
用户在特定项目中的身份关联，由 [用户 + ProjectRole] 组成。OWNER 是项目创建者（不可移除），其他角色由 OWNER/ADMIN 分配。支持添加、移除、角色变更、所有权转让。私人空间无项目成员（仅所有者一人）。
_避免_: 协作者、团队成员

**另存为（Save As）**:
区别于覆盖保存的写入操作——创建新的 FileSystemNode 并拷贝当前 mxweb 数据，而非原位覆盖。需要指定目标归属类型（my/project/library，对应私人空间/项目/资源库）。常用于无权限覆盖保存时（如资源库无管理权限），或需将图纸复制到其他位置时。
_避免_: 复制保存、副本

**导出（Export）**:
将 mxweb 格式的图纸按需转换为 DWG/DXF 格式并提供下载。平台以 mxweb 为唯一内部流通格式，导出仅在用户主动触发时执行后端转换（conversion 引擎），转换完成后即提供下载。未登录不可导出。
_避免_: 下载、输出

**图块（Block）**:
CAD 中可复用的图形单元（如门、窗、家具符号），可被多个图纸引用。平台通过资源库的图块库（block library）统一管理，需要 LIBRARY_BLOCK_MANAGE 权限。与图纸库（drawing library）属于资源库的两种子类型。
_避免_: 组件、符号

**分片上传（Chunk Upload）**:
大文件传输机制——将文件按固定大小切分为分片（chunk），逐片上传至后端，全部到达后触发合并（merge）还原完整文件。替换了之前的 Tus 协议，是自实现手动分片上传的核心。与秒传协作：先检查 hash，不存在时走分片上传。
_避免_: 分块上传、分段上传

**图纸摄入（Drawing Ingest）**:
将外部文件（整包上传 / 分片合并 / 秒传命中）转换为图纸树中 FileSystemNode 的统一入口。接口为 `ingest(source, target)` 与 `checkExist(hash, target)`（source 为 `{kind:'file'}` 或 `{kind:'chunks'}` 的判别联合）；内部封装秒传、格式转换、FileStatus 状态机流转、存储分配、缩略图生成与外部参照分支。是上传传输层（controller）与图纸树之间的唯一深 module，取代并收敛了原 `FileConversionUploadService` 与 `FileMergeService` 两条并行实现。
_避免_: 上传服务、转换服务、上传管线（这些指传输或执行子层）

**节点落盘（FileNodeMaterializer）**:
图纸摄入内部的落盘编排深 module（内部 seam，非公开接口）——`materialize(input)` 一个入口，从输入文件（source 判别联合：`{kind:'single'}` 单拷/双写备份、`{kind:'artifacts'}` 多产物）完成父容器解析、建节点、存储分配、缩略图、原始备份与外部参照回调。配额检查、冲突策略、状态机流转与转换频率占位留在摄入编排层。失败返回 null（父容器不存在或内部异常），ret 码语义由编排层转换。
_避免_: 落盘服务、存储分配器（指子步骤）

**认证提供者（AuthProvider）**:
可替换的认证实现插件。每个 AuthProvider 通过实现一组标准接口（认证、OAuth、短信、密码重置、账号绑定、Token 管理）提供完整的认证能力。系统支持三个层级的提供者：
- **OSS AuthProvider**（开源）：完整的参考实现（密码/微信/SMS/邮箱绑定），随开源仓库发布
- **Pro AuthProvider**（公司内部私有）：增强安全版本（风险检测、MFA 等），通过私有包隔离
- **Custom AuthProvider**（TOB 客户）：企业自有认证对接（LDAP/SAML/AD），仅实现需要的接口
选择机制：DI 容器通过配置决定加载哪个 provider，Controller 不感知具体实现。
_避免_: 认证插件、认证适配器

**OssAuthProvider**:
开箱即用的认证参考实现，包含密码登录注册、微信登录、短信验证、邮箱绑定等全功能。行为与先前的 LocalAuthProvider 一致。随开源代码发布，可被 Pro/TOB provider 完整替换。
_避免_: 默认认证、内置认证

**认证服务层（Auth Service Seam）**:
`AuthFacadeService` 与具体业务逻辑（注册、密码、账号绑定、Token 管理）之间的接口契约。定义四个接口：`IRegistrationService`、`IPasswordService`、`IAccountBindingService`、`IAuthTokenService`，以及对应的 DI Token（`REGISTRATION_SERVICE` 等）。该 seam 允许实现层（`providers/` + `services/`）被替换为私有包而不影响开源侧的编排逻辑和 API 路由。
_避免_: 认证内部服务、认证子模块

**字体（Font）**:
CAD 工程图纸中使用的文字渲染资源，包括 SHX 形字体和 TrueType 字体。通过系统字体库统一管理（上传、下载、删除、预览），需要 SYSTEM_FONT_* 系列权限。FONT_MANAGER 角色专门负责字体库维护。
_避免_: 字型、文字样式

**转换引擎（Conversion Engine）**:
文件格式转换的底层执行子系统。通过调用 `mxcadassembly.exe` 二进制，支持 DWG/DXF ↔ mxweb、CAD → PDF、缩略图生成、BIN 分片/合并等。以 `convertFile(options: ConversionOptions)` 单一入口暴露（两级参数契约的 HTTP 层形状），内部按目标格式派生引擎参数。引擎进程由谁启动取决于部署模式：**嵌入式模式下 mxcadassembly 就是后端进程 spawn 的子进程**（`@cloudcad/engine-exec` 单一模块统一 spawn/参数装配/输出解析），只有自托管模式才由 conversion-service 的 worker 池执行。
_避免_: 转换函数、转换微服务

**函数工作流服务（Function Workflow Service）**:
转换引擎的托管运行时。对外暴露 `convertFile` 统一转换入口，内部按转换类型（DWG→mxweb、PDF、缩略图等）路由执行。支持三种部署模式（ADR-0016）：嵌入式（作为后端 NestJS 模块，子进程池执行）、自托管（独立 HTTP 服务 + Redis 队列 + Docker Worker 池）、云 FaaS（通过 `IFunctionExecutor` 适配器委托给华为云 FunctionGraph / 阿里云 FC / AWS Lambda，HTTP APIG 触发，不依赖对象存储）。在途引擎任务簿记（taskId → PENDING/PROCESSING/…）由执行器侧维护；**节点级状态（`FileStatus`）的权威源在后端 DB**，由转换对账兜住卡死记录。
_避免_: 转换服务、转换微服务

**统一任务层（Unified Task Layer）**:
`IFunctionExecutor` 之上、所有转换调用方的公共层——提交/查态/取消/统计/明细/清队列这一组任务原语只有一处契约，三种部署模式只是它的不同 adapter。新增部署模式或新增任务原语都只动这一层（新增原语建议做成可选方法，调用方按 `undefined` 降级），禁止调用方各自重新判断 `FUNCTION_EXECUTOR` 值。
_避免_: 任务中间件、转换网关、执行器工厂

**转换任务（Conversion Task）**:
提交给统一任务层的一条转换单元（`ConversionTask`：id / type / params / priority），执行态由 `TaskStatus` 描述（PENDING / PROCESSING / COMPLETED / FAILED / CANCELLED，含 progress、result、errorCategory、errorCode、queuePosition）。注意与节点级 `FileStatus` 是两个层次：转换任务是在途引擎工作，`FileStatus` 是图纸节点持久化状态。
_避免_: 作业、任务节点

**排队位置（Queue Position）**:
`TaskStatus.queuePosition` —— 任务在其优先级信号量 acquire 队列中的 1-based 序号，仅「PENDING 且已入队」有意义；运行中、未入队、终态一律为 undefined。用于前端展示「前方还有 N 个」。
_避免_: 队列长度（那是队列统计里的 queueLength，不是单个任务的位置）

**转换结果缓存（Conversion Result Cache）**:
**内容寻址**的转换产物缓存：条目名 `{文件内容 hash}-{格式参数 key}{ext}`，由 `FileDownloadExportService.buildConversionCacheKey(hash, format, pdfParams)` 单一出口派生（格式参数 key 覆盖 pdf 尺寸/色彩策略、dwgVersion、格式名），`getFreshConversionCachePath` / `storeConversionCache` 读写。单文件导出与批量下载共用同一目录与同一 key，双向命中复用；按 mtime 做惰性 TTL 检查，过期即删。命中缓存不占用转换配额。
_避免_: 转换缓存 key、下载缓存

**转换对账（Conversion Reconciliation）**:
`ConversionReconciliationService` 定时（默认 5 分钟，启动后延迟 30 秒，宽限期默认 30 分钟，单批上限 200）扫描「`FileStatus`=PROCESSING 且 updatedAt 早于宽限期」的节点，与执行器侧在途任务簿记比对后按 `NodeStatusTransitioner` 修正状态，防止 backend / conversion-service 重启导致节点永久卡死（用户无法打开也无法重试）。
_避免_: 状态同步、任务回收

**存储服务（Storage Service）**:
统一文件管理层，接管所有 `data/` 目录（`files/`、`uploads/`、`exports/`、`conversion/`）。以 HTTP 网关对外暴露文件读写和 SVN 操作 API。数据按目录组（`YYYYMM` / `YYYYMM_N`）分片到不同存储节点，每个节点维护独立的 SVN 工作副本和仓库。路由表由存储服务维护，`FileSystemNode.path` 不变。支持嵌入式（本地文件系统）和独立 HTTP 服务两种模式。CDN/ESA 缓存挂载在存储服务前，通过 URL 的 `?t=updatedAt&v=version` 参数破坏缓存。
_避免_: 文件服务、对象存储

**格式转换（Format Conversion）**:
DWG/DXF ↔ mxweb 之间的格式互转。上传时 DWG/DXF 自动转为 mxweb（内部流通格式），导出时 mxweb 按需转回 DWG/DXF。由转换引擎执行，是平台"以 mxweb 为唯一内部格式"架构的前提。转换失败时 FileSystemNode 标记为 FAILED。
_避免_: 转码、格式变换

**两级参数契约（Two-level Param Contract）**:
转换参数在两层用不同命名：backend ↔ conversion-service 的 HTTP 层用 camelCase（`srcPath`/`fileHash`/`dwgVersion`…），conversion-service ↔ `mxcadassembly` 二进制的单参 JSON 用 lowercase/下划线（`srcpath`/`src_file_md5`/`dwg_version`）。命名翻译只发生在一处——`@cloudcad/contracts` 的 `buildEngineParams`（唯一 builder），backend 进程内 spawn 与 conversion-service runner 共用同一实现；内容身份派生字段集 `CONTENT_KEY_FIELDS` 由 `ENGINE_INPUT_FIELDS − outpath` 派生，禁止再手写第二份清单（ADR-0064/0069）。
_避免_: 引擎参数、转换参数、mxcad 参数

**缩略图（Thumbnail）**:
文件节点在列表中的预览图像——后端在保存/上传完成后为图纸生成缩略图，前端通过 Thumbnail 组件渲染。用于文件浏览器和资源库列表中的快速预览识别，减少不必要的完整图纸加载。
_避免_: 预览图、快照图

**运行时配置（RuntimeConfig）**:
区别于静态环境变量的动态配置体系。通过管理后台页面对系统行为开关进行实时调整（如注册开关、验证策略），修改后立即生效无需重启。受 SYSTEM_CONFIG_READ/WRITE 权限管控。与部署时固定的环境变量（如 JWT_SECRET）是互补关系。
_避免_: 动态配置、特性开关

**文件大小（File Size）**:
FileSystemNode 记录的文件字节数。由后端在摄入（ingest）、保存、另存为、外部参照时写入，前端不写。**领域不变量**：COMPLETED 状态的 FILE 节点 size 必须非空且为真实字节数（配额增量计算与用量统计都依赖此不变量）；UPLOADING/PROCESSING/FAILED 等非终态节点允许 size 为 0。历史遗留的「COMPLETED + size IS NULL」节点属于缺陷数据（issue #215），必须先回填或清理，之后才可实施 schema 级非空强制。
_避免_: 文件体积、大小字段、字节数

**文件缺失（Missing File）**:
COMPLETED 文件节点存在、但其物理文件在任何已知位置（节点目录 path、uploads 转换产物、uploads 原始上传文件）都无法找到的状态。该状态不允许长期存在：治理时按「恢复优先」原则——依次尝试节点目录物理文件、uploads 按 hash 的 mxweb 产物、uploads 原始文件（mxweb/dwg）恢复 size，三个来源都彻底找不到的节点才执行物理删除（连版本记录），避免「COMPLETED 但无文件」的假数据长期占用配额语义。fileHash 为 null 的节点无法尝试 uploads 分支，回填只能依赖节点目录。
_避免_: 损坏文件、空文件、孤儿节点

**孤立文件（Orphan File）**:
文件系统与数据库双向不一致的产物：本地孤立（磁盘有节点目录但 DB 无记录，物理删除）或 DB 孤立（DB 有 FILE 记录但物理文件缺失，按「文件缺失（Missing File）」治理原则处理——恢复优先、彻底缺失才物理删除并逐条审计）。由存储清理任务（storage-cleanup 调度器，每周）周期性双向检测，含 admin 手动触发与统计端点。与「文件缺失」的区别：文件缺失是单节点视角，孤立文件是系统扫描视角。
_避免_: 垃圾文件、残留文件、孤儿节点

**文件哈希（File Hash）**:
文件的唯一数字指纹，通过对文件内容计算哈希值（如 SHA-256）生成。用于秒传检测（比对哈希判断文件是否已存在）、存储去重、以及验证 Drawing.fileHash 与 storage 中 mxweb 文件的一致性。上传链路的第一步就是计算文件哈希。
_避免_: 文件指纹、MD5、校验码

**协同（Collaboration）**:
多个用户实时编辑同一图纸的协作模式。通过 mxcad SDK 的 `getCooperate()` 建立 WebSocket 连接（经 `/api/cooperate` 代理），SDK 内部处理操作合并与冲突。一个协同会话称为一个 work。
_Avoid_: 协作、实时协作

**协同会话（Work）**:
一个协同编辑 session。通过 `createWrok()` 创建（自动加入）或 `joinWork()` 连接已有会话（SDK 内部自动加载文件），通过 `exitWrok()` 断开。work_data 使用 V3 编码（base64 JSON），包含 drawingId、projectId、drawingName、sourceType、creatorId 等元数据。
_Avoid_: 会话、session

**图纸会话（Drawing Session）**:
由 `services/drawingSession/` 深模块管理的「编辑器当前打开图纸」会话状态。`openSession(info)` / `closeSession()` 为唯一 writer（编排 `useCADEditorStore` 相关字段 + 切换/重置）；引擎→UI 信号经类型化事件 bus（`subscribe(event, cb)`，补全 CAD_EVENTS 与 payload 类型）取代散落的 window 裸字符串事件；`isModified` 脏标记由 session 持有并发布，侧边栏订阅而非 1s 轮询。与「协同会话（Work）」的区别：图纸会话是本地编辑会话状态，协同会话是 mxcad 协作连接。
_避免_: 编辑器状态（指 store 本身）、当前文件状态、session 直译

**私有化部署（Private Deployment / TOB）**:
面向企业客户的部署模式——客户在自己的基础设施上部署完整 CloudCAD 栈（含 PostgreSQL、Redis、SVN、mxcadassembly 协同服务等），由客户自行运维。协同功能（Collaboration）仅在私有化部署下可用，通过运行时配置 `collaboration_enabled` 控制开关。
_Avoid_: 离线部署、自托管

**增量升级包（Incremental Upgrade Package）**:
面向私有化部署客户的版本更新交付物（ADR-0046）——只含变更产物（各包 dist、全量 prisma migrations 目录、runtime/scripts、完整生产依赖 store），**解压覆盖部署根目录即完成升级**：start 自动检测并应用（migrate deploy 幂等 + `pnpm-lock.yaml` hash 与 store 标记 `variant:lockfileHash` 不一致时自动 `pnpm install --offline --prod`）。与全量部署包的差异：不含 runtime 二进制、配置模板；配置与用户数据（`.env*`、前端 `ini/*.json`、`brand/`、`data/`）永不入包。平台约束：store 原生依赖与打包环境平台强相关，Linux 升级包必须在 Linux 容器内打包。
_Avoid_: 升级补丁、热更新包、patch 包

**标准组件（Standard Component）**:
离线部署包内嵌的第三方基础运行时软件——Node.js、PostgreSQL、Redis、SVN，均非公司自研，在目标机上由部署运行时的基础服务管理器以 daemon 模式拉起并托管。是私有化交付的生命线：缺任一组件即整包不可用，因此打包侧必须逐组件断言就绪，不允许静默缺失。
_避免_: 系统依赖、运行时环境、第三方库

**产品二进制（Product Binary）**:
公司自研的闭源可执行产物——mxcad 图纸转换器与 mxversion 版本工具。按内容哈希去重经内部稳定发布通道分发。注意边界：PostgreSQL 属于标准组件，但因官方下载直链不可靠，其 Windows 二进制与产品二进制共用同一条内部发布通道——「共用通道」不改变其组件归类。
_避免_: 产品文件、闭源组件（含混标准组件）、mxcad 二进制（仅指转换器单个组件）

**公有云（Public Cloud / TOC）**:
面向终端消费者的 SaaS 模式——由 CloudCAD 官方托管运维，用户即开即用。默认不开启协同功能。是平台未来主力的发展方向。与私有化部署共享同一套代码库，通过运行时配置区分能力差异。
_Avoid_: SaaS、云服务

**批量下载（Batch Download）**:
将多个文件节点打包为 ZIP 下载的功能。用户选择文件列表（可含文件夹递归展开），指定各文件的输出格式（original/mxweb/pdf/dwg/dxf），由后端逐一转换后打包为 ZIP。支持 SSE 实时进度推送、任务取消、24 小时有效期。需要 FILE_DOWNLOAD（项目文件）或 LIBRARY_DRAWING_MANAGE/LIBRARY_BLOCK_MANAGE（资源库文件）权限。
_Avoid_: 打包下载、批量导出

**批量下载任务（Batch Download Job）**:
由 `BatchDownloadJob` 深模块管理的批量下载任务生命周期。状态机：PENDING → PROCESSING → COMPLETED / FAILED / CANCELLED；终态集合与仲裁（首达终态者胜）单一来源；`transition(to)` 是唯一状态写入入口（内存 + 落库 + 事件一次完成），JobContext 为其内部实现。取消经 `cancel(jobId)` 一步完成 abort + 落 CANCELLED。
_避免_: 批量下载（指功能整体，见上）；下载任务（与旧同步批量下载 `CrossNodeDownloadService` 混淆）

**IP 黑名单（IP Blacklist）**:
平台级的网络访问控制列表——管理员手动将恶意来源 IP/CIDR 加入黑名单后，该来源的所有请求（含登录、公开接口）被全局拦截，返回 403 且不泄露拦截详情。持久化存储（PostgreSQL）且可审计（条目记录操作人，添加/移除操作写入审计日志）。拦截执行在后端应用层（NestJS 全局 Guard），非运维层（nginx/fail2ban/iptables）能力。区别于 token 黑名单：token 黑名单是认证凭证的失效机制（Redis 易失、自动失效），IP 黑名单是网络访问控制（管理性、持久、可审计）。
_避免_: 封禁列表、拉黑名单、token 黑名单（语义不同）

**IP 黑名单条目（Blacklist Entry）**:
一条 IP/CIDR 封禁记录。字段：`ip`（精确 IP 或 CIDR，含 IPv6）、`source`（'manual' 管理员手动 | 'auto' 自动检测，本期仅 manual）、`reason`（原因）、`createdBy`（操作人）、`createdAt`、`expiresAt`（可空 = 永久；非空 = 到期惰性失效，无需定时任务）。移除 = 物理删除，操作痕迹由审计日志承担。
_避免_: 封禁记录、IP 记录

**多选（Multi-selection）**:
前端列表/表格页面的行级多选机制（ADR-0052）。单一选择内核 `useFileBrowserSelection`（泛型 `{id}`）提供
`selectedNodes / handleNodeSelect(ctrl, shift) / handleSelectAll / clearSelection / selectMany / deselectNode`，
支持 `multiple: 'always' | 'batch-only' | false`。快捷键由 `useSelectionShortcuts` 超集统一承担（ESC 清空、Ctrl/Cmd+A 全选、
Delete 批量动作，带输入框/Modal/焦点容器守卫）。选择状态由页面持有（受控），翻页/搜索/筛选变化后须 `clearSelection()`。
_避免_: 全选（指状态而非机制）、批量选择（与批量操作区分——选择是状态，批量操作是动作）

**框选（Rubber-band selection）**:
鼠标拖拽矩形选区批量选中列表项（`useRubberBandSelection`，全站唯一实现）。行/卡片 DOM 必须带 `data-node-id` 属性参与矩形相交检测；
启动框选时 hook 统一 `preventDefault()`（阻止文本选择与原生元素拖拽，根治"框选拖动其他元素"），
`input/textarea/select/[contenteditable]` 与滚动条区域不启动框选；`rubberBandJustEndedRef` 用于抑制框选结束后的 click 误触发单选。
_避免_: 橡皮筋、拖拽选择（与文件拖拽移动语义混淆）

**表格容器（SelectableTable）**:
前端表格形态列表的唯一入口组件（components/common/，ADR-0052）。机制内置（滚动容器 + 框选 + 表头全选/行 checkbox 列 +
行点击选中 + `data-node-id` + 选中样式 + 滚动分页/按钮分页 + 加载/空态 + 页脚 visiblePage），业务外置（`renderHeader`/`renderRow`）。
新建表格页面必须复用，禁止手写 checkbox 列/行点击/框选接线。
_避免_: DataTable、Table（与后端"表/数据表"语义混淆）

**批量操作条（BatchActionBar）**:
选中计数徽标 + 批量按钮组 + 清空（`selectedCount > 0` 显示）的统一组件。批量动作一律**循环调用现有 SDK 单条接口**
（统计成功/失败计数 Toast 汇总），不新增后端批量接口（同分享管理批量撤销模式）。

## 关系

- 一张 **图纸** 是一个 `NodeType=FILE` 的 **文件节点** 的业务别名——图纸不独立于文件节点存在
- 一个 **文件节点** 引用一条 mxweb 文件路径
- CAD 引擎通过 mxweb URL 加载图纸数据
- 一个 **文件节点** 拥有多个 **版本**（通过 SVN 提交生成）
- **资源库** 节点不产生版本
- 删除 **文件节点** 时，其所有 **版本** 记录一同删除

## 后端模块依赖分层

后端所有模块按三层依赖方向约束组织（ADR-0007），箭头方向不可逆：

```
Layer 1: 基础设施层
  ├── 数据库/缓存/存储（DatabaseModule, RedisModule, StorageModule, CacheArchitectureModule）
  ├── 通用基础设施（CommonModule, I18nModule, ConfigModule）
  └── 不依赖任何业务模块

↓ 可依赖

Layer 2: 核心业务层
  ├── 认证/用户/权限（AuthModule, UsersModule, RolesModule）
  ├── 文件系统/计费（FileSystemModule, BillingModule, AuditLogModule）
  ├── 运行时配置/策略（RuntimeConfigModule, PolicyEngineModule）
  └── 只能依赖 Layer 1，同层之间尽量通过接口解耦

↓ 可依赖

Layer 3: 业务编排层
  ├── CAD 引擎/格式转换（MxCadModule, ConversionModule）
  ├── 资源库/分享/下载（LibraryModule, ShareModule, BatchDownloadModule）
  ├── 管理/调度/健康检查（AdminModule, SchedulerModule, HealthModule）
  ├── 版本控制（VersionControlModule）
  └── 只能依赖 Layer 1 + Layer 2，不能互相依赖
```

**模块状态（Module Health）**:
后端模块除三层分层外，还需处于以下健康状态之一，新模块必须能回答三问（有无消费者/有无测试/是否值得独立）：
- **已激活**：有消费者、有测试、被 app.module 装配并实际生效（如 permission、file-operations）
- **已实现未接线**：能力完整但生产链路未接入（如 policy-engine、ownership 空壳），必须 JSDoc 标注状态 + 登记 issue，不得"假装生效"
- **迁移中（双轨）**：expand-contract 迁移的中间态，必须排收尾票（contract 旧路径退休），禁止无限期双轨（如 storage vs storage-provider）
- **孤儿（孤儿服务/孤儿 barrel/空壳模块）**：无消费者，一律删除或标注
_实例与决策见 issue #228（模块健康盘点）、#234（存储迁移收尾）_

## 图纸归属

一张图纸有且仅有一种归属，见以上术语定义：[项目](#项目project)、[私人空间](#私人空间personal-space)、[资源库](#资源库library)。

归属的关键行为差异：
- **项目**：保存需检查 CAD_SAVE 权限
- **私人空间**：保存时直接原位覆盖，无需权限检查
- **资源库**：无版本管理（不提交 SVN），保存时直接覆盖 mxweb



**VIP 等级（VIP Tier）**:
用户的订阅等级标识，线性等级体系（VIP0 → VIP1 → VIP2 → VIP3...），高级别拥有低级别的全部权限。每级存完整扁平配置。**VIP0 为系统固有默认等级**（所有账号注册即拥有的免费基线，永久有效）：不可创建、不可下架、不可删除，名称/价格不可修改（仅权益配置可编辑），由 `VipTierService` 的 `FREE_TIER_LEVEL` 守卫强制（ADR-0053）；`GET /vip/tiers` 恒返回 level 0，前端消费方不得重复硬编码免费选项。高级别有过期时间，过期后降级为 VIP0。产品体系不存在"永久会员"商品；代码中 `expiresAt: null 且等级 > 0` 仅为历史/异常数据兼容状态（如旧官网同步），不得按商品开发或推广（ADR-0042）。
_避免_: 会员等级、套餐等级、会员类型、永久会员（商品）

**等级配置（TierConfig）**:
VIP 等级绑定的键值对权限/限制集合。Key 由后端 `ConfigKeyRegistry` 定义，管理后台动态渲染配置表单。Key 如 `quota.personal_storage_mb`、`quota.conversion_window_count`、`quota.conversion_window_hours`、`quota.project_size_mb`、`quota.max_projects`。
_避免_: 固定字段、硬编码配置

**会员状态（Membership）**:
用户在某一时刻的生效订阅快照，由「此刻的有效等级 + 该等级的有效配置（configs）」组成。由 `MembershipService`（`vip/`）统一提供 `getEffectiveMembership(userId)` / `getEffectiveTier(userId)` / `getQuota(userId, key)`；等级 configs 缺 key 时回落 `ConfigKeyRegistry.defaultValue`。是配额强制（RestrictionEngine）与额度展示（storage-info / user-crud）共同依赖的读侧权威。**会员状态数学（水位重算、升级折算、外部水位保护、有效判定）统一归 MembershipService 写侧**，billing 只做支付/退款编排与订单查询；「月 = 30 天」换算约定单点定义于 membership。
_避免_: 会员服务、订阅服务（指 billing 写侧）；会员等级判断（分散推导的旧说法）

**等级定价（TierPricing）**:
VIP 等级月基础价。最终价格 = 等级月基础价 × 时长倍率 × 月数。时长倍率（如 3月0.9、6月0.8、12月0.7）与等级定义解耦，修改定价无需动多个记录。
_避免_: 套餐定价、方案定价

**每日新增用户（Daily New Signups）**:
某自然日内创建账号、且当前未被软删（自助注销或管理员删除）的用户数量，按账号创建时间归日。
_避免_: 注册量、拉新数（含软删口径）

**购买数（Purchase Count）**:
某自然日内成功支付交易的三项计数——订单笔数、去重付费用户数、金额合计。只算 status=SUCCEEDED 的 PaymentOrder，按支付完成时间归日；下单未付/关闭/超时不计。
_避免_: 销售量、成交量、营业额（指金额时）

**退款单（Refunded Order）**:
支付成功后发生退款的订单（OrderStatus.REFUNDED）。统计中单列「退款单数」，不从当日购买数中扣减。
_避免_: 退款订单（与退款申请 RefundApplication 混淆）

**桌面客户端（Desktop Client）**:
通过设备授权流接入平台的本地 EXE 程序（`mx_cad_viewer`/`mx_cad_editor`），持有 `client_type:'exe'` 的 JWT（与 Web 共用 JwtStrategy，可直接调用业务 API）。客户端不实现任何支付逻辑，VIP 购买一律跳转浏览器完成。
_避免_: EXE 程序、本地应用、桌面应用

**设备授权流（Device Authorization Flow）**:
桌面客户端认证的 OAuth 设备码流程（`DeviceAuthModule`）：客户端调 `POST /device/code` 获取 `device_code`/`user_code`，浏览器打开 `/device` 授权页（未登录先登录），用户确认后客户端轮询 `POST /device/oauth/token` 换取 7d access + 30d refresh token（refresh token 落库）。授权码 300s 过期，轮询间隔 5s。
_避免_: 设备码登录、EXE 登录、扫码登录（与支付码不同）

**授权重定向（Authorization Redirect）**:
`/device` 授权页 `redirect` URL 参数。桌面客户端发起授权时自行拼接，授权成功后浏览器跳转到该地址（如 VIP 购买页 `/member-center`）。仅接受同源 URL（防开放重定向），未登录时经 sessionStorage 穿透登录页。与登录页既有 `redirect_uri`（桌面 OAuth 回调带 token 模式）是两套独立机制。
_避免_: 回调地址、跳转地址（与 `redirect_uri` 混淆）

**会员按需查询（On-demand Membership Check）**:
桌面客户端判定 VIP 能力的时机策略——不推送、不轮询、不在购买后主动刷新，而是在需要 VIP 功能的时机（启动、点击会员入口）实时调用 `GET /billing/membership` 取最新会员状态。支付成功经 webhook 即时激活账号级会员，客户端任何时刻查询均可得。
_避免_: 会员推送、会员轮询、购买结果回调

**转换频率限制（Conversion Frequency Limit）**:
图纸转换操作的滑动窗口频率限制，取代旧「每日转换次数」配额（ADR-0043）。窗口小时数与窗口内次数均可配置：登录用户按 `userId` 计数（VIP tier 配置 `quota.conversion_window_count` / `quota.conversion_window_hours`，默认 2 小时 10 次），游客按请求 IP 计数（运行时配置 `conversionGuestLimit` / `conversionGuestWindowHours`，默认 2 小时 5 次）。只在转换执行点检查（上传→mxweb、导出、格式转换下载），上传接口与其他服务不限制；超限时不转换、不创建 FileSystemNode，提示「转换过于频繁，请稍后再试」。
_避免_: 每日转换次数、每日转换配额（旧语义）

**额度守卫（Quota Enforcement）**:
由 `RestrictionEngine` + 多 `RestrictionStrategy` 策略管道实现。上传、粘贴、移动、复制、另存为等增加项目体积的操作前，检查目标的当前总大小 + 增量 ≤ 用户对应的限额——项目目标读 `quota.project_size_mb`，个人空间目标读 `quota.personal_storage_mb`（两者底层逻辑相同，仅读取的 key 不同）。转换操作按「转换频率限制（Conversion Frequency Limit）」执行（ADR-0043）。不满足时返回 `InsufficientQuotaException`。策略通过 NestJS DI multi-provider 注册，新增限制类型只需新增策略类。
_避免_: 被动检查、事后限制

**节点变更校验（Node Mutation Guard）**:
由 `NodeMutationGuard` 提供的文件节点变更统一断言入口。所有 copy / move / delete / trash / restore / update 操作执行前必须通过 `assertMutationAllowed(user, action, ctx)`——内部按归属类型（项目 / 私人空间 / 资源库）分派权限、解析配额策略 key（项目操作不误拦个人空间配额）、经 RestrictionEngine 校验；变更后经 `invalidateQuotaAfterMutation` 失效配额缓存。跨归属根（源根 ≠ 目标根）的 move/copy 追加**跨项目转移矩阵**（ADR-0054）：源项目按目标域查 `transferOut*` 模式、目标项目按来源域查 `transferIn*` 模式（`NONE / COPY_ONLY / MOVE_ONLY / ALL`，四态）、目标归属校验（目标项目 `FILE_CREATE` / 个人空间本人 / 库 `LIBRARY_*_MANAGE`）、库系统规则（源 copy 豁免 / 源 move 恒拒绝）；配额按目标归属（仅目标属库跳过，跨根按目标根 owner）。与「额度守卫（Quota Enforcement）」的区别：额度守卫是配额执行的策略管道引擎，节点变更校验是跨操作的统一前置序列编排。
_避免_: 文件操作校验、变更守卫（与「额度守卫」混淆）、Mutation Guard 直译

**跨项目转移矩阵（Cross-Project Transfer Matrix）**:
项目根节点 6 个 `CrossProjectTransferMode` 字段（出向 3：`transferOutToProject` / `transferOutToPersonalSpace` / `transferOutToLibrary`；入向 3：`transferInFromProject` / `transferInFromPersonalSpace` / `transferInFromLibrary`），控制本项目文件可被跨项目复制/移动的方向与模式。默认：出向→个人空间 `NONE`（防图纸被复制私有化）、出向→库 `COPY_ONLY`（发布=复制）、其余 `ALL`。设置由 `PROJECT_TRANSFER_MANAGE` 权限管理（`PUT /projects/:projectId/transfer-settings`）。个人空间 / 公共库无配置字段，由归属权限兜底（ADR-0054）。
_避免_: 转移开关、复制粘贴权限（指权限枚举）

**树遍历（TreeWalker）**:
文件树父子关系的唯一解析 module——`resolveProjectId(nodeId)` 沿祖先链找第一个非 FILE/FOLDER 节点（PROJECT / PERSONAL_SPACE / LIBRARY 根，即广义项目根语义），`getSubtreeIds(rootId, opts)` 收集合（opts 含 includeRoot / includeDeleted），`getSubtreeFiles` / `getSubtreeFolderIds`。取代了 `FileTreeService.getProjectId`、`NodeTrashService.getParentProjectId`、`NodeMutationGuard.lookupProjectIdByNode` 三处递归与 `TreeTraversalService`（已删除）。CTE 实现，一次查询无 N+1。
_避免_: 树遍历服务、祖先链查询（指实现细节）

**用量聚合（Usage Aggregation）**:
配额读侧的文件大小聚合单一入口——`usageSize(scope)` 判别联合（`{kind:'personal',userId}` / `{kind:'project',projectId}` / `{kind:'subtree',nodeId,status:'completed'|'all'}` / `{kind:'owned',userId}`），由 `StorageUsageService` 提供。内部做个人空间解析与子树 id 收集；纯查询无缓存（强制路径必须新鲜，展示缓存是展示层包装）。项目用量统一为全项目成员口径（ADR-0017），个人空间缺失返回 0。取代了策略 / storage-info / copy-move / trash / user-crud 共 7 处近似 aggregate。
_避免_: 配额查询、大小聚合（指 SQL 细节）

**FileSystemNode.storageQuota（已废弃）**:
旧版存储配额字段，每个节点独立设配额。已被用户级 VIP 配置取代，schema 中此字段将在迁移中删除。
_避免_: 节点配额、project 配额

**同步用户（Synced User）**:
从旧官网同步到 CloudCAD 的用户。用户手机上在旧官网注册过，首次登录 CloudCAD 时自动创建本地账号并绑定手机号。同步后走本地认证，不依赖旧官网持续可用。旧官网身份以不可变关联键 `User.oldSiteUserId`（旧官网 userId）锚定，手机号换绑不影响同步命中；历史数据无关联键时按 `User.phone` 兼容查找并补录。本地账号已绑定其他旧官网身份时跳过资料/VIP 同步，避免身份被错误接管。
_避免_: 代理用户、映射用户

**契约包（@cloudcad/contracts）**:
Monorepo 中开源的接口/契约包（`packages/contracts/`），包含 DI token 常量、TypeScript 接口类型，以及**无 IO / 无框架 / 无副作用的纯函数式契约**（如 `buildEngineParams`，准入四条与逃逸口见 ADR-0069）。`@cloudcad/impl-mx` 和 `backend` 都依赖此包解耦。
_避免_: 共享类型、类型包

**数据库共享包（@cloudcad/db）**:
数据库 schema 单一源 + 生成的 Prisma Client 统一出口（`packages/db/`）。所有包（backend、impl-mx、contracts）的数据层类型（模型、枚举、`Prisma` namespace、`PrismaClient`）一律从 `@cloudcad/db` 获取；migration 归 backend 执行（ADR-0027）。实例化归 backend `DatabaseService`，本包不导出单例。
_避免_: `import ... from '@prisma/client'` 直接取类型、各包各自维护 schema 副本

**实现包（@cloudcad/impl-mx）**:
Monorepo 中私有的 MX 官方实现包（`packages/impl-mx/`），经 `.gitignore` 排除。通过 `IMPL` 环境变量动态加载，NestJS 启动时调用 `createAuthProviders()` 注册私有 Provider。不影响 OSS 开源版本。
_避免_: 私有包、MX 包

**旧官网客户端（OldSiteApiClient）**:
封装旧官网三个端点（`/app/checkuser`、`/app/login`、`/app/personal`）的 HTTP 客户端，form-urlencoded 格式，超时 10s。位于 `@cloudcad/impl-mx` 私有包中。
_避免_: 旧网站 API、历史系统客户端

**增量 VIP 同步（Incremental Vip Sync）**:
将旧官网 VIP 权益增量合并到 CloudCAD 的算法。`UserMembership.metadata.externalVipExpiresAt` 记录上次同步时旧官网的 `vipTime`（外部会员到期时间），每次登录计算新旧时长差，调用 `MembershipService.activate()` 更新。支持：首次同步（加剩余天数）、续费（只加增量）、过期跳过。
_避免_: VIP 迁移、VIP 复制

**OldSiteAuthHandler（旧官网认证处理器，已废弃）**:
实现 `IAuthenticationHandler.login()` 的私有认证处理器（ADR-0018，机制①覆盖同 token 的反例——复刻整套登录导致 register() 被一并接管）。已重构移除：不再覆盖 `AUTHENTICATION_HANDLER`，改为机制②扩展点 `USER_SYNC_HOOK`（见下）。旧词仅存于历史 ADR 与文档，代码中不存在。
_Avoid_: 代理认证、旧官网登录

**USER_SYNC_HOOK（登录同步扩展点）**:
机制②扩展点的活示例（`IUserSyncHook` + token `USER_SYNC_HOOK`）。OSS `LoginService` 在查询本地用户之前调用 `syncBeforeLogin(account, password)` 可选钩子；不接管认证主流程——密码校验、token 生成、session 始终由 OSS 完成。OSS 不注册时 `@Optional()` 注入为空，行为零变化。私有实现 `@cloudcad/impl-mx` 的 `OldSiteUserSyncHook` 注册此 token，完成旧官网代理验证 → 创建/更新本地用户 → VIP 增量同步。
_Avoid_: 覆盖认证主流程、复刻登录（ADR-0018 反例）

**RestrictionEngine（限制引擎）**:
策略管道引擎，通过 DI multi-provider 收集所有 `RestrictionStrategy`。`evaluate(ctx: RestrictionContext): Promise<void>` — fail-fast，任一策略拒绝即抛 `InsufficientQuotaException`。
_Avoid_: 配额引擎、检查引擎

**RestrictionStrategy（限制策略）**:
可插拔的限制检查策略，实现 `check(tierConfig, context)` 接口。三种配额策略：`ProjectSizeStrategy`、`PersonalStorageStrategy`、`ConversionFrequencyStrategy`。通过 NestJS `multi: true` 注册。

**IMPL 环境变量**:
指向私有覆盖层包的路径。`true`/`1` 走 `packages/impl-mx/dist`，其他值为任意路径。OSS 认证始终由 `createDefaultAuthProviders()` 注册（开箱可用）；`IMPL` 存在时仅**叠加** impl-mx 覆盖层，只覆盖 `AUTHENTICATION_HANDLER`。原 `AUTH_IMPL` 已更名为 `IMPL`。
_Avoid_: AUTH_IMPL（旧称）

**上传预签名 Token（Upload Presigned Token）**:
客户端上传文件到 Storage Service 前，先由 Backend 签发 JWT Token（含 userId, nodeId, path）。Storage Service 本地校验 JWT（共享 secret，不查 DB），校验通过后写入存储。Token 自包含，无需 Storage Service 查询数据库。
_Avoid_: 上传凭证、存储 Token

**三级优先队列（Three-Level Priority Queue）**:
转换任务按优先级分为三个独立信号量池：Level 1 上传转换（最高，阻塞等待）、Level 2 导出/PDF（自动降级为异步）、Level 3 缩略图/批量（丢弃最旧任务）。各级并发数和反压阈值由环境变量配置。
_Avoid_: 转换队列、任务队列

**最终一致性转换（Final Consistency Conversion）**:
两层状态：节点级 `FileStatus` 的权威源在**后端 DB**（提交即置 PROCESSING，回调/轮询拿结果后落终态）；在途引擎任务簿记在执行器侧（进程池为进程内 Map，独立服务在远端 TaskStore）。提交是 fire-and-forget，backend/conversion-service 重启会丢 promise → 定时对账（默认 5 分钟，宽限 30 分钟）扫描卡死的 PROCESSING 节点并恢复。
_Avoid_: 强一致性、同步等待

**URL 缓存失效（Cache Invalidation by URL Mutation）**:
所有文件 URL 携带 `?t=updatedAt&v=version` 参数。文件更新时 updatedAt 变化 → URL 变化 → 浏览器/CDN 自动请求新资源。不需要显式 PURGE 操作。三层缓存：L1 浏览器（max-age=3600）、L2 Nginx/CDN（URL key）、L3 Storage Service 内存 LRU（<10MB 热门文件）。
_Avoid_: 缓存清除、手动刷新

**IFunctionExecutor（函数执行器接口）**:
转换引擎的统一抽象接口（token: `IFunctionExecutor`，3 个实现：`ProcessPoolExecutor` 子进程池 / `HttpConversionExecutor` HTTP / `CloudFaaSExecutor` 云函数）。方法面：`invoke(task)` 提交、`getTaskStatus(taskId)` 查态、`cancelTask?` 取消（仅独立服务有进程组/可出队）、`queueStats()` 与 `durationStats()` 统计（无排队队列的形态返回 null）、`listTasks?` 逐任务明细、`clearQueue?` 清队列。容器侧由 `function-executor.module` 的 `useFactory` 按 `FUNCTION_EXECUTOR` **一次**选定 adapter；消费者一律只注入 token——批量下载、单文件导出、异步转换、对账、监控、健康检查都不再按 mode 字符串分支，统计口径也全部走 seam（监控不再自己持 HTTP 客户端、不再镜像执行器内部字段名）。
_Avoid_: 转换服务、执行器

**IStorageProvider（存储提供者接口）**:
统一文件存储抽象接口，定义纯文件 CRUD（`read/write/delete/exists/copy/move/listAll/deleteAll/getMetaData/getUrl/copyFromFs`，**无 SVN 操作**，#273/#274 合并单轨）。所有部署模式共享此接口。实现类：`FlydriveStorageProvider`（本地文件系统）、`HttpStorageProvider`（HTTP 远程调用）。SVN 能力由 **IVersionControl**（`VERSION_CONTROL_TOKEN`）承担：`MxVersionControlProvider`（embedded）/ `HttpVersionControlProvider`（standalone，代理 storage-service）。
_Avoid_: 文件存储、存储抽象

**告警（Alert）**:
由系统自动产生的"需要人处理"的异常信号记录。区别于指标（连续数值）与日志（事件流水账）——告警只在阈值或异常触发时产生。两态流转：open（待处理）→ resolved（已恢复）。同源去重：同一来源同一消息仅保留一条 open 状态的告警，恢复后置 resolved。
_避免_: 通知、提醒（推送动作，不是记录本身）

**告警触发源（Alert Source）**:
产生告警的被监控对象类别。第一版三个：磁盘空间（剩余 <20GB 警告 / <10GB 严重）、缓存健康（容量>90%、命中率<70%、L2 断连、内存>500MB）、定时任务失败。均为"检测逻辑已存在、仅接上报"的信号。
_避免_: 监控项、监控点

**定时任务执行记录（TaskRun）**:
后台定时任务（cron 调度）每次执行的记录——任务名、开始/结束时间、成功/失败、耗时、错误摘要。用于监控调度任务是否按计划运行（如回收站清空、存储清理、缓存清理），失败时产生告警。
_避免_: 任务日志、job 记录

## Flagged ambiguities

- **"文档"（document）**：曾用来指 CAD 引擎内存中的数据，但这个概念不存在。引擎内存中的就是 mxweb 数据，保存后上传的也是 mxweb 二进制。此词应避免使用。
- **"LocalAuthProvider"**：旧称，已更名为 `OssAuthProvider`。代码中看到 `LocalAuthProvider` 应视为与 `OssAuthProvider` 同义。
- **"sourceType"**：三个独立概念巧合同名：
  - 前端协同 V3（`'my' | 'project' | 'library' | 'local' | 'share'`）— 协同会话的上下文来源
  - 后端搜索 DTO（`'project' | 'file'`）— 搜索结果标记（命中的是项目还是文件）
  - 后者应更名为 `searchScope` 来消除歧义，但尚未重构