# Legacy Skill: permission-system

权限系统的详细规则已整合到 `frontend-coding-standards` 和 `backend-coding-standards` Skill 中。

## 触发场景

- 权限检查、角色管理
- `@RequirePermissions` / `@RequireProjectPermission` 装饰器
- 权限相关 UI 逻辑

## 核心规则

双层权限架构（系统+项目），严格调用链 Controller→Guard→Service→Cache→DB。

## 详细文档

- 前端：`frontend-coding-standards/docs/permission-system.md`
- 后端：`backend-coding-standards/docs/permission-system.md`
- 原始 Skill：`.agents/skills/permission-system/SKILL.md`
