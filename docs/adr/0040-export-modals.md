# 0040 — ExportModals 导出子系统深模块
**Status**: accepted

前端导出/另存为行为横跨页面 + hook + 5 个 modal：`useExportDrawing`（414 行）返回 5 组 modal state（每组含裸 `useState` setter）加 7 个 handler，约 30 个返回值；`CADEditorDirect` 解构后把 raw setter 当 props 铺给 `DownloadFormatModal` / `ExtRefFormatModal` / `PdfExportModal` / `DwgExportModal` / `SaveAsModal`，连 modal 的 `onClose` 都要在页面里手写跨 modal 副作用（如 `downloadFormat.setShow(false)` + `saveAs.forceDownloadToLocal.current = false` + `saveAs.setBlob(null)`）。interface 面 ≈ implementation 面，是典型浅模块；「触发一次导出」的调用方必须知道 5 组 state 与 7 个 handler。消费方唯一（`CADEditorDirect.tsx:178`）。本 ADR 记录架构评审（improve-codebase-architecture，candidate「ExportModals」）定案，执行见 issue。

**Decision**

1. **自包含组件 `components/export/ExportModals.tsx` 收进整个导出/另存为子系统**：内部拥有 5 个 `CAD_EVENTS` 监听（EXPORT_FILE / EXPORT_PDF / EXPORT_DWG / EXPORT_DXF / SAVE_AS）、5 组 modal state、全部 handler（下载、转换、上传、缩略图、另存为、开新标签），并渲染 5 个 modal。interface 收敛为最小 props：
   ```tsx
   <ExportModals fileId={fileId} canExport={canExport} isAuthenticated={isAuthenticated} />
   ```
   （内部还可用 `loginPromptDismissedRef` / `currentFileHash` 等原 hook options。）
2. **`useExportDrawing` 退役**：`CADEditorDirect` 移除 ~60 行 modal JSX 与 30 值解构，改为挂载一行 `<ExportModals />`；对 5 个 modal 组件的直接 import 一并移除。
3. **跨 modal 副作用收进 implementation**：`forceDownloadToLocal` 复位、blob 清理、modal 间联动（如 save-as 转本地下载）全部在组件内部处理，不再泄漏到页面。
4. **不加新领域术语**：「导出（Export）」与「另存为（Save As）」已在 CONTEXT.md 定义，`ExportModals` 是承载它们的 UI 子系统（implementation 结构），不稀释词汇表。
5. **事件 seam 迁移**：组件内 5 个导出/另存为事件监听随 ADR-0039 的类型化 bus 迁移（`services/drawingSession/`），不使用新 window 裸字符串事件。

**Guidance**

1. 新增导出/另存为流程一律进 `ExportModals`，禁止在页面散装新 modal。
2. 导出状态不外泄；若外部确需读写，经组件 props / 命令暴露，禁止传裸 setter。
3. 遵循 ADR-0033（≤400 行硬门禁 / 300 行软目标）：`ExportModals` 内部可拆（hooks / 子 modal），保持入口组装。
4. 行为不变：引擎触发导出（`CAD_EVENTS`）→ modal 打开 → 确认 → 下载/转换/上传/开新标签的既有语义不得回归。

**Status**: accepted

**Cross-references**
- CONTEXT.md「导出（Export）」「另存为（Save As）」术语（既有，不加新词）
- ADR-0039 图纸会话深模块：导出事件监听随类型化 bus 迁移（#200）
- ADR-0029 模块入口 Façade、ADR-0033 文件拆分：`components/export/` 目录化
- 执行任务票：issue #201 ExportModals 执行（5 步序列）
