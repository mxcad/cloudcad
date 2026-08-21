# 0037 — 节点变更校验（Node Mutation Guard）
**Status**: accepted

「修改一个 FileSystemNode」的不变量序列——权限、配额、归属类型、缓存失效——长期散落在多处且规则互不相同：move/copy/delete/update 的权限靠 controller `@RequireProjectPermission` 装饰器（service 内零检查），trash/restore 却在内部分配了 `validateTrashPermission`，内部调用方必须自己知道「这个操作有没有被 guard 保护」；配额策略 key 存在两套语义——`buildQuotaStrategyKeys`（node-copy-move / node-trash，个人空间感知的正确语义）与 6+ 处硬编码 `[PROJECT_SIZE, PERSONAL_STORAGE]`（upload / save / save-as / external-ref / library，注释自认会误拦跨项目操作）；项目/私人空间/资源库三种归属的行为差异规则在 8 处各写各的；向上找 projectId 有三份实现（`FileTreeService.getProjectId` / `NodeTrashService.getParentProjectId` / `NodeContextResolver.lookupNodeProjectId`）；FileStatus 由 4 个权威写入，`file-tree.updateFileStatus` 纯写库靠注释约定先 validate；`restoreNode` 靠 `skipProjectQuotaCheck` 选项让调用方防重复算配额。本 ADR 记录架构评审（improve-codebase-architecture，candidate「节点变更校验」）定案，执行见 issue。

**Decision**

1. **引入 `NodeMutationGuard`（落 `file-operations/`，Layer 2）**：共享不变量 runner，而非大编排。copy / move / delete / trash / restore / update 的操作逻辑保留在各自 service（它们不浅——递归复制、后代过滤、级联删除都是真实现），横切序列收敛进 guard。interface：
   ```ts
   assertMutationAllowed(user, action, { node, target?, incrementBytes? }): Promise<void>
   // action: 'copy' | 'move' | 'delete' | 'restore' | 'update'
   invalidateQuotaAfterMutation(user, node): Promise<void>
   ```
2. **guard 吸收 权限 + 配额 + 归属类型解析**：`assertMutationAllowed` 内部先 `resolveProjectContext(node)`（三份 projectId 查找收敛），再按归属类型分派——项目→项目角色（ProjectPermissionService）、私人空间→不检查、资源库→LIBRARY_*_MANAGE（PermissionService）；8 处归属差异规则收敛一处。已迁移路由的 controller 装饰器**移除**（不再双查）。service 层直接检查为 `permission-system` 技能所支持。
3. **配额策略 key 正确语义**：guard 内部按「目标是否用户个人空间」解析 keys（`[PROJECT_SIZE]` 为基，仅个人空间目标加 `PERSONAL_STORAGE`）；6+ 处硬编码 `[PROJECT_SIZE, PERSONAL_STORAGE]` 的消费方（upload / save / save-as / external-ref / library / trash / copy-move）全部改走 guard 解析，修复跨项目操作误拦。图纸摄入（DrawingIngest，ADR-0035 / #196）实现时同样走此路径。
4. **FileStatus 唯一 transition 入口**：file-operations 的写入点（trash delete/restore、copy-move、file-tree `updateFileStatus`、async-conversion 直写 prisma）全部接上 ADR-0035 的 `NodeStatusTransitioner.transition(nodeId, from, to)`；`file-tree.updateFileStatus` 退役；`restoreNode` 的 `skipProjectQuotaCheck` 泄漏随统一序列消失。
5. **scope**：seam 圈 `file-operations/` 簇（copy / move / delete / trash / restore / update + project-crud 建目录）。DrawingIngest（候选 1）与 save / save-as（`mxcad/save`）圈出，各自已有流程不并入。

**Guidance**

1. 新增节点变更操作必须经 `assertMutationAllowed`；禁止在 service/controller 内另写权限或配额检查。
2. 归属类型差异规则只在 guard 内编码，禁止在消费方重现。
3. 消费方禁止硬编码 `[PROJECT_SIZE, PERSONAL_STORAGE]`；配额 keys 一律经 guard 解析（或经 ADR-0036 的 `QUOTA_KEYS` + Membership 权威）。
4. FileStatus 写入一律经 `NodeStatusTransitioner.transition`；禁止直接 prisma 写 `fileStatus`。
5. 缓存失效经 `invalidateQuotaAfterMutation`，禁止每个操作手工调 `invalidateQuotaCache`。

**Status**: accepted

**Cross-references**
- CONTEXT.md「节点变更校验（Node Mutation Guard）」术语（本次评审落账）
- ADR-0035 图纸摄入深模块：`NodeStatusTransitioner` 来源；本 ADR 将其推广到 file-operations 写入点
- ADR-0036 会员状态读侧权威：`QUOTA_KEYS` / `getQuota` 为本 ADR 配额解析的取值来源
- ADR-0007 三层依赖：`file-operations`（Layer 2）被 mxcad / library（Layer 3）消费，方向合规
- issue #196 图纸摄入执行（交叉引用：ingest 的配额检查走本 guard）
- issue #198 节点变更校验执行（任务票，6 步序列）
