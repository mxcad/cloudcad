# Auto Review - 未使用代码排查记录

本文件记录在死引用检查过程中无法确定或需要用户决策的问题。

格式：`[时间] 问题描述 | 涉及文件 | 建议方案`

---

## 2026-05-07

### 示例文件
- `packages/frontend/src/components/ui/Tooltip.example.tsx` 和 `packages/frontend/src/components/ui/TruncateText.example.tsx` 是示例文件，未被项目其他代码引用。
  - **建议**：如果不需要，可以删除；如果保留供开发参考，则忽略。

### 未使用的依赖
- `react-horizontal-scrolling` 在代码中未找到任何导入，可能未使用。
  - **建议**：如果确定不需要，可以从 `package.json` 中移除。
- `webuploader` 在代码中未找到任何导入，可能未使用。
  - **建议**：如果确定不需要，可以从 `package.json` 中移除。

### 未使用的 UI 组件导出
- `FileNameText`, `PathText`, `DescriptionText` 从 `TruncateText.tsx` 导出，但在项目中未被使用。
  - **建议**：如果确定不需要，可以从 `index.ts` 中移除导出，并考虑删除这些子组件。
