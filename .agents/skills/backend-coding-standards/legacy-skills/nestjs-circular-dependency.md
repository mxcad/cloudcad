# Legacy Skill: nestjs-circular-dependency

NestJS 循环依赖的详细规则已整合到 `backend-coding-standards` Skill 中。

## 触发场景

- `Circular dependency` 错误
- `forwardRef` 使用
- 模块相互导入

## 核心规则

模块依赖单向 DAG，数据库关系可双向。`forwardRef` 已在 AuthModule 中移除。

## 详细文档

- 当前规范：`backend-coding-standards/docs/nestjs-di.md`
- 原始 Skill：`.agents/skills/nestjs-circular-dependency/SKILL.md`
