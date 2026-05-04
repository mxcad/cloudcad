# Agent Dispatch Prompt

Copy this prompt and fill in `{TASK_ID}` and `{TASK_FILE}` for each agent.

---

## Prompt (copy this)

```
你的任务：执行前端重构任务 {TASK_ID}。

## 工作目录
D:\project\cloudcad\packages\frontend

## 必读文件
1. 任务说明：docs/tasks/{TASK_FILE}
2. API 迁移参考：docs/tasks/API-MIGRATION-REFERENCE.md
3. 项目规范：CLAUDE.md（工作目录下）

## 要求
1. 严格按任务文档的步骤执行
2. 遵循 API-MIGRATION-REFERENCE.md 中的编码规范
3. 每完成一步验证 `pnpm type-check` 不引入新错误
4. TDD 任务先写测试再写实现

## 完成后，在 docs/tasks/reports/ 目录写入一份简要汇报文件

文件名：`{TASK_ID}-report.md`

汇报格式：
```markdown
# {TASK_ID} 执行汇报

**状态**: [ ] 成功 / [ ] 部分完成 / [ ] 失败

## 修改的文件
- path/to/file1.ts — 做了什么改动
- path/to/file2.ts — 做了什么改动

## 编写的测试
- path/to/test.spec.ts — 覆盖了什么

## 测试结果
- pnpm test: X passed, X failed
- pnpm type-check: X errors

## 遗留问题
- 如果有，描述清楚；如果没有，写"无"

## 备注
- 任何需要注意的事项
```

## 重要提醒
- 只改任务文档指定的文件，不要顺手改别的
- 不要删除其他任务负责的文件（特别是 projectsApi.ts 由 T12 负责删除）
- 如果遇到无法解决的问题，在汇报中写清楚，不要强行绕过
```
