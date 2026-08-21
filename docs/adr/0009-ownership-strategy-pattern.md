# OwnershipStrategy 收拢 Project/PersonalSpace/Library 三路分支

> **⚠️ Status: superseded（未实施）** — 本 ADR 的 5 步增量迁移计划仅完成 Step 1（新建 `ownership/` 模块，2026-07-27），Step 2-5 未执行。
> 归属权限分派最终由 **ADR-0037 的 `NodeMutationGuard`**（file-operations/，2026-08-06 落地）内联实现，`OwnershipPermissionFactory` 至今无消费者。
> 现状与决策：见 issue #228（ownership 模块与 NodeMutationGuard 逻辑重复，待决策合并或删除）。

`FileSystemNode` 的三种归属类型（PROJECT、PERSONAL_SPACE、LIBRARY_DRAWING/LIBRARY_BLOCK）在权限检查、版本策略、成员管理、配额类型上有不同的行为规则。目前代码中散布约 70 处 `if/else` 三路分支来区分它们。我们用两层模型收拢：权限维度使用 `OwnershipPermissionStrategy` 策略接口，其余维度使用 `OWNERSHIP_CONFIG` 数据映射。

**Status**: superseded

**Considered Options**

1. **策略接口 + 数据映射（chosen）** — 权限（复杂、多态）用策略接口，版本/成员/配额（简单、枚举）用中心化配置。符合项目已有模式（IAuthProvider、IPermissionStore）。
2. **纯策略接口** — 全部行为塞进一个策略，导致简单字段（`hasMembers: boolean`）也被接口化，增加毫无必要的复杂度。
3. **保持现状** — 70 处散落分支继续增长，每加一个新功能都要手动补三路判断，犯错概率线性增长。

**Consequences**

- `packages/backend/src/` 新增 `ownership/` 模块，包含策略接口、三个实现、工厂函数
- 现有 `require-project-permission.guard.ts` 等 30+ 文件消除三路分支，改为策略委托
- 新增归属类型时（如未来可能的 TEMPLATE/ARCHIVE），只需新增一个策略实现 + 一行 config 映射
- 与 ADR-0003（IPermissionStore）、ADR-0006（IAuthProvider）保持一致的手感
- Prisma schema 无需变更
