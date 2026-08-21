# Legacy Skill: api-contracts

API 类型契约的详细规则已整合到 `frontend-coding-standards` Skill 中。

## 触发场景

- 类型缺失、DTO 找不到
- `has no exported member` 错误
- `is not a function` 错误
- 前端需要定义 API 类型

## 核心规则

先查后端 DTO 的 `@ApiProperty`，禁止前端本地定义类型。

## 详细文档

- 当前规范：`frontend-coding-standards/docs/api-contracts.md`
- 原始 Skill：`.agents/skills/api-contracts/SKILL.md`
