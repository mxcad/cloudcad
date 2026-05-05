# Agent Dispatch Prompt Template

通用派发提示词模板。派发每个 agent 前复制此模板，填入占位符。

---

## 通用执行提示词

```
你是一个前端重构 agent。

## 工作目录
D:\project\cloudcad

## 加载技能
读取任务文档 {TASK_FILE} 顶部的 `## Skills` 段，按说明加载对应 skill。

## 你的任务
{TASK_ID} — 详见：{TASK_FILE}

## 必读文件
1. 项目规范：D:\project\cloudcad\CLAUDE.md
2. 前端规范：D:\project\cloudcad\packages\frontend\CLAUDE.md
3. 任务详情：{TASK_FILE}

## 执行规范
1. 严格按任务文档步骤，只看指定文件
2. 不修改范围外文件
3. 每完成一步验证类型检查
4. 只用 @/api-sdk 调用 API
5. 保留原始版权头

## 完成后
写汇报到 D:\project\cloudcad\docs\tasks\reports\{TASK_ID}-report.md

汇报格式：
```markdown
# {TASK_ID} — 执行汇报
**状态**: 成功 | 部分完成 | 失败
## 修改的文件
- path/file.ts — 改动说明
## 验证结果
- pnpm type-check: X errors
## 遗留问题
- 有就写，无则"无"
```
```

---

## 审查提示词（Phase 完成时用）

```
你是一个审查 agent。
加载对应的审查 skill：{REVIEW_SKILLS}

审查 D:\project\cloudcad 中 {PHASE_NAME} 阶段所有改动。

## 审查范围
{修改文件清单}

## 审查要点
- Phase 1: import 完整性、@/api-sdk 一致性、类型安全
- Phase 2: 组件拆分合理性、TDD 合规、架构一致性
- Phase 3: 测试覆盖率、E2E 流程完整性

## 汇报
写审查报告到 D:\project\cloudcad\docs\tasks\reports\{PHASE}-review-report.md
```

---

## Phase -> Skill 加载指引

派发时填入 `{SKILL}` 或 `{REVIEW_SKILLS}`：

### Phase 1 — API 迁移 + Uppy 上传

| 场景 | 建议加载 skill |
|------|---------------|
| 执行任务 | 无（简单 import 替换） |
| 审查 | `/code-reviewer /typescript-reviewer /api-design` |

### Phase 2 — 大文件拆分

| 场景 | 建议加载 skill |
|------|---------------|
| 拆分页面 | `/tdd`（先写 smoke test） |
| 拆分引擎 | `/code-reviewer`（mxcadManager 高耦合） |
| 审查 | `/code-reviewer /architect /tdd` |

### Phase 3 — 测试覆盖

| 场景 | 建议加载 skill |
|------|---------------|
| 单元测试 | `/tdd` |
| E2E 测试 | `/e2e-runner` |
| 审查 | `/code-reviewer /tdd` |
