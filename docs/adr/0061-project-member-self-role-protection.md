# 0061 — 项目成员自改角色 / 自移除保护（Project member self-role protection）

**Status**: accepted

项目成员管理中，成员修改自己的角色或把自己移出项目会引发「自我锁死」：一个持有 `PROJECT_MEMBER_ASSIGN`（或 `PROJECT_MEMBER_MANAGE`）权限的成员可以把自己降级到无管理权限的角色、或直接把自己移出项目，之后既无法改回也无法自行恢复，只能由 owner/管理员兜底。本决策规定：项目角色与成员去留统一由管理者（项目所有者/管理员）分配，成员不得修改自己的角色、不得把自己移出项目。

**Decision**

1. **后端权威校验**（`packages/backend/src/file-system/project-member/project-member.service.ts`）：
   - `updateProjectMember`：在「不能修改项目所有者角色」守卫之后新增 `operatorId === userId` 守卫，命中抛 `ForbiddenException`（i18n `error.project_member.cannot_modify_self_role`）。
   - `removeProjectMember`：在「不能移除项目所有者」守卫之后新增 `operatorId === userId` 守卫，命中抛 `ForbiddenException`（i18n `error.project_member.cannot_remove_self`）。
   - 两个守卫都放在 owner 守卫之后，保证 owner 改/删自己仍返回既有的 owner 专属文案而非新文案。
   - 批量端点 `batchUpdateProjectMembers` / 单条删除复用同一方法，自动被覆盖，无需额外改动。
2. **前端只读降级**（`packages/frontend/src/components/modals/MembersModal.tsx`）：
   - 引入 `useAuth` 取当前用户 `user.id`，成员行计算 `isSelf = currentUserId === member.userId`。
   - 自己行的角色控件由可编辑 `<select>` 降级为只读 `<Tag>`（展示当前角色名）+ `Tooltip`「您的角色由项目所有者/管理员统一分配」，与 owner 行的只读展示风格一致。
   - 自己行的「移除成员」按钮禁用并提示「不能移除自己」。
3. **i18n**：`error.project_member.cannot_modify_self_role` / `cannot_remove_self` 写入 zh-CN / zh-TW / en-US / ko-KR 四个语言文件。
4. **回归测试**：新建 `project-member.service.spec.ts`，覆盖非 owner 自改角色、自移除均抛 Forbidden，以及 owner 自改/自移除仍走 owner 守卫（防回归）。

**Rejected options**

- **仅前端禁用自己行**：前端可被绕过（直接调 API），锁死风险仍在；后端权威校验是唯一可靠的兜底，前端只做体验降级。
- **允许自我降级但加二次确认弹窗**：用户可能误确认，锁死后仍需他人兜底，且自助降级与「角色统一分配」的产品语义冲突。
- **按「目标角色是否仍含管理权限」做前瞻校验**（仅禁止降级到无权角色）：实现需读取目标角色权限集合并判断，逻辑复杂且难以覆盖「自移除」等同类缺口；一刀切禁止自改/自移除最简单且语义清晰。

**Cross-references**

- ADR-0051 项目角色模板化与项目自治（owner 数据驱动保护、删除降级自愈）
- ADR-0027 共享 Prisma Client（`@cloudcad/db` 枚举唯一出口）
- `packages/backend/src/file-system/project-member/project-member.service.ts`
- `packages/frontend/src/components/modals/MembersModal.tsx`
