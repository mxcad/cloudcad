# docs/archive — 历史归档

**只归档、不删除、不引用**。本目录存放已完成的一次性会话产物（审计、评审、计划、PRD、handoff、报告），供追溯参考；**权威文档不得引用归档文件**，归档文件内容不代表当前系统状态。

## 分类

| 子目录 | 内容 |
|--------|------|
| `audit/` | 模块/系统审计报告（P0/P1 修复验证等） |
| `code-review/` | 两轮代码评审报告（round-1 / round-2） |
| `html/` | 架构评审 HTML 报告 |
| `plans/` | 功能/重构计划（billing、mobile-cad、drawing-share 等） |
| `reviews/` | UX / Code Review 总结 |
| `handoff/` | 会话交接文档（auth-bugfix、desktop-client 等） |
| `prd/` | 已完成的 PRD |
| `phase/` | 阶段性计划文档 |
| `sdd/` | 软件设计描述（含 .feature 用例） |
| `research/` | 技术调研笔记 |
| `test-fix-prompts/` | 测试修复提示集 |
| `functionality-audit/` | 功能审计编排文档 |
| `frontend-mobile/`、`frontend-mobile-code-docs/` | 移动端历史文档 |
| `ddd/` | 早期 DDD 战略映射 |
| `architecture/` | 早期架构说明书（已过时） |
| `standards/` | 已被技能接管的旧规范文档（file-storage-paths、testing-strategy、git-commit-workflow 等） |

根目录另有少量遗留杂项（all_chinese.txt、部署说明.txt 等）。

## 规则

1. 新归档进 `docs/archive/<类别>/`，子目录按上表命名；无匹配类别时新建并在此登记。
2. 不删除历史归档（git 历史可回溯，但归档保留快速可查上下文）。
3. 归档文件不更新、不修复——它们是一次性的。
