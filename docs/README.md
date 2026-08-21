# CloudCAD 文档导航

`docs/` 只保留权威文档；历史一次性产物（审计、评审、计划、PRD、handoff、HTML 报告）统一归档于 [`docs/archive/`](archive/README.md)。分类与维护规则见 [ADR-0048](adr/0048-documentation-governance.md)。

## 权威文档

| 文档 | 用途 |
|------|------|
| [`codebase-guide.md`](codebase-guide.md) | 代码库全景指南（包、目录、关键流程） |
| [`elastic-conversion-architecture.md`](elastic-conversion-architecture.md) | 转换架构 + 容量规划（调 `maxConcurrent` 前必读） |
| [`adr/README.md`](adr/README.md) | 架构决策记录索引（47 个 ADR，含状态） |
| [`agents/`](agents/) | 工程技能配置（issue-tracker / domain / triage-labels） |
| [`archive/README.md`](archive/README.md) | 归档目录说明与分类 |

## 引用关系

- 根目录 `AGENTS.md` 是 AI 行为总纲（快速索引、反模式、工作流）——一切规范以它和对应技能为准。
- `CONTEXT.md`（根）为全局领域术语表；`CONTEXT-MAP.md` 为多上下文映射。
- 各编码规范文档已由 `.agents/skills/`、`.opencode/skills/` 下的技能目录接管（各自带 `docs/` 子文档）。

## 维护规则

- 新增一次性产出 → 直接进 `docs/archive/<类别>/`，不写 `docs/` 根。
- 新增/修改 ADR → 遵循 [ADR-0048](adr/0048-documentation-governance.md) 状态与编号规则。
- 本文档与 AGENTS.md 快速索引是本目录的唯一导航入口。
