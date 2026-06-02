# frontend_mobile CAD 编辑器 — 缺失功能实现方案

> 基于 feature-gap 对照表，desktop 有而 mobile 无的 15 项功能，按优先级给出实现方案。

---

## P0 — 保存格式选择（另存为时选 DWG/DXF/PDF）

**现状**: `saveService.saveAs()` 硬编码 `format: 'mxweb'`，只存 mxweb。

| 文件 | 改动 |
|------|------|
| `src/services/saveService.ts` | `saveAs()` 透传 `format` 参数，移除硬编码 |
| `src/pages/home/components/SaveAsSheet.vue` | 增加「保存格式」选择器 (DWG/DXF/PDF/MXWEB) |

**saveService.ts**:
```ts
// 改动前
const result = await saveControllerSaveMxwebAs({ body: { file, format: 'mxweb', ...rest } })
// 改动后
const result = await saveControllerSaveMxwebAs({ body: { file, format: params.format || 'mxweb', ...rest } })
```

**SaveAsSheet.vue** 新增格式选择 UI 代码略，参考 desktop `SaveAsModal.tsx` 的 Select 组件。

**API**: `saveControllerSaveMxwebAs` 后端已支持 format 参数。

---

## P0 — DWG/DXF 版本选择（导出时）

**现状**: `exportService.ts` 定义了 `DWG_VERSION_MAP` 和 `showDwgOptionsDialog`，但 import 路径错误：
```
// 当前（错误）
import('../../src/pages/home/components/DwgOptionsPopup.vue')
// 正确（从 src/services/ 出发）
import('../pages/home/components/DwgOptionsPopup.vue')
```

| 文件 | 改动 |
|------|------|
| `src/services/exportService.ts:100` | 修正 import 路径 |
| `src/pages/home/components/DwgOptionsPopup.vue` | **新建** — 参考 `DwgExportModal.tsx`（若不存在） |

**DwgOptionsPopup.vue** 参考 desktop `DwgExportModal.tsx`（117 行），含 CAD 2000~2018 版本选择 Picker。

---

## P1 — 外部参照上传进度追踪 + 状态显示

**现状**: `ExternalRefUploadPopup.vue` 只有图标(成功/失败/上传中)，无进度条。

| 文件 | 改动 |
|------|------|
| `src/plugins/vant/components/popup/ExternalRefUploadPopup.vue` | 每文件加 `<van-progress>`，底部加整体进度条 |
| `src/composables/useFileLoader.ts` | 上传循环中逐文件更新 `progress` |

**ExternalRefUploadPopup.vue**: 参考 desktop `ExternalReferenceModal.tsx:258-283` 每行进度条 + `:258-276` 整体进度条。

**进度获取**: 改用 `XMLHttpRequest.upload.onprogress` 获取实时进度（desktop 用 fetch 无法获取进度）。

---

## P1 — 重复文件检测（秒传）

**现状**: `uploadPublicFile()` / `saveToNode()` 直接上传，无检测。

| 文件 | 改动 |
|------|------|
| `src/services/checkService.ts` | **新建** — `checkDuplicateFile()` 调 `mxCadControllerCheckFileExist` |
| `src/services/uploadService.ts` | 上传前调检测，重复则弹窗「打开已有/上传新/取消」 |
| `src/composables/useSave.ts` | 保存前可选检测 |

参考 desktop `mxcadCheck.ts`（237 行）:
- `checkDuplicateFile()` — API 调用
- `showDuplicateFileDialog()` — 弹窗选择

---

## P1 — IndexedDB 缓存 mxweb

**现状**: 每次从服务端加载，无缓存。

| 文件 | 改动 |
|------|------|
| `src/services/cacheService.ts` | **新建** — IndexedDB 封装 (openDB / getCachedFile / setCachedFile / removeCachedFile) |
| `src/composables/useFileLoader.ts` | `loadByNodeId` 先查缓存 → 未命中则远程加载并缓存 |

参考 desktop `mxcadManager/index.ts` Cache API 模式，mobile 用 IndexedDB。

---

## P2 — 错误分类处理

**现状**: 各处 `try { ... } catch { showToast('失败') }`，不区分错误类型。

| 文件 | 改动 |
|------|------|
| `src/utils/errorHandler.ts` | **新建** — 移植 desktop `errorHandler.ts` 的 `isNetworkError` / `isAuthError` / `isServerError` / `handleApiError` |

**渐进式集成**: 先在关键路径（保存、上传、外部参照）替换，再推广到全部。

参考 desktop `errorHandler.ts`（217 行）。

---

## P2 — 图库/块库浏览

**现状**: 无此功能。

| 文件 | 改动 |
|------|------|
| `src/pages/home/hooks/useMenu.ts` | 加「打开图库」「打开块库」菜单项 |
| `src/pages/home/components/LibraryBrowserPopup.vue` | **新建** — 全屏 Popup 列表，调 `libraryControllerGetDrawings/GetBlocks` |

移动端用 Popup 代替 desktop 侧边栏。

---

## P3 — 乐观锁

**现状**: `saveToNode()` 未传 `expectedTimestamp`。

| 文件 | 改动 |
|------|------|
| `src/composables/useEditorState.ts` | 加 `fileUpdatedAt` 字段 |
| `src/services/saveService.ts` | `saveToNode()` 加 `expectedTimestamp` 参数（用 `fetch` 代替 SDK，参考 `mxcadSave.ts:18-32`） |

参考 desktop `mxcadSave.ts`（46 行）。

---

## P3 — CAD 引擎空闲预加载

**现状**: `mounted` 中直接调 `createMxCAD()`。

| 文件 | 改动 |
|------|------|
| `src/composables/useCADPreload.ts` | **新建** — `requestIdleCallback` 预加载 `mxcad` wasm |
| `src/App.vue` | `mounted` 中调 `preloadCADEngine()` |

---

## P3 — 主题亮/暗模式

| 文件 | 改动 |
|------|------|
| `src/composables/useTheme.ts` | **新建** — 读写 `localStorage` + `data-theme` 属性 |
| 菜单 | 加「切换主题」按钮 |

---

## 实现顺序

```
Phase A (1-2天)
├── 修正 DwgOptionsPopup import 路径
├── 保存格式选择 — SaveAsSheet 加格式选择器

Phase B (1-2天)
├── 外部参照进度追踪 — progress bar
├── 错误分类处理 — errorHandler.ts

Phase C (1-2天)
├── 重复文件检测 — checkService.ts
├── 乐观锁 — expectedTimestamp

Phase D (1-2天)
├── IndexedDB 缓存 — cacheService.ts
├── CAD 引擎预加载 — useCADPreload

Phase E (2-3天)
├── 图库/块库浏览 — LibraryBrowserPopup
├── 主题切换 — useTheme
```

---

## Desktop 参考文件速查

| 功能 | 参考文件 | 行数 |
|------|---------|------|
| 重复文件检测 | `mxcadCheck.ts` | 237 |
| 保存格式选择 | `SaveAsModal.tsx` | 295 |
| 导出+版本选择 | `DownloadFormatModal.tsx` | 263 |
| 外部参照表格 | `ExternalReferenceModal.tsx` | 324 |
| 外部参照逻辑 | `useExternalReferenceUpload.ts` | 650 |
| 缩略图 | `mxcadThumbnail.ts` | 153 |
| 乐观锁 | `mxcadSave.ts` | 46 |
| 类型定义 | `mxcadTypes.ts` | 131 |
| 错误处理 | `errorHandler.ts` | 217 |
| 引擎预加载 | `useMxCADPreload.ts` | 104 |
