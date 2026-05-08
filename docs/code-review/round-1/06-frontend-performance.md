# 前端性能审查报告 — Round 1

> 审查日期：2026-05-08
> 审查范围：`packages/frontend/src/` 下所有 `.tsx` / `.ts` 文件
> 技术栈：React 19 + Vite 6 + Tailwind CSS v4 + Zustand + React Router 7

---

## 1. 不必要的重渲染

### 1.1 FileItem 组件未使用 React.memo（高）

- **文件**: `src/components/FileItem.tsx:83`
- **严重程度**: 🔴 高
- **问题描述**: `FileItem` 是文件列表/仪表盘中渲染频率最高的组件，接收 30+ 个 props，但未用 `React.memo` 包裹。每次父组件状态变化时，列表中所有 `FileItem` 都会重新渲染。在网格视图下可能有几十到上百个实例同时存在。
- **修复建议**: 用 `React.memo` 包裹 `FileItem`，并对回调 props（`onEnter`、`onSelect`、`onDelete` 等）在父组件中使用 `useCallback` 稳定引用。
- **是否需要用户确认**: 否

### 1.2 FileSystemContent 未使用 React.memo（中高）

- **文件**: `src/components/file-system-manager/FileSystemContent.tsx:46`
- **严重程度**: 🟠 中高
- **问题描述**: `FileSystemContent` 负责渲染整个文件列表区域，接收 25+ 个 props。它直接通过 `.map()` 渲染 `FileItem` 列表。无 `React.memo` 保护，当页面其他状态变化时导致整个内容区域重渲染。
- **修复建议**: 用 `React.memo` 包裹 `FileSystemContent`。
- **是否需要用户确认**: 否

### 1.3 Dashboard 页面组件未使用 React.memo（中）

- **文件**: `src/pages/Dashboard.tsx:144`
- **严重程度**: 🟡 中
- **问题描述**: `Dashboard` 是整个仪表盘页面。其内部的 `StatCard`（:46）和 `QuickAction`（:114）子组件也未用 `React.memo`。Dashboard 包含多个数据 hook（`useDashboardStats`、`useDashboardProjects`），任何数据更新都会导致包括统计卡片在内的整个页面重渲染。
- **修复建议**: 对 `Dashboard` 导出组件用 `React.memo` 包裹，并将 `StatCard`、`QuickAction` 提取后用 `React.memo` 包裹。
- **是否需要用户确认**: 否

### 1.4 Layout 组件未使用 React.memo（中）

- **文件**: `src/components/Layout.tsx:148`
- **严重程度**: 🟡 中
- **问题描述**: `Layout` 是全局布局组件，包含侧边栏导航、顶部栏、用户菜单等。内部的 `NavItem` 子组件（:52）也未用 `React.memo`。Layout 中的 `currentTime` state 每秒更新（:206），会导致所有 `NavItem` 不必要地重渲染。`menuItems` 使用了 `useMemo`，但实际过滤和 map 操作在 JSX 中每次渲染都会重新执行（:426-435）。
- **修复建议**: 
  1. 对 `NavItem` 用 `React.memo` 包裹。
  2. 将 `menuItems.filter().slice().map()` 提取为 `useMemo`。
  3. 将时钟抽取为独立组件（`CurrentTime`），避免时钟更新触发整个 Layout 重渲染。
- **是否需要用户确认**: 否

### 1.5 CADEditorDirect 组件过大且未使用 React.memo（中）

- **文件**: `src/pages/CADEditorDirect.tsx:57`
- **严重程度**: 🟡 中
- **问题描述**: `CADEditorDirect` 是 CAD 编辑器的核心组件，1332 行代码，包含 15+ 个 `useState` 和 10+ 个 `useEffect`。它作为全局 overlay 始终挂载在 DOM 中。其 `externalReferenceConfig` 使用 `useMemo`（:93），但依赖项包含 `fileId` 和 `currentFileHash`，意味着每次这些值变化都会创建新的配置对象，进而触发 `useExternalReferenceUpload` 重新执行，可能导致级联的 effect 触发。
- **修复建议**: 
  1. 将组件拆分为更小的子组件（DownloadModal、LoginPrompt、SaveAsModal 等各自独立）。
  2. 对 `externalReferenceConfig` 的 `onSuccess`、`onError`、`onSkip` 使用 `useCallback` 稳定引用。
- **是否需要用户确认**: ✅ 是（拆分 CAD 编辑器组件需要理解业务逻辑边界，建议与开发团队确认拆分方案）

### 1.6 useFileSystem hook 内部使用 useState 传递回调（中）

- **文件**: `src/hooks/file-system/useFileSystem.ts:139-144`
- **严重程度**: 🟡 中
- **问题描述**: `useFileSystem` 使用 `useState` 来传递 `clearSelection` 和 `setIsMultiSelectMode` 回调函数给子 hook（`useFileSystemData`），然后通过另一个 `useEffect`（:188-191）设置这些回调。这种模式导致额外的渲染周期，而且 `useFileSystemData` 在首次渲染时收到的回调是空函数占位。使用 `useRef` 传递回调是更合适的模式。
- **修复建议**: 将 `selectionClearFn` 和 `setMultiSelectModeFn` 改用 `useRef` 存储，避免不必要的状态更新。
- **是否需要用户确认**: 否

### 1.7 FileItem 中 isCadFile / isImageFile 使用 useCallback 而非 useMemo（低）

- **文件**: `src/components/FileItem.tsx:190-209`
- **严重程度**: 🟢 低
- **问题描述**: `isCadFile` 和 `isImageFile` 定义为 `useCallback`，但它们是纯计算函数（无副作用、无参数），应使用 `useMemo` 缓存布尔结果。`useCallback` 返回的是函数，每次 `handleClick` 依赖它们时，实际是调用函数而非直接使用值，导致 `handleClick` 的依赖项更复杂。
- **修复建议**: 将 `isCadFile` 和 `isImageFile` 改为 `useMemo`，并将结果值直接传给 `handleClick` 的依赖数组。
- **是否需要用户确认**: 否

---

## 2. 大列表渲染

### 2.1 文件列表缺少虚拟滚动（高）

- **文件**: `src/components/file-system-manager/FileSystemContent.tsx:141-188`
- **严重程度**: 🔴 高
- **问题描述**: 文件列表直接使用 `.map()` 渲染所有 `FileItem`，未集成任何虚拟滚动方案（`react-window`、`react-virtuoso` 或 `@tanstack/react-virtual`）。虽然有分页支持（`paginationMeta`），但：
  1. 每页默认 20 项（`fileSystemStore.ts:73`），用户可切换更大页面。
  2. 仪表盘上的"最近文件"和"最近项目"列表直接渲染前 5 项，无分页（`Dashboard.tsx:433-449`）。
  3. `package.json` 中未安装任何虚拟滚动库。
- **修复建议**: 
  1. 安装 `@tanstack/react-virtual`（轻量、框架无关）或 `react-window`。
  2. 在 `FileSystemContent` 中用虚拟列表替换 `.map()` 渲染。
  3. 仪表盘部分可保留直接渲染（项目<5 个），但文件列表建议始终使用虚拟滚动。
- **是否需要用户确认**: ✅ 是（选择虚拟滚动库及集成方式需要团队讨论）

### 2.2 资源库列表同样缺少虚拟滚动（中高）

- **文件**: `src/pages/LibraryManager.tsx`、`src/pages/FontLibrary.tsx`
- **严重程度**: 🟠 中高
- **问题描述**: 公共资源库和字体库页面同样渲染大列表（字体可能有数百个），未使用虚拟滚动。这些页面使用 `useLibraryQuery` 进行分页查询，但渲染时仍然一次性创建所有可见项的 DOM 节点。
- **修复建议**: 与 2.1 统一方案，在所有列表渲染场景使用虚拟滚动。
- **是否需要用户确认**: 同上

---

## 3. 代码分割

### 3.1 代码分割实现良好（正面评价）

- **文件**: `src/App.tsx:35-70`
- **严重程度**: ✅ 良好
- **问题描述**: 所有页面组件都使用了 `React.lazy()` + `Suspense` 进行懒加载，包括：
  - 公开页面（Login、Register、ForgotPassword 等）
  - CAD 编辑器（独立懒加载，仅在 CAD 路由挂载）
  - 管理页面（UserManagement、RoleManagement、AuditLogPage 等）— 这些低频页面被正确懒加载
- **修复建议**: 无需修改。

### 3.2 CAD 编辑器按路由条件挂载（正面评价）

- **文件**: `src/App.tsx:133-150`
- **严重程度**: ✅ 良好
- **问题描述**: `CADEditorRouteGuard` 组件仅在路由匹配 `/` 或 `/cad-editor` 时才挂载 `CADEditorDirect`，避免其他页面触发 CAD 引擎（mxcad-app）的懒加载。CAD 引擎的 `mxcad-app` 在 `vite.config.ts` 中被排除出 `optimizeDeps`（:165），通过动态 `import()` 加载。
- **修复建议**: 无需修改。

### 3.3 CAD 引擎预加载策略合理（正面评价）

- **文件**: `src/hooks/useMxCADPreload.ts`
- **严重程度**: ✅ 良好
- **问题描述**: 使用 `requestIdleCallback` 在浏览器空闲时预加载 CAD 依赖，有去重保护（`preloadPromise` 单例），CDN 降级方案（加载失败后切换 CDN）。非 CAD 路由下通过 `useMxCADPreload()` 在 `AppContent` 中全局调用（`App.tsx:154`），确保用户导航到 CAD 编辑器时依赖已就绪。
- **修复建议**: 无需修改。

### 3.4 Vite 手动分包配置合理（正面评价）

- **文件**: `vite.config.ts:102-138`
- **严重程度**: ✅ 良好
- **问题描述**: `manualChunks` 配置将依赖拆分为 8 个 vendor 包（react、ui、chart、form、state、http、cad、utils），chunkSizeWarningLimit 设置为 1000KB。CAD 核心库（mxcad-app）单独分包。但缺少：
  1. 缺少 `lucide-react` 图标库的按需导入配置。当前 lucide-react 0.556.0 包含 ~1000+ 个图标，但实际可能只用了 30-50 个。未配置 tree-shaking 优化。
  2. 未配置 `recharts` 的子模块拆分。
- **修复建议**: 
  1. 验证 lucide-react 的 tree-shaking 是否生效（检查打包后是否包含所有图标）。
  2. 考虑将 `recharts` 按需引入具体模块而非全量导入。
- **是否需要用户确认**: 否

---

## 4. 图片与资源

### 4.1 文件缩略图未使用懒加载（中高）

- **文件**: `src/components/file-item/Thumbnail.tsx:65-77`
- **严重程度**: 🟠 中高
- **问题描述**: 缩略图 `<img>` 标签未设置 `loading="lazy"` 属性，也没有使用 `IntersectionObserver` 或 `loading` 属性进行懒加载。当页面有大量 CAD 文件缩略图时，所有图片会同时请求，可能导致带宽竞争和渲染延迟。
- **修复建议**: 
  1. 给 `<img>` 标签添加 `loading="lazy"` 属性。
  2. 考虑使用 `decoding="async"` 避免阻塞主线程解码。
  3. 对不在视口内的缩略图，延迟加载或使用占位符。
- **是否需要用户确认**: 否

### 4.2 缩略图缺少响应式尺寸（中）

- **文件**: `src/components/file-item/Thumbnail.tsx:67`
- **严重程度**: 🟡 中
- **问题描述**: 缩略图以固定尺寸渲染（通过 `size` prop 控制），但始终使用 `getThumbnailUrl()` 返回的同一尺寸图片。在网格视图（64px/120px）和列表视图（40px/56px）中下载的是相同分辨率的缩略图，列表视图浪费带宽。
- **修复建议**: 后端提供多尺寸缩略图（如 small/medium/large），前端根据 `viewMode` 选择合适尺寸。或使用 `srcset` + `sizes` 属性实现响应式图片。
- **是否需要用户确认**: ✅ 是（需要后端配合提供多尺寸缩略图 API）

### 4.3 缩略图缺少 WebP 格式支持（中）

- **文件**: `src/components/file-item/Thumbnail.tsx:40-41`
- **严重程度**: 🟡 中
- **问题描述**: `Thumbnail` 组件通过 `getThumbnailUrl()` 和 `getCadThumbnailUrl()` 获取缩略图 URL，但未检查是否支持 WebP 格式。CAD 缩略图通常为 PNG，文件体积较大（典型 ~50-200KB），转为 WebP 可减少 40-60% 体积。
- **修复建议**: 
  1. 后端缩略图生成接口支持 WebP 格式，并返回 WebP URL。
  2. 前端使用 `<picture>` 元素提供 WebP 回退。
- **是否需要用户确认**: ✅ 是（需要后端缩略图服务支持）

### 4.4 图片预览模态框未懒加载原图（低）

- **文件**: `src/components/modals/ImagePreviewModal.tsx`
- **严重程度**: 🟢 低
- **问题描述**: 图片预览使用 `getOriginalFileUrl()` 获取原图 URL 并在模态框中显示。原图可能是高分辨率文件（数 MB），应仅在模态框打开时加载。
- **修复建议**: 确认原图是否仅在模态框打开后才发起请求（检查 `isOpen` 控制渲染即可）。
- **是否需要用户确认**: 否

---

## 5. Web Worker

### 5.1 CAD 计算缺乏 Web Worker 卸载（中高）

- **文件**: `src/services/mxcadManager/index.ts`、`src/pages/CADEditorDirect.tsx`
- **严重程度**: 🟠 中高
- **问题描述**: 
  1. 文件哈希计算（`calculateFileHash`，`hashUtils.ts`）在主线程使用 `spark-md5` 执行。大文件（100MB+ DWG）计算哈希可能阻塞 UI 数秒。
  2. CAD 缩略图生成（`MxCadInstanceManager.generateThumbnail()`，mxcadManager/index.ts:1987）调用 `mxcad.mxdraw.createCanvasImageData()` 在主线程生成缩略图，可能阻塞 UI。
  3. 整个项目中未发现任何 Web Worker 的使用。
- **修复建议**: 
  1. 文件哈希计算移至 Web Worker（使用 `spark-md5` 的增量计算模式）。
  2. CAD 缩略图生成如果能分离到 Worker，建议在 Worker 中执行。
  3. CAD 核心引擎（mxcad-app）是 C++/WASM 编译产物，无法轻易移至 Worker，但可以考虑使用 `OffscreenCanvas`。
- **是否需要用户确认**: ✅ 是（Web Worker 集成需要评估 mxcad-app SDK 的线程安全性，特别是 WASM 模块是否支持在 Worker 中运行）

### 5.2 Uppy 上传在主线程处理（低）

- **文件**: `src/utils/uppyUploadUtils.ts`、`src/components/MxCadUppyUploader.tsx`
- **严重程度**: 🟢 低
- **问题描述**: Uppy 上传组件使用 TUS 协议进行分块上传，这本身是异步的，不会阻塞主线程。但文件预处理（如生成缩略图预览）在主线程执行。
- **修复建议**: 暂不需要修改。Uppy 自身已做好分块和异步优化。

---

## 6. 内存泄漏

### 6.1 CAD 编辑器事件监听器正确清理（正面评价）

- **文件**: `src/pages/CADEditorDirect.tsx:757-803`
- **严重程度**: ✅ 良好
- **问题描述**: 在文件加载 `useEffect` 中，`loadFile` 异步函数内部使用 `cancelled` 标志（:486）防止组件卸载后的状态更新。`useEffect` 返回清理函数设置 `cancelled = true`。窗口事件监听器（`mxcad-save-required`、`mxcad-file-opened` 等）也正确返回了 `removeEventListener` 清理函数。
- **修复建议**: 无需修改。

### 6.2 主页模式 setTimeout 正确清理（正面评价）

- **文件**: `src/pages/CADEditorDirect.tsx:869-875`
- **严重程度**: ✅ 良好
- **问题描述**: 主页模式初始化使用 `setTimeout(() => {...}, 300)`，并在 `useEffect` 返回的清理函数中正确调用 `clearTimeout(timer)`。同时也重置了 `homeInitStartedRef.current`，确保 React Strict Mode 双挂载时能重新初始化。
- **修复建议**: 无需修改。

### 6.3 FileItem 中 ResizeObserver 正确断开（正面评价）

- **文件**: `src/components/FileItem.tsx:411-428`
- **严重程度**: ✅ 良好
- **问题描述**: `ResizeObserver` 在 `useEffect` 中创建，并在返回清理函数中调用 `.disconnect()`。依赖项仅包含 `viewMode`，避免不必要的重建。
- **修复建议**: 无需修改。

### 6.4 Layout 中 setInterval 正确清理（正面评价）

- **文件**: `src/components/Layout.tsx:205-208`
- **严重程度**: ✅ 良好
- **问题描述**: 时钟更新使用 `setInterval`，在 `useEffect` 返回的清理函数中正确调用 `clearInterval`。
- **修复建议**: 无需修改。

### 6.5 缩略图 onError 状态正确管理（正面评价）

- **文件**: `src/components/file-item/Thumbnail.tsx:20,75`
- **严重程度**: ✅ 良好
- **问题描述**: 图片加载失败时设置 `imageLoadError` 状态为 true，此时回退显示图标，不会无限重试加载失败的图片。
- **修复建议**: 无需修改。

### 6.6 mxcadManager IndexedDB 连接正确关闭（正面评价）

- **文件**: `src/services/mxcadManager/index.ts:992`
- **严重程度**: ✅ 良好
- **问题描述**: 在 `openLocalMxwebFile` 函数中，IndexedDB 连接使用完毕后正确调用 `db.close()`。
- **修复建议**: 无需修改。

---

## 7. 打包体积

### 7.1 Vite 分包配置完整（正面评价）

- **文件**: `vite.config.ts:93-155`
- **严重程度**: ✅ 良好
- **问题描述**: 
  - `manualChunks` 将依赖拆分为 8 个独立 vendor 包
  - `chunkSizeWarningLimit` 设置为 1000KB
  - `target: 'esnext'` 启用现代浏览器特性，减少 polyfill 体积
  - `minify: 'esbuild'` 使用快速压缩
  - `optimizeDeps.include` 预构建常用依赖
  - `mxcad-app` 正确排除出 `optimizeDeps`（过大，动态加载）
- **修复建议**: 无需修改。

### 7.2 lucide-react 图标库 Tree Shaking 风险（中）

- **文件**: `package.json:43`
- **严重程度**: 🟡 中
- **问题描述**: `lucide-react` 版本 0.556.0 包含约 1000+ 个图标组件。项目中大量使用命名导入（如 `import { FolderOpen } from 'lucide-react'`），理论上支持 tree-shaking。但需确认：
  1. `lucide-react` 是否提供 ES module 版本（`"module"` 字段指向 ESM）。
  2. 打包后是否实际清除了未使用的图标。
- **修复建议**: 
  1. 运行 `pnpm build` 后使用 `vite-bundle-visualizer` 或 `rollup-plugin-visualizer` 检查实际打包内容。
  2. 如发现图标全量打入，考虑使用 `lucide-react/dynamic` 或配置 `import { X } from 'lucide-react/icons/x'` 按路径导入。
- **是否需要用户确认**: 否

### 7.3 recharts 图表库体积较大（中）

- **文件**: `package.json:51`
- **严重程度**: 🟡 中
- **问题描述**: `recharts` 3.5.1 是完整图表库，包含 50+ 种图表类型。项目可能只使用了少数图表（如柱状图、饼图），但全量导入。recharts 未提供官方的 tree-shakable 子模块导入路径。
- **修复建议**: 
  1. 评估是否可以用更轻量的替代方案（如纯 SVG/CSS 图表面板用于简单统计）。
  2. 如必须使用 recharts，确认 Vite 打包时是否通过 tree-shaking 移除了未使用模块。
- **是否需要用户确认**: ✅ 是（更换图表库需要评估业务需求）

### 7.4 缺少打包体积分析工具（中）

- **文件**: `vite.config.ts`
- **严重程度**: 🟡 中
- **问题描述**: Vite 配置中未集成打包体积分析插件（如 `rollup-plugin-visualizer`），无法直观了解各模块的体积占比，难以针对性优化。
- **修复建议**: 
  1. 安装 `rollup-plugin-visualizer` 作为 devDependency。
  2. 在 `vite.config.ts` 的 `build.rollupOptions.plugins` 中添加 visualizer 插件，生成 `stats.html` 报告。
- **是否需要用户确认**: 否

### 7.5 mxcad-app CSS 全量导入（中）

- **文件**: `src/services/mxcadManager/index.ts:55`
- **严重程度**: 🟡 中
- **问题描述**: `import "mxcad-app/style"` 全量导入 mxcad-app 的 Vuetify + 自定义样式。这会在 CAD 编辑器未激活时也加载这些样式（因为 `mxcadManager` 模块被静态 import 引用）。如果样式较大，会影响首屏加载。
- **修复建议**: 考虑将 `import "mxcad-app/style"` 移至动态 import 内部（如 `loadMxCADDependencies()` 中），仅在需要 CAD 编辑器时加载样式。
- **是否需要用户确认**: ✅ 是（需要确认 mxcad-app 样式是否在其他地方依赖，以及动态加载是否会导致样式闪烁）

---

## 8. 其他发现

### 8.1 zustand persist 中间件 localStorage 写入频率（低）

- **文件**: `src/stores/fileSystemStore.ts:127-136`
- **严重程度**: 🟢 低
- **问题描述**: Zustand persist 中间件使用 `partialize` 仅持久化 `pageSize`、`viewMode`、`sortBy`、`sortOrder` 四个字段，设计良好。但注意 Zustand persist 的默认存储是同步的 `localStorage.setItem`，在频繁更新视图模式时可能有轻微性能影响。
- **修复建议**: 当前配置合理，无需修改。如未来添加高频更新的持久化字段，可考虑使用 `debounce` 或 `throttle`。
- **是否需要用户确认**: 否

### 8.2 useFileSystem 中 eslint-disable 规则（中）

- **文件**: `src/hooks/file-system/useFileSystem.ts:327-335`
- **严重程度**: 🟡 中
- **问题描述**: 多个 `useEffect` 使用 `eslint-disable-next-line react-hooks/exhaustive-deps` 禁用依赖检查（:327-328, 335-336），注释声称为避免闭包问题。但这些禁用可能隐藏真正的依赖变化 bug。例如 `loadData` 函数内部使用 ref 管理状态，但 eslint 规则无法识别这种模式。
- **修复建议**: 
  1. 使用 `useRef` + 手动触发模式代替部分 `useEffect` + `loadData` 的依赖跟踪。
  2. 如果确实需要禁用规则，添加更详细的注释说明为何安全。
- **是否需要用户确认**: 否

### 8.3 CADEditorDirect 中 useExternalReferenceUpload 的 hook 规则风险（中）

- **文件**: `src/pages/CADEditorDirect.tsx:128`
- **严重程度**: 🟡 中
- **问题描述**: `useExternalReferenceUpload` 在组件顶层调用（符合 hook 规则），但其参数 `externalReferenceConfig` 依赖 `fileId` 和 `currentFileHash`，这些值在文件加载过程中频繁变化。每次变化都会导致 `useExternalReferenceUpload` 实例重新创建，内部状态丢失。
- **修复建议**: 验证 `useExternalReferenceUpload` 内部的 `useEffect` 是否能正确处理 props 变化导致的重新初始化。
- **是否需要用户确认**: 否

---

## 总结表格

| 类别 | 问题数 | 🔴 高 | 🟠 中高 | 🟡 中 | 🟢 低 | ✅ 良好 |
|------|--------|-------|---------|-------|-------|---------|
| 不必要的重渲染 | 7 | 1 | 1 | 4 | 1 | 0 |
| 大列表渲染 | 2 | 1 | 1 | 0 | 0 | 0 |
| 代码分割 | 4 | 0 | 0 | 0 | 0 | 4 |
| 图片与资源 | 4 | 0 | 1 | 2 | 1 | 0 |
| Web Worker | 2 | 0 | 1 | 0 | 1 | 0 |
| 内存泄漏 | 6 | 0 | 0 | 0 | 0 | 6 |
| 打包体积 | 5 | 0 | 0 | 4 | 0 | 1 |
| 其他 | 3 | 0 | 0 | 2 | 1 | 0 |
| **总计** | **33** | **2** | **4** | **12** | **4** | **11** |

### 需用户确认的问题（共 6 项）

| # | 问题 | 类别 |
|---|------|------|
| 1 | CADEditorDirect 组件拆分为更小的子组件 | 不必要的重渲染 |
| 2 | 引入虚拟滚动库（@tanstack/react-virtual / react-window） | 大列表渲染 |
| 3 | 后端提供多尺寸缩略图 API | 图片与资源 |
| 4 | 后端缩略图服务支持 WebP 格式 | 图片与资源 |
| 5 | CAD 哈希计算 / 缩略图生成移至 Web Worker | Web Worker |
| 6 | 替换 recharts 图表库为更轻量方案 | 打包体积 |
| 7 | mxcad-app 样式改为动态加载 | 打包体积 |

### 优先修复建议（Top 5）

1. 🔴 **FileItem 添加 React.memo** — 影响面最大，文件列表是用户最高频操作区域，改动简单，受益明显。
2. 🔴 **引入虚拟滚动** — 文件列表页面在项目文件较多时 DOM 节点数可达数百，虚拟滚动是体验的分水岭。
3. 🟠 **缩略图添加 loading="lazy"** — 改动极简（加一个属性），立即减少首屏图片请求数。
4. 🟠 **文件哈希移至 Web Worker** — 大文件上传场景下明显改善 UI 响应性。
5. 🟡 **Layout 中时钟组件独立化** — 当前每秒触发整个 Layout 重渲染，独立后几乎零成本解决。

---

*报告生成时间：2026-05-08*
*审查工具：Claude Code 手动审查*
