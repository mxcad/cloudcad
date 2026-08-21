# 0048 — 文档治理（Documentation governance）

`docs/` 长期混入一次性会话产物（审计、评审、HTML 报告、plan/handoff/prd），ADR 编号出现冲突（0022 双文件）且多数无状态标记，`DOCUMENTATION_MAP.md` 引用过半失效文档。本 ADR 定下文档分类、归档规范与 ADR 治理规则，作为后续所有文档维护的判定标准。

## 决策

1. **docs/ 三分类**：`docs/` 只保留**权威文档**（AGENTS.md/CLAUDE.md/技能引用的规范、ADR、agents 配置、codebase-guide、elastic-conversion-architecture）；**一次性产物**（审计、评审、计划、PRD、handoff、HTML 报告）一律移入 `docs/archive/` 分类子目录，**归档不删除**（git 历史是最后兜底）；错位/重复/空壳文档直接删除。
2. **archive 规范**：`docs/archive/` 下按类别分子目录（audit/code-review/html/plans/reviews/handoff/prd/phase/sdd/research/test-fix-prompts/standards/…），档案文件不得再被权威文档引用；归档原则见 `docs/archive/README.md`。
3. **ADR 状态模型**：每个 ADR 首行后必须有 `**Status**: accepted | superseded by ADR-NNNN`（superseded 保留原文供追溯）；被取代时只更新原 ADR 的状态行，不删除。
4. **编号唯一性**：ADR 编号全局唯一；冲突时保留被引用的文件，重编号零引用的文件；新 ADR 编号 = 当前最大编号 + 1。索引见 `docs/adr/README.md`。

## 后果

- 新增一次性产出（评审报告、handoff 等）不再写入 `docs/` 根或 `docs/adr/`，直接进 `docs/archive/`。
- 新决策必须按 0047 之后编号追加并补 Status 行；修改既有 ADR 时检查其 superseded 链。
- 废弃 `DOCUMENTATION_MAP.md`，导航职责由 `docs/README.md` + AGENTS.md 快速索引承担。
