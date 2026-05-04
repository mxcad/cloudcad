---
name: decompose
description: Decompose large refactoring/feature work into independent concurrent task documents for multi-agent dispatch. Use when the user has a complex multi-file task and wants to parallelize across agents.
---

# /decompose — 任务分解与并发派发

适用场景：用户提出大型重构/功能需求，涉及多个文件、多个模块，希望拆分为独立任务并发执行。

## 触发条件

用户请求满足以下任一条件时，**主动询问是否采用此模式**：
- 涉及 5+ 个文件的修改
- 跨多个模块/目录的重构
- 用户明确提到"拆分""并发""多个 agent""分配任务"
- 工作量估计超过 2 小时

询问话术："这个任务涉及面比较广，要不要我用 /decompose 模式——先和你对齐决策，然后拆成独立任务文档让你并发派给多个 agent？"

## 工作流程

### Phase 1: 勘探（Codebase Exploration）

启动 2-3 个 Explore agent 并发探索代码库，收集：
- 目录结构和文件大小分布
- 依赖关系和循环引用
- 类型错误和编译状态
- 代码质量指标（console、any、错误处理、测试覆盖）
- 相关模块的调用图

### Phase 2: 对齐（Grill Interview）

逐个向用户提问，每次一个问题，等待回答后再继续。覆盖：
- 目标范围（稳定性/可维护性/测试/全范围）
- 高风险文件的处理策略
- API 层/架构统一的方案选择
- 巨型文件的拆分策略
- 测试策略（TDD/先拆后测/只测关键路径）
- 执行顺序和依赖关系
- 阶段划分和优先级
- 贯穿规则（编码规范、导入路径、错误处理）

每个决策记录到方案文档。

### Phase 3: 方案（Plan Document）

在对齐过程中实时产出 `docs/<plan-name>.md`，包含：
- 所有决策的汇总表
- 分阶段的工作范围
- 贯穿规则
- 风险缓解措施

### Phase 4: 分解（Task Decomposition）

1. **识别门禁任务** — 哪些工作必须最先完成（如环境修复、类型生成）
2. **确定并发边界** — 分析文件间的依赖，确保任务无共享文件冲突
3. **分组平衡** — 将小文件合并为批处理任务，大文件独立成任务，保持工作量均匀
4. **创建共享参考** — `docs/tasks/API-MIGRATION-REFERENCE.md` 或等效的共享规范文档
5. **为每个任务写独立文档** — 放在 `docs/tasks/TXX-name.md`，包含：
   - 依赖关系
   - 输入文件
   - 分步指令
   - 验证标准
   - 预估工作量

### Phase 5: 派发（Dispatch）

1. 创建 `docs/tasks/TASKS-INDEX.md` — 任务调度索引，含依赖图和冲突说明
2. 创建/更新 `docs/tasks/AGENT-PROMPT.md` — 通用派发提示词模板
3. 提示词要求：
   - 使用绝对路径（agent 工作目录可能不同）
   - 明确必读文件列表
   - 规定汇报格式（状态/修改文件/测试结果/遗留问题）
   - 汇报文件写入 `docs/tasks/reports/TXX-report.md`

### Phase 6: 汇总（Post-Dispatch）

所有 agent 完成后，读取 `docs/tasks/reports/` 下所有 report：
- 汇总成功/失败状态
- 对失败或部分完成的任务，分析原因并决定后续
- 检查是否有冲突（两个 agent 改了同一文件）
- 运行最终验证：`pnpm type-check` + `pnpm test`
- 报告总体完成情况

## 关键原则

- **绝对路径** — 所有文档引用使用绝对路径，因为 agent 工作目录可能不同
- **无共享文件** — 每个任务操作的文件集不重叠，确保真正并发
- **门禁先行** — 环境修复、类型生成等基础设施任务必须最先完成
- **TDD 优先** — 重构任务先写冒烟测试，再动代码
- **汇报必达** — 每个 agent 必须写入标准格式的汇报文件，便于自动化汇总

## 参考文件

- 派发提示词模板：`docs/tasks/AGENT-PROMPT.md`（本仓库已有，可直接复用）
- 汇报格式：见 AGENT-PROMPT.md 中的模板
