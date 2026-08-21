# 0039 — 图纸会话深模块（Drawing Session）
**Status**: accepted

「编辑器里正开着一张图纸」的状态长期由 ~5 个 owner 共享：`useCADEditorStore`（27 字段 / 21 个 setter，被 20+ 处直接写）、`mxcadManagerCore.ts` 模块级可变 `currentMxwebUrl` / `currentCacheTimestamp`（L34-35）、`mxcadHelpers` 模块级 `isDocumentModified`、`CADEditorDirect` 的 refs、`SidebarContainer` 本地镜像（`currentOpenFileId` / `isModified`）+ 1s `setInterval` 轮询。引擎→UI 协调靠 window 裸字符串事件：`mxcadOpenFile.ts` 3 处 `dispatchEvent('mxcad-file-opened')`、`mxcadManagerCore` 发 `'mxcad-file-open-complete'`，监听方散在 `CADEditorDirect` / `useCollabActions` / `useCollabWorks` / `SidebarContainer`，且 `CAD_EVENTS`（constants/events.ts）缺 `open-complete` / `database-modify` 两个事件、dispatch 处用裸字面量。ADR-0030 已判定 `useCADEditorStore` 为合规 Zustand 归属（保留），但「流经 store 的流程」——打开图纸要动哪几个字段、何时清 back-info、何时重置脏标记——散在 20+ 写点，interface 浅而重复。本 ADR 记录架构评审（improve-codebase-architecture，candidate「图纸会话」）定案，执行见 issue。

**Decision**

1. **引入 `services/drawingSession/` 深模块（L2，ADR-0029 带 index.ts 入口）**：
   ```ts
   openSession(info: OpenFileInfo): void              // 唯一 writer：编排 store 相关字段 + 清 back-info + 切文件重置
   closeSession(): void
   subscribe(event: DrawingEvent, cb): Unsubscribe    // 类型化事件 bus
   isModified: 响应式来源                             // 脏标记单一发布点
   useDrawingSession(): SessionState                  // React 薄读 hook
   ```
   `useCADEditorStore` 仍是状态家（ADR-0030 合规保留），session 是「唯一 writer + 编排 + 事件 seam」。消费方从 21 个裸 setter 学到 3 个命令。
2. **类型化事件 seam 取代 window CustomEvents**：`mxcadOpenFile.ts` 的 3 处 `'mxcad-file-opened'` dispatch 与 `mxcadManagerCore` 的 `'mxcad-file-open-complete'` 全部改走 session bus；`CAD_EVENTS` 补全 `open-complete` / `database-modified` 及 payload 类型；监听方（`CADEditorDirect` / `useCollabActions` / `useCollabWorks` / `SidebarContainer`）从 `window.addEventListener` 改为 `session.subscribe`。事件均为前端内部信号，无外部监听方，替换安全。
3. **`isModified` 单一来源**：脏标记收进 session 状态（`database-modified` 信号 → 置脏；save / close → 复位）；`mxcadHelpers` 的 `isDocumentModified` / `setDocumentModified` / `resetDocumentModified` 模块级函数退役。`SidebarContainer` 订阅 session 响应式 `isModified` 与当前文件状态，**删除 1s `setInterval` 轮询**与本地 `currentOpenFileId` 镜像。
4. **引擎侧写点收编**：`mxcadManagerCore` 的 `setCurrentFileInfo` / `patchCurrentFileInfo` / `clearCurrentFileInfo` 及模块级 `currentMxwebUrl` / `currentCacheTimestamp` 收进 session 实现；非 React 侧（mxcadManagerCore / mxcadOpenFile）直接 import session 服务，React 侧经 `useDrawingSession()`。
5. **消费方路由**：`CADEditorDirect` / `SidebarContainer` / `useCadFileLoader` / `useCollabActions` / `useCollabWorks` / `mxcadManagerCore` 全部经 session，禁止组件再直接写 store 裸 setter。

**Guidance**

1. 打开/切换/关闭图纸的状态变更只经 `openSession` / `closeSession`；禁止组件直接调 `useCADEditorStore` 的裸 setter。
2. 新增引擎→UI 信号必须上 session bus 并带 payload 类型，禁止新造 window 裸字符串事件。
3. ADR-0030 归属规则不变；session 是 store 的 writer 权威，不是新的状态容器。
4. 遵循 ADR-0033 文件规模（≤400 行硬门禁 / 300 行软目标），drawingSession 目录内部可拆（bus / session / hook）。
5. 改造需保持行为不变：SSE / 上传 / 协同 / 保存流程的既有信号语义不得因 bus 迁移而改变。

**Status**: accepted

**Cross-references**
- CONTEXT.md「图纸会话（Drawing Session）」术语（本次评审落账）
- ADR-0030 前端状态归属：store 合规保留，session 为 writer 权威
- ADR-0029 前端模块入口 Façade：`services/drawingSession/` 带 index.ts 入口
- ADR-0033 前端文件拆分：drawingSession 内部可拆，遵守行数门禁
- 执行任务票：issue #200 图纸会话执行（6 步序列）
