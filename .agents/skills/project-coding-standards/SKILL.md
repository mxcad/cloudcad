---
name: project-coding-standards
description: 全栈公共编码规范 — 复用优先、文件组织、反模式清单、工作流约束。触发条件：任何代码生成、新建文件、重构、提交前检查。此 Skill 被前端和后端 Skill 自动引用。
---

<what-to-do>

处理任何代码变更（新增、修改、重构、删除）时，必须遵守以下全栈公共规范。此规范高于前端/后端具体实现细节。

**核心原则**：不要复杂化，要有高级工程师的思维 —— 先观察已有模式，再动手。重构后代码量应减少，不应增加。

</what-to-do>

<supporting-info>

## 规则索引

此 Skill 包含 5 类规则。AI 应根据当前场景选择阅读相关文档：

| 规则类别 | 适用场景 | 文档 |
|---------|---------|------|
| 复用优先 | 新增任何代码前 | `docs/reuse-first.md` |
| 文件与目录约定 | 创建新文件时 | `docs/file-organization.md` |
| 反模式清单 | 代码审查、提交前 | `docs/anti-patterns.md` |
| 工作流约束 | 提交前 | `docs/workflow.md` |
| 高级工程师思维 | 始终适用 | `docs/senior-engineer-mindset.md` |

## 快速检查清单（始终适用）

1. **复用优先**：新增组件/工具函数/hook/service 前，**必须先搜索**是否已有类似实现。
   - 前端：搜索 `src/components/ui/`、`src/utils/`、`src/hooks/`
   - 后端：检查是否已有类似 Service 方法。外部消费者走 `FileSystemService` Façade；Controller 内部逻辑直接调用子 Service。

2. **文件约定**：不随意创建新文件。组件放 `src/components/<domain>/`，页面放 `src/pages/`，hook 放 `src/hooks/`，store 放 `src/stores/`，工具函数放 `src/utils/`。

3. **类型分离**：禁止将类型定义写在组件文件内 —— 类型放 `src/types/` 或就近 `<module>/types.ts`。

4. **后端分层**：Controller 只做路由委托，业务逻辑放 Service。禁止 Controller 写业务逻辑。

5. **重构原则**：目标应使代码更少、更清晰、耦合更低。避免"为抽象而抽象" —— 每增加一层抽象必须能说出具体好处。

6. **提交前**：lint → format → type-check → test（后端用 `pnpm verify`，前端用 `pnpm check && pnpm test`）。

## 全栈反模式（始终检查）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 不搜索就直接写新组件/工具函数 | 先搜索已有实现，确认无复用可能再新建 |
| 重构后代码量比原来多 | 重构应减少代码量（消除重复、简化抽象） |
| 为了抽象而抽象（加了一层又一层的封装但没有实际好处） | 只有消除重复或解耦时才抽象 |
| 把类型定义写在组件/Controller 文件内 | 提取到独立 types 文件 |
| `console.log()` | 使用 NestJS Logger（后端） |
| 随意创建新文件 | 遵守已有目录结构，放入正确位置 |
| 模块耦合严重（A import B, B import A） | 单向依赖，必要时提取公共接口 |

## 文档引用

- 领域术语与业务规则：`CONTEXT.md`
- 编码约束完整版：`CONTEXT.md##编码约束`
- 前端编码规范：加载 `frontend-coding-standards` Skill
- 后端编码规范：加载 `backend-coding-standards` Skill

## 注意事项

- 此 Skill 不包含任何"方便"选项 —— 每一条规则都是强制性的
- 如果遇到"已有实现不完美"的情况，优先复用并改进，而非重新实现一套
- 不确定规则是否适用时，宁可问用户也不要自作主张

</supporting-info>