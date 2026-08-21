---
name: cloudcad-workflow
description: CloudCAD 前端三阶段重构工作流入口。支持 /workflow status|dispatch|review|archive 四种模式。
trigger: 每次对话先加载此 skill。
---

# CloudCAD 三阶段工作流

## 数据架构

```
docs/phase/0X-xxx.md         ← 唯一状态数据源（状态表 + 已知问题 Known Issues）
docs/tasks/phaseN-xxx/TXX.md ← 任务文档（YAML front matter + Prompt）
docs/tasks/archived/         ← ✅ 完成的 Phase
docs/tasks/reports/          ← agents 报告 + 审查报告
```

---

## 命令模式

### `/workflow status`

AI 读当前 Phase doc 状态表，输出：
```
Phase 1: 7/7 ✅  审查待完成
Phase 2: 0/12 📋 阻塞于: Phase 1 审查
```

### `/workflow dispatch TXX`

AI 从任务文档读取 front matter + Prompt，打印完整派发内容。

### `/workflow review`

Phase 全部 ✅ 后调用。AI：
1. 读取所有任务报告，收集修改文件清单
2. 从 Phase doc 读取 `## Known Issues` 作为审查豁免项
3. 生成审查提示词（含可执行的验证命令）
4. 提示词末尾要求：发现的阻塞性问题必须建议新 Task ID

### `/workflow archive`

审查通过后调用。AI：
1. 归档文件
2. 读取所有报告写 POSTMORTEM.md（含成功/失败模式、数据）
3. 审查发现的阻塞问题加回 Phase doc 状态表作为新任务
4. 激活下一 Phase

---

## 推进循环

```
1. "/workflow status"
2. "/workflow dispatch TXX"
3. agent 执行 → git commit → 写报告
4. "TXX 完成了"
5. 更新状态表
     ↓ 重复
6. "/workflow review" → agents 审查（含验证命令）
7. 审查发现阻塞问题 → 加入状态表 → 修复 → 回到 6
8. "/workflow archive" → 归档 + 总结经验 → 激活下一 Phase
```

---

## 任务文档格式规范

每个任务文档必须包含 YAML front matter：

```yaml
---
id: TXX
phase: N
group: concurrent | sequential
depends_on: []     # 此前置任务 ID 列表
skills: []         # /tdd, /code-reviewer 等
files:
  - path/to/file.ts
commit_format: "feat: migrate TXX - {filename}"
---
```

正文结构：

```markdown
# TXX — 任务名

## Skills
...

## Prompt
复制以下内容给 agent：
```
{AGENT}，执行 TXX。
...
```

## Dependency
...

## Known Issues
(本任务已知的预存问题，审查时自动排除)

## Instructions
...

## Verify
```bash
cd packages/frontend && grep -rn 'getApiClient' src --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v '\.spec\.'
# 应返回空
```
...

## Report
Write to docs/tasks/reports/TXX-report.md
```

---

## Phase doc 状态表格式

```
| # | 任务 | 子组 | 状态 | 报告 | 阻塞于 | 审查发现 |
|---|------|------|------|------|--------|---------|
| T20 | 外部参照直调 SDK | 顺序 | ✅ | T20-report | T17 | — |
```

- **阻塞于**: 此任务的前置条件。空表示无阻塞
- **审查发现**: 审查时发现的阻塞性问题链接，如 `T22-fix-xxx`

---

## 审查提示词模板

```
## 审查: Phase N

### 验证命令
- `grep -rn 'getApiClient' packages/frontend/src --include="*.ts" --include="*.tsx"  | grep -v spec` → 应空
- `cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit` → exit 0
- `grep -rn 'from.*services/nodeApi' packages/frontend/src --include="*.ts" --include="*.tsx"` → 应空

### 审查范围
{文件清单}

### 已知问题（自动排除）
{Phase doc 中的 Known Issues 列表}

### 审查要点
1. import 指向存在的文件
2. API 调用全部 @/api-sdk
3. 无 getApiClient 残留
4. 无死代码

### 输出要求
- 阻塞性问题必须建议新 Task ID（如 T22-fix-xxx）
- 写入 docs/tasks/reports/phaseN-review-report.md
```

---

## Agent git 规范

Prompt 段必须包含：
```
完成后 git commit，消息格式: "feat: migrate TXX - {filename}"
```
