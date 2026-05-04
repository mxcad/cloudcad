# 前端 CustomEvent 审计

本文档扫描了 packages/frontend/src/ 中所有使用 `window.dispatchEvent` 和 `window.addEventListener` 的位置，用于后续收敛到 `useCadEvents`。

---

## 1. 事件发出方 (dispatchEvent)

### 1.1 mxcad-file-opened

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 1143 | `openUploadedFile` | `{ fileId, parentId, projectId }` | 打开上传后的文件 |
| 1226 | `openLibraryDrawing` | `{ fileId, parentId, projectId, fileUrl, fileName, libraryKey }` | 打开图纸库文件 |
| 1324 | `openLibraryBlock` | `{ fileId, parentId, projectId, fileUrl, fileName, libraryKey }` | 打开图块库文件 |

**用途**：通知 URL 更新、侧边栏更新等

---

### 1.2 public-file-uploaded

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 1494 | `handlePublicUpload` | `{ fileHash, fileName, noCache, callback }` | 公开文件上传完成 |

**用途**：触发外部参照检查，完成后回调打开文件

---

### 1.3 mxcad-new-file

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 1768 | (未明确函数名) | (未明确) | 新建文件 |

**用途**：通知新建文件事件

---

### 1.4 mxcad-save-required

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 1796 | (未明确) | `{ action: string }` | 需要保存 |
| 1865 | (未明确) | `{ action: 'login' }` | 登录后需要保存 |
| 1877 | (未明确) | `{ action: 'save' }` | 保存操作 |

**用途**：触发保存确认弹框

---

### 1.5 mxcad-open-sidebar

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 1822 | (未明确) | (未明确) | 打开侧边栏 |
| 1835 | (未明确) | (未明确) | 打开侧边栏（另一处） |

**用途**：打开/聚焦侧边栏

---

### 1.6 mxcad-save-as

**文件**：`packages/frontend/src/services/mxcadManager.ts`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 2358 | (未明确) | (未明确) | 另存为 |

**用途**：触发另存为弹框

---

### 1.7 mxcad-theme-changed

**文件**：`packages/frontend/src/contexts/ThemeContext.tsx`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 230 | `setTheme` | `{ theme: Theme }` | 主题变化 |

**文件**：`packages/frontend/src/pages/CADEditorDirect.tsx`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 319 | (未明确) | `{ theme: Theme }` | CAD 编辑器中主题变化 |

**用途**：通知 mxcadManager 主题变化，更新编辑器样式

---

### 1.8 cloudcad:toast (TOAST_EVENT)

**文件**：`packages/frontend/src/contexts/NotificationContext.tsx`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 43 | `globalShowToast` | `{ message, type }` | 全局 Toast |

**用途**：从非 React 代码（如 mxcadManager）显示 Toast

---

### 1.9 cloudcad:confirm (CONFIRM_EVENT)

**文件**：`packages/frontend/src/contexts/NotificationContext.tsx`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 64 | `showGlobalConfirm` | ConfirmOptions | 全局确认弹框 |

**用途**：从非 React 代码显示确认弹框

---

### 1.10 cloudcad:confirm-response

**文件**：`packages/frontend/src/contexts/NotificationContext.tsx`

| 行号 | 位置 | detail 数据 | 说明 |
|------|------|-------------|------|
| 156 | ConfirmDialog 中 | `{ confirmed: boolean }` | 确认弹框响应 |

**用途**：从确认弹框返回结果

---

## 2. 事件监听方 (addEventListener)

### 2.1 mxcad-file-opened

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `components/sidebar/SidebarContainer.tsx` | 197 | `handleFileOpened` | 更新侧边栏显示当前文件信息 |

---

### 2.2 mxcad-database-modify

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `components/sidebar/SidebarContainer.tsx` | 198 | `handleDatabaseModify` | 数据库修改时更新侧边栏 |

---

### 2.3 mxcad-theme-changed

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `contexts/ThemeContext.tsx` | 103 | `handleThemeChange` | 响应主题变化（通过 storage 或 CAD 编辑器） |

---

### 2.4 public-file-uploaded

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 785 | `handlePublicFileUploaded` | 处理公开文件上传，检查外部参照 |

---

### 2.5 mxcad-save-required

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 869-900+ | (未明确函数名) | 响应保存要求，显示保存确认弹框 |

---

### 2.6 mxcad-export-file

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 933 | `handleExportEvent` | 处理导出事件 |

---

### 2.7 mxcad-save-as

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 965+ | (未明确) | 处理另存为事件，显示 SaveAsModal |

---

### 2.8 mxcad-open-sidebar

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 1051+ | (未明确) | 处理打开侧边栏事件 |

---

### 2.9 mxcad-new-file

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 1073 | `handleNewFile` | 处理新建文件事件 |

---

### 2.10 cloudcad:toast (TOAST_EVENT)

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `contexts/NotificationContext.tsx` | 163 | `handleToastEvent` | 处理全局 Toast 事件 |

---

### 2.11 cloudcad:confirm (CONFIRM_EVENT)

| 文件 | 行号 | 处理函数 | 用途 |
|------|------|----------|------|
| `contexts/NotificationContext.tsx` | 164 | `handleConfirmEvent` | 处理全局确认事件 |

---

### 2.12 浏览器原生事件

以下是标准浏览器事件，**不需要收敛**到 useCadEvents：

| 事件 | 文件 | 行号 | 用途 |
|------|------|------|------|
| `beforeunload` | `services/mxcadManager.ts` | 168 | 浏览器关闭前检查未保存更改 |
| `hashchange` | `hooks/useWechatAuth.ts` | 80 | 处理微信登录回调 URL hash 变化 |
| `storage` | `contexts/ThemeContext.tsx` | 90 | 多标签页主题同步 |
| `storage` | `contexts/AuthContext.tsx` | 387 | 多标签页登录状态同步 |
| `resize` | `hooks/useBreadcrumbCollapse.ts` | 100, 145 | 面包屑折叠响应窗口大小 |
| `resize` | `components/ui/Tooltip.tsx` | 175 | 工具提示位置调整 |
| `resize` | `components/tour/TourTooltip.tsx` | 255 | 引导提示位置调整 |
| `resize` | `components/tour/TourOverlay.tsx` | 343 | 引导覆盖层调整 |
| `resize` | `components/common/ResourceList.tsx` | 238, 540 | 资源列表响应大小 |
| `resize` | `components/ProjectDrawingsPanel.tsx` | 1321, 1375 | 图纸面板响应大小 |
| `resize` | `components/InteractiveBackground.tsx` | 33 | 交互式背景响应大小 |
| `resize` | `components/CategoryTabs.tsx` | 174 | 分类标签响应大小 |
| `scroll` | `hooks/useBreadcrumbCollapse.ts` | 144 | 面包屑滚动监听 |
| `scroll` | `components/ui/Tooltip.tsx` | 175 | 工具提示滚动监听 |
| `scroll` | `components/tour/TourOverlay.tsx` | 344 | 引导覆盖层滚动监听 |
| `scroll` | `components/file-item/FileItemMenu.tsx` | 155 | 文件菜单滚动监听 |
| `scroll` | `components/common/ResourceList.tsx` | 237 | 资源列表滚动监听 |
| `scroll` | `components/ProjectDrawingsPanel.tsx` | 1320 | 图纸面板滚动监听 |
| `keydown` | `components/KeyboardShortcuts.tsx` | 45 | 键盘快捷键监听 |
| `mousemove` | `components/InteractiveBackground.tsx` | 39 | 交互式背景鼠标移动 |

---

## 3. 事件汇总表

### 3.1 自定义事件清单

| 事件名 | 发出文件 | 监听文件 | 需要收敛 | 优先级 |
|--------|----------|----------|----------|--------|
| `mxcad-file-opened` | mxcadManager.ts | SidebarContainer.tsx | 是 | P0 |
| `mxcad-database-modify` | (未在本扫描中找到发出方) | SidebarContainer.tsx | 是 | P0 |
| `public-file-uploaded` | mxcadManager.ts | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-save-required` | mxcadManager.ts | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-export-file` | (未找到发出方) | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-save-as` | mxcadManager.ts | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-open-sidebar` | mxcadManager.ts | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-new-file` | mxcadManager.ts | CADEditorDirect.tsx | 是 | P0 |
| `mxcad-theme-changed` | ThemeContext.tsx, CADEditorDirect.tsx | ThemeContext.tsx | 是 | P1 |
| `cloudcad:toast` | NotificationContext.tsx | NotificationContext.tsx | 是 | P1 |
| `cloudcad:confirm` | NotificationContext.tsx | NotificationContext.tsx | 是 | P1 |
| `cloudcad:confirm-response` | NotificationContext.tsx | (未找到监听方) | 是 | P1 |

---

## 4. 收敛建议

### 4.1 useCadEvents 接口设计建议

```typescript
// composables/useCadEvents.ts 中的事件类型
interface CadEvents {
  // 文件相关
  'file-opened': (data: { fileId: string; parentId?: string; projectId?: string; libraryKey?: 'drawing' | 'block' }) => void;
  'database-modify': () => void;
  'new-file': () => void;
  'save-required': (data: { action: string }) => void;
  'save-as': () => void;
  'export-file': () => void;
  'open-sidebar': () => void;
  
  // UI 相关
  'theme-changed': (data: { theme: Theme }) => void;
  'toast': (data: { message: string; type: ToastType }) => void;
  'confirm': (options: ConfirmOptions) => Promise<boolean>;
  
  // 公开文件
  'public-file-uploaded': (data: { fileHash: string; fileName: string; noCache?: boolean; callback: () => Promise<void> }) => void;
}
```

### 4.2 迁移优先级

**P0 - 核心 CAD 编辑器功能（必须在 Vue 迁移前完成）**：
1. `mxcad-file-opened`
2. `mxcad-database-modify`
3. `public-file-uploaded`
4. `mxcad-save-required`
5. `mxcad-save-as`
6. `mxcad-export-file`
7. `mxcad-open-sidebar`
8. `mxcad-new-file`

**P1 - UI 通知功能**：
1. `mxcad-theme-changed`
2. `cloudcad:toast`
3. `cloudcad:confirm`
4. `cloudcad:confirm-response`

### 4.3 保留的原生事件

以下事件**不需要**收敛，保留原样：
- `beforeunload`
- `hashchange`
- `storage`
- `resize`
- `scroll`
- `keydown`
- `mousemove`
