# 0051 — 项目角色模板化与项目自治（Project role templates & per-project autonomy）
**Status**: accepted

# 背景

历史实现中 `ProjectRole` 以 `projectId = null + isSystem = true` 表示"全局共享模板"：
所有项目共享同一批角色实例（`findByProject` 用 `OR: [{projectId}, {isSystem: true}]` 并入每个项目），
项目内 5 个默认角色（PROJECT_OWNER/ADMIN/EDITOR/MEMBER/VIEWER）只读不可编辑，
改模板权限影响**所有**项目，且项目内角色操作门控依赖 `SYSTEM_ROLE_UPDATE`（系统权限），权限边界割裂。

用户明确要求：**创建项目时的默认角色配置由系统管理员管理；项目创建后角色属于项目、完全自治**。

# Decision

## 1. 项目创建时复制模板 → 项目自治

- 项目创建（`ProjectCrudService.createNode` 项目分支）在事务内：建项目节点 → `copyTemplatesToProject`
  复制当前模板（`projectId = null AND isSystem = true`）为项目自己的角色副本（`projectId = 项目`，
  含权限关联，`isSystem = true` 保留为"默认角色"展示标记）→ owner 成员挂**项目自己的** PROJECT_OWNER 副本。
- 模板变更只影响**新建项目**；存量项目持有自己的副本，不受影响。
- 项目内角色完全自治：可增删改（含改名/改描述/改权限），一律走项目端点
  （`PROJECT_ROLE_MANAGE` / `PROJECT_ROLE_PERMISSION_MANAGE`，`ProjectRolesController`）。
- `findByProject` 只返回项目自己的角色（去掉 `OR isSystem:true`）。

## 2. 私人空间与公开资源库零角色

- **私人空间（"我的图纸"）**：权限按 `ownerId` 判断（`PersonalPermissionStrategy` /
  `RequireProjectPermissionGuard.handlePersonalSpaceAccess`），**不建成员行、不复制任何角色**。
- **公开资源库（图纸库/图块库）**：走系统权限（`LIBRARY_DRAWING_MANAGE` / `LIBRARY_BLOCK_MANAGE`，
  `LibraryPermissionStrategy`），不建成员/角色（现状即如此，零改动）。
- 二者均不属于项目协作范畴，角色体系不适用。

## 3. 项目所有者角色保护（数据驱动）

- 项目所有者使用的角色**不可删除**：删除校验查 `FileSystemNode.ownerId` 对应成员的 `projectRoleId`，
  **不依赖角色名**（项目内角色可改名）。
- 前端：`findByProject` 返回的每个角色带 `isOwnerRole` 标记（DTO 新增字段），删除按钮据此禁用；
  成员管理下拉据此排除（`MembersModal`）。

## 4. 删除在用角色 → 成员自动降级

- 删除项目角色时，使用该角色的成员**自动降级**到：`PROJECT_MEMBER` 名字的角色 →
  任一非所有者角色 → 都没有则禁止删除（`no_demote_target`）。
- 删除确认 UI 明确提示降级语义。

## 5. 模板管理（系统管理员）

- 模板**可增删**（`RolesController` 旧 `/roles/project-roles*` 端点，`SYSTEM_ROLE_*` 权限）：
  系统端点创建的模板 `isSystem = true`（否则不会被复制，成为死模板）；
  **OWNER 模板保底不可删**（创建项目必须有所有者角色）、**模板名不可改**
  （OWNER 模板按名保底等语义依赖名称）；权限/描述可编辑。
- 模板变更不再全量清权限缓存（副本已独立，`invalidateRoleCache` 只清项目维度）。

## 6. 存量迁移（标准 Prisma migration）

- `project_role_templates_copy`：为所有存量项目节点（PROJECT/PERSONAL_SPACE）复制模板副本 +
  成员按 name 重挂到副本（确定性 id `pr_||md5(tplId||projectId)`，同迁移内可稳定引用）。
- `trim_personal_space_roles` / `remove_personal_space_members_roles`：私人空间零成员/零角色。
- 迁移已验证：cloudcad_test（108 节点）/ cloudcad（653 节点）副本数精确、权限一致、0 归属不一致。

# Rejected options

- **保留全局共享模板**：项目无法自治、模板变更爆炸半径覆盖所有项目（含误伤）、
  `isSystem` 双重语义（模板标记 + 保护标记）导致校验混乱、项目内操作需系统权限门控体验割裂。
- **私有空间也复制全部模板**：私人空间仅 owner 一人，无协作场景，复制 4 个无用角色属冗余数据。
- **OWNER 保护按角色名**：项目内角色可改名后按名判断失效；按数据（ownerId → 成员 roleId）可靠。

# Known trade-offs

- 模板修改不再自动修复存量项目（权限漏洞修复需运营逐项目处理或重新发版模板）。
- 数据冗余：每项目 5 行角色 + 权限关联（万级项目约 5 万行，可接受）。
- 项目创建事务变重（复制角色 + 权限 + 成员，单事务内完成）。

# Cross-references

- `packages/backend/src/roles/project-roles.service.ts`（copyTemplatesToProject / 自治校验 / createDefaultMemberRole）
- `packages/backend/src/file-operations/project-crud.service.ts`（项目创建事务）
- `packages/backend/src/roles/dto/role.dto.ts`（isOwnerRole）
- `packages/backend/prisma/migrations/20260814033131_project_role_templates_copy`
- `packages/frontend/src/pages/RoleManagement/`（项目角色模板区块）
- `packages/frontend/src/components/modals/ProjectRolesModal.tsx` / `MembersModal.tsx`
- Issue #297（双轨收口方案 A）/ #298（旧端点 isSystem 限制）/ #299（RoleManagement 页调整）

# 修订记录：删除自愈——默认成员角色自动重建（2026-08-25）

**背景缺陷**：第 4 节的 `no_demote_target` 兜底存在死角——无成员使用的非 owner
角色可被逐个删光；项目只剩 owner 角色后，无法再邀请任何成员（addMember 强制
要求项目内非 owner 角色），后续删除操作也永久被禁。

**决策（取代第 4 节"都没有则禁止删除"分支）**：

- 项目内非 owner 角色删除**永不因"无降级目标"被拒**：
  - 在用角色且无存活降级目标 → 先自动创建默认 PROJECT_MEMBER 副本接住成员；
  - 删除后项目内已无非 owner 角色 → 自动补建，保证项目仍可邀请成员。
- 默认成员角色来源：优先复制系统级 MEMBER 模板（含权限）；模板已被系统管理员
  删除时回退内置 `DEFAULT_PROJECT_ROLE_PERMISSIONS.MEMBER`。单个项目的删除
  不反向修改系统模板库。
- 并发竞态：唯一约束 `[projectId, name]` 冲突时复用已存在的副本（幂等）。
- 审计：ROLE_DELETE metadata 附注 `autoCreatedMemberRoleId`。
- i18n 键 `error.role.no_demote_target` 移除。
- 前端联动：移除 ProjectRolesModal 的"最后一个可降级角色"预检拦截及 toast；
  确认弹框与引导文案补充自动重建语义。

**Rejected**：维持禁止删除最后一个在用角色——把一致性责任推给用户，且不解决
"删光后项目变死"的主缺陷。
