# 0054 — 跨项目转移 6 域模式矩阵（Cross-project transfer matrix）

**Status**: accepted

放开跨项目复制/移动/粘贴（此前前端硬守卫「不能跨项目粘贴」+ 库 API 匿名跳过源断言），改为**项目级可配置策略**：每个项目在 6 个"源域 × 目标域"方向上独立配置转移模式（`NONE / COPY_ONLY / MOVE_ONLY / ALL`），并新增专属权限 `PROJECT_TRANSFER_MANAGE` 控制谁能修改设置。目标：数据保护（防图纸被复制私有化到个人空间、防项目被动接收/外泄），同时保持云盘类产品"跨项目整理"的基础能力。

**Decision**

1. **数据模型**（`FileSystemNode` PROJECT 根节点 6 字段，`enum CrossProjectTransferMode`）：
   - 出向（本项目文件 → 其他位置）：`transferOutToProject`、`transferOutToPersonalSpace`、`transferOutToLibrary`
   - 入向（其他位置 → 本项目）：`transferInFromProject`、`transferInFromPersonalSpace`、`transferInFromLibrary`
   - **默认值**：出向→项目 `ALL`、出向→个人空间 `NONE`（个人空间私有，复制进去项目 owner 不可见——图纸私有化盗取通道，默认封死）、出向→库 `COPY_ONLY`（发布=复制，不破坏源项目）、三个入向 `ALL`。
   - 个人空间 / 公共库本身**无配置字段**（无 UI、恒允许），由归属权限兜底（personal 策略仅 owner、库需 `LIBRARY_*_MANAGE`）。
2. **校验矩阵**（`NodeMutationGuard.assertMutationAllowed` 扩展，仅跨归属根时执行，同根内零额外查询）：
   - 源为项目 → 按目标域查对应 `transferOut*`；目标为项目 → 按来源域查对应 `transferIn*`；模式匹配：copy 需 `COPY_ONLY|ALL`，move 需 `MOVE_ONLY|ALL`。
   - **目标归属校验**（新增，修复"只校验源不校验目标"缺口）：跨根时 `assertOwnershipPermission(userId, 'create', targetCtx)`——目标项目需 `FILE_CREATE`（非成员不可塞文件）、目标个人空间必须本人、目标库需 `LIBRARY_*_MANAGE`。
   - **库系统规则**（对所有项目生效，不占配置字段）：源为库 → copy 豁免源权限（公开资源可复制）、move 恒拒绝（破坏公共引用）；目标为库 → `LIBRARY_*_MANAGE`。
3. **权限**：新增 `PROJECT_TRANSFER_MANAGE`（依赖 `PROJECT_UPDATE`，OWNER+ADMIN 模板默认），设置端点 `PUT /projects/:projectId/transfer-settings`（`@RequireProjectPermission` + `@CsrfProtected`，部分更新），`ProjectDto` 回显 6 字段。
4. **库域接入方式（方案 B，重要教训）**：库页剪贴板**前端不替换**为通用 node API——库 API 原有三条保障（`PermissionsGuard(LIBRARY_*_MANAGE)`、匿名跳过源断言的维护路径语义、无审计埋点）直接替换会全部改变。改为**后端 `LibraryController` 8 端点（move/copy/batch × drawing/block）透传 `req.user?.id`** → `nodeCopyMoveService(..., userId)`，权限校验收口 `NodeMutationGuard` 单一事实源，前端零改动。改既有行为前必须先对比权限守卫/审计/撤销三链路。
5. **配额修正**（顺带修复两个漏洞）：
   - 库配额跳过条件从"源或目标任一属库"改为**仅目标属库**（原"从库复制大文件进项目"不限额）。
   - 跨根操作配额归属**目标根 owner**（原按源文件 owner 扣额度语义错误）。
6. **数据一致性**：跨项目 move 后级联更新子树 `projectId`（`TreeWalker.getSubtreeIds` + `updateMany`），消除 trash 恢复等直读 `projectId` 字段路径的陈旧值。
7. **前端契约**：`useFileBrowserActions` 删除「不能跨项目粘贴」守卫；`canPaste` 改为目标上下文 `canCreate`（粘贴=在目标创建节点，跨项目后源权限位不可用）；跨项目 cut 粘贴弹确认框（文件从源项目移走）；`SelectFolderModal` 加目标根切换器（`useTransferTargetRoots`：个人空间 + 我的项目）；`ProjectModal` 编辑模式加 6 下拉设置区块（`useTransferSettings` 即时保存）。

**Rejected options**

- **纯角色权限承载"能否跨项目转移"**：跨项目涉及源/目标两个项目，单权限点无法表达"源允许出 × 目标允许进"，且每个项目每角色都要配，漏配即漏洞。策略（项目开关）与操作（谁改开关的权限）分离是防漏配的兜底。
- **前端库页粘贴统一替换为通用 API**：改变库 API 的守卫/审计/撤销三链路（见 Decision 4），前端零改动方案 B 等价且更安全。
- **个人空间/库也设配置字段**：个人空间私有（personal 策略已限本人）、库是系统维护公开资源（LIBRARY 权限 + 系统规则），配置面冗余。

**Cross-references**

- ADR-0037 节点变更校验 Guard（`NodeMutationGuard` 统一入口）
- ADR-0051 项目角色模板化（`DEFAULT_PROJECT_ROLE_PERMISSIONS` 唯一来源，新权限进模板）
- ADR-0027 共享 Prisma Client（`@cloudcad/db` 枚举唯一出口）
- `packages/backend/src/file-operations/node-mutation.guard.ts` / `node-copy-move.service.ts`
- `packages/backend/src/library/library.controller.ts`（方案 B 透传 userId）
- `packages/frontend/src/components/modals/ProjectModal.tsx` / `hooks/useTransferSettings.ts`
- migration `20260814_add_cross_project_transfer_modes`
