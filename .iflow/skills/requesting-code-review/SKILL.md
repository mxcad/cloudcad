---
name: requesting-code-review
description: 当完成任务、实施主要功能或合并之前使用，以验证工作是否符合要求
---

# 请求代码审查

调度 superpowers:code-reviewer 子代理在问题级联之前捕获它们。

**核心原则：** 早期审查，经常审查。

## 何时请求审查

**必需：**

- 子代理驱动开发中的每个任务之后
- 完成主要功能后
- 合并到 main 之前

**可选但有价值：**

- 卡住时（新视角）
- 重构前（基线检查）
- 修复复杂错误后

## 如何请求

**1. 获取 git SHA：**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # 或 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 调度 code-reviewer 子代理：**

使用 Task 工具和 superpowers:code-reviewer 类型，填写 `code-reviewer.md` 中的模板

**占位符：**

- `{WHAT_WAS_IMPLEMENTED}` - 你刚刚构建的内容
- `{PLAN_OR_REQUIREMENTS}` - 它应该做什么
- `{BASE_SHA}` - 起始提交
- `{HEAD_SHA}` - 结束提交
- `{DESCRIPTION}` - 简要摘要

**3. 对反馈采取行动：**

- 立即修复关键问题
- 在继续前修复重要问题
- 稍后记录次要问题
- 如果审查者错误则反驳（带理由）

## 示例

```
[刚刚完成任务 2：添加验证函数]

你：让我在继续前请求代码审查。

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[调度 superpowers:code-reviewer 子代理]
  WHAT_WAS_IMPLEMENTED: 对话索引的验证和修复函数
  PLAN_OR_REQUIREMENTS: docs/plans/deployment-plan.md 中的任务 2
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: 添加了 verifyIndex() 和 repairIndex()，包含 4 种问题类型

[子代理返回]：
  优势：干净的架构，真实的测试
  问题：
    重要：缺少进度指示器
    次要：报告间隔的魔术数字（100）
  评估：准备好继续

你：[修复进度指示器]
[继续到任务 3]
```

## 与工作流集成

**子代理驱动开发：**

- 每个任务后审查
- 在问题复合前捕获它们
- 在移动到下一个任务前修复

**执行计划：**

- 每个批次（3 个任务）后审查
- 获取反馈，应用，继续

**临时开发：**

- 合并前审查
- 卡住时审查

## 红旗

**从不：**

- 因为"简单"而跳过审查
- 忽略关键问题
- 继续未修复的重要问题
- 与有效的技术反馈争论

**如果审查者错误：**

- 用技术推理反驳
- 显示证明它工作的代码/测试
- 请求澄清

见模板：requesting-code-review/code-reviewer.md
