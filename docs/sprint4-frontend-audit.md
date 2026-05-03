
# 冲刺四前置审计报告 - Vue 3 封装层设计参考

**生成日期**: 2026-05-03  
**审计范围**: CAD 编辑器、侧边栏、主题系统、进度条、mxcad 管理器

---

## 目录

1. [CAD 编辑器](#1-cad-编辑器)
2. [侧边栏](#2-侧边栏)
3. [主题系统](#3-主题系统)
4. [进度条](#4-进度条)
5. [mxcad 管理器](#5-mxcad-管理器)
6. [总结与建议](#6-总结与建议)

---

## 1. CAD 编辑器

### 1.1 涉及文件及核心代码片段

**主要文件**: `apps/frontend/src/pages/CADEditorDirect.tsx`

#### 核心代码片段

**初始化配置** (第 348-362 行):
```typescript
const initMxCADConfig = async (currentFile?: {
  parentId?: string | null;
  id?: string;
}) => {
  const { mxcadApp } = await import('mxcad-app');
  const configUrl = window.location.origin;
  mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
  mxcadApp.initConfig({
    uiConfig: `${configUrl}/ini/myUiConfig.json`,
    sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
    serverConfig: `${configUrl}/ini/myServerConfig.json`,
    quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
    themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
  });
};
```

**文件加载逻辑** (第 493-743 行):
```typescript
useEffect(() => {
  if (!fileId || !isActive) return;

  const loadFile = async () => {
    setLoading(true);
    setError(null);

    try {
      const { mxcadManager } = await import('../services/mxcadManager');
      
      // 获取文件信息
      let file: {
        fileHash?: string;
        path?: string;
        parentId?: string | null;
        id?: string;
        isRoot?: string | boolean;
        name?: string;
        deletedAt?: string | null;
        updatedAt?: string;
        libraryKey?: string | null;
      };

      // 根据 libraryKey 选择不同的 API
      if (libraryKeyParam === 'drawing') {
        const { libraryApi } = await import('../services/libraryApi');
        const nodeResponse = await libraryApi.getDrawingNode(fileId);
        file = nodeResponse.data as typeof file;
      } else if (libraryKeyParam === 'block') {
        const { libraryApi } = await import('../services/libraryApi');
        const nodeResponse = await libraryApi.getBlockNode(fileId);
        file = nodeResponse.data as typeof file;
      } else {
        const fileResponse = await filesApi.get(fileId);
        file = fileResponse.data as typeof file;
      }
      
      // 构建 mxweb 文件 URL
      let mxcadFileUrl!: string;
      if (versionParam) {
        // 历史版本
        if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
          mxcadFileUrl = `/api/library/${libraryKeyParam}/filesData/${file.path}?v=${versionParam}`;
        } else {
          mxcadFileUrl = `/api/mxcad/filesData/${file.path}?v=${versionParam}`;
        }
      } else {
        if (file.updatedAt) {
          const cacheTimestamp = new Date(file.updatedAt).getTime();
          if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
            mxcadFileUrl = `/api/library/${libraryKeyParam}/filesData/${file.path}?t=${cacheTimestamp}`;
          } else {
            mxcadFileUrl = `/api/mxcad/filesData/${file.path}?t=${cacheTimestamp}`;
          }
        }
      }
      
      // 打开文件
      if (isInitializedRef.current && mxcadManager.isCreated()) {
        if (loadedFileUrlRef.current === mxcadFileUrl) {
          mxcadManager.showMxCAD(true);
          setLoading(false);
          return;
        }
        await mxcadManager.openFile(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
      } else {
        await loadMxCADDependencies();
        await initMxCADConfig(file);
        await mxcadManager.initializeMxCADView(mxcadFileUrl);
        mxcadManager.showMxCAD(true);
        await initThemeSync();
        isInitializedRef.current = true;
      }
      
      loadedFileUrlRef.current = mxcadFileUrl;
      currentFileIdRef.current = fileId;
      setLoading(false);
    } catch (err) {
      console.error('加载文件失败:', err);
      setError('CAD编辑器初始化失败');
      setLoading(false);
    }
  };

  loadFile();
}, [fileId, isActive, versionParam, navigate, externalReferenceUpload, isAuthenticated]);
```

**主题同步** (第 286-347 行):
```typescript
const initThemeSync = async () => {
  if (isThemeSyncInitialized.current) {
    console.log('[ThemeSync] 已初始化，跳过');
    return;
  }

  try {
    const { mxcadApp } = await import('mxcad-app');
    const vuetify = await mxcadApp.getVuetify();

    const { watch } = await import('vue');

    const storedTheme = localStorage.getItem('mx-user-dark');
    const userThemeIsDark = storedTheme ? storedTheme === 'true' : true;
    const currentMxcadTheme = vuetify.theme.global.name.value;
    const mxcadIsDark = currentMxcadTheme === 'dark';

    if (userThemeIsDark !== mxcadIsDark) {
      vuetify.theme.change(userThemeIsDark ? 'dark' : 'light');
    }

    watch(
      () => vuetify.theme.global.name.value,
      (themeName) => {
        const isDark = themeName === 'dark';

        window.dispatchEvent(
          new CustomEvent('mxcad-theme-changed', {
            detail: { isDark },
          })
        );

        const theme = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);

        if (isDark) {
          document.body.classList.add('dark-theme');
          document.body.classList.remove('light-theme');
        } else {
          document.body.classList.add('light-theme');
          document.body.classList.remove('dark-theme');
        }

        localStorage.setItem('mx-user-dark', String(isDark));
      }
    );

    isThemeSyncInitialized.current = true;
  } catch (error) {
    console.warn('[ThemeSync] 主题同步初始化失败:', error);
  }
};
```

**事件监听** (第 856-1080 行):
```typescript
useEffect(() => {
  const handleSaveRequired = (event: CustomEvent&lt;{ action: string }&gt;) => {
    if (loginPromptDismissedRef.current) return;

    if (!isAuthenticated) {
      setLoginPromptAction(event.detail?.action || '保存文件');
      setShowLoginPrompt(true);
      event.preventDefault();
    }
  };

  saveRequiredHandlerRef.current = handleSaveRequired;

  window.addEventListener('mxcad-save-required', handleSaveRequired as EventListener);
  window.addEventListener('mxcad-saveas-required', handleSaveRequired as EventListener);

  return () => {
    window.removeEventListener('mxcad-save-required', handleSaveRequired as EventListener);
    window.removeEventListener('mxcad-saveas-required', handleSaveRequired as EventListener);
    saveRequiredHandlerRef.current = null;
  };
}, [isAuthenticated, showToast]);
```

### 1.2 对外暴露的接口

**Props 接口** (隐式，通过 React Router):
- `fileId`: 文件 ID（从路由 `/cad-editor/:fileId` 获取）
- `libraryKey`: 资源库类型（`drawing` | `block`，从 URL 参数获取）
- `versionParam`: 历史版本号（从 URL 参数获取）
- `nodeId`: 项目/父节点 ID（从 URL 参数获取）

**自定义事件（从 mxcad-app 发出）**:
- `mxcad-save-required`: 保存需要认证时触发
- `mxcad-saveas-required`: 另存为需要认证时触发
- `mxcad-export-file`: 导出文件时触发
- `mxcad-save-as`: 另存为时触发
- `mxcad-file-opened`: 文件打开完成时触发
- `mxcad-new-file`: 新建文件时触发
- `mxcad-theme-changed`: 主题变更时触发
- `mxcad-database-modify`: 文档修改时触发
- `mxcad-open-sidebar`: 打开侧边栏时触发
- `public-file-uploaded`: 公开文件上传完成时触发

**从 CADEditorDirect 调用的外部服务**:
- `mxcadManager`: mxcad 管理服务
- `filesApi`: 文件 API 服务
- `projectsApi`: 项目 API 服务
- `libraryApi`: 资源库 API 服务
- `publicFileApi`: 公开文件 API 服务
- `useAuth`: 认证钩子
- `useNotification`: 通知钩子
- `usePermission`: 权限钩子

### 1.3 与 mxcad-app 的通信方式

1. **CustomEvent 事件总线** (主要方式)
   - mxcad-app 发出事件 → React 监听 `window.addEventListener`
   - React 发出事件 → mxcad-app 监听（通过 `window.dispatchEvent`）

2. **全局对象直接调用**
   ```typescript
   const { mxcadApp } = await import('mxcad-app');
   const vuetify = await mxcadApp.getVuetify();
   vuetify.theme.change(theme);
   ```

3. **命令调用** (通过 MxFun)
   ```typescript
   MxFun.execCommand("return-to-cloud-map-management");
   MxFun.sendStringToExecute('Mx_Save');
   MxFun.addCommand("command-name", handler);
   ```

4. **全局状态共享**
   - `window.mxcadAppContext`: 用户上下文
   - `localStorage.getItem('mx-user-dark')`: 主题状态
   - `window.MxPluginContext`: 插件上下文

### 1.4 当前实现的痛点

1. **状态管理分散**
   - 文件信息同时存储在 `currentFileInfo` (mxcadManager)、React state、URL 参数中
   - 容易出现不同步问题

2. **耦合严重**
   - CADEditorDirect 同时处理：路由解析、权限检查、文件加载、主题同步、外部参照、登录提示、导出弹窗
   - 组件过于庞大（1300+ 行），难以维护

3. **竞态条件问题**
   - `pendingShowActionRef`、`isInitializedRef` 等 ref 用于解决竞态，但代码复杂
   - `hideEditor` 和 `showMxCAD` 之间可能存在冲突

4. **主题同步机制复杂**
   - 需要在 React 和 Vue (mxcad-app) 之间双向同步
   - 依赖 Vue 的 `watch` API，在 React 中动态导入 Vue

5. **事件监听清理不完整**
   - 多个 useEffect 中的事件监听器需要正确清理
   - 存在 ref 引用问题可能导致内存泄漏

6. **硬编码的配置路径**
   ```typescript
   uiConfig: `${configUrl}/ini/myUiConfig.json`,
   themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
   ```
   配置路径分散，难以统一管理

### 1.5 Vue 3 封装建议

**1. 组合式函数封装**
```typescript
// composables/useCadEditor.ts
export function useCadEditor(options: CadEditorOptions) {
  const { fileId, libraryKey, version } = options;
  
  const loading = ref(false);
  const error = ref&lt;string | null&gt;(null);
  const isActive = ref(false);
  
  const { loadFile, openFile } = useFileOperations();
  const { initTheme, syncTheme } = useThemeSync();
  const { checkPermissions } = useCadPermissions();
  
  const handleFileOpen = async () => {
    // 封装加载逻辑
  };
  
  return {
    loading, error, isActive,
    handleFileOpen
  };
}
```

**2. 事件总线统一封装**
```typescript
// composables/useCadEvents.ts
export function useCadEvents() {
  const on = (event: string, handler: Function) => {
    window.addEventListener(event, handler as EventListener);
    return () => window.removeEventListener(event, handler as EventListener);
  };
  
  const emit = (event: string, detail: any) => {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  };
  
  return { on, emit };
}
```

**3. 配置管理统一**
```typescript
// config/cadConfig.ts
export const cadConfig = {
  staticAssetPath: '/mxcadAppAssets/',
  configFiles: {
    ui: '/ini/myUiConfig.json',
    sketches: '/ini/mySketchesAndNotesUiConfig.json',
    server: '/ini/myServerConfig.json',
    quickCommand: '/ini/myQuickCommand.json',
    theme: '/ini/myVuetifyThemeConfig.json',
  }
};
```

**4. 组件分层设计**
```
CadEditor/
├── CadEditorContainer.vue      # 容器组件
├── CadEditorView.vue           # 编辑器视图
├── CadSidebar.vue              # 侧边栏
├── CadToolbar.vue              # 工具栏
└── modals/
    ├── SaveAsModal.vue
    ├── ExportModal.vue
    └── ExternalReferenceModal.vue
```

---

## 2. 侧边栏

### 2.1 涉及文件及核心代码片段

**主要文件**: `apps/frontend/src/components/sidebar/SidebarContainer.tsx`

#### 核心代码片段

**Tab 切换逻辑** (第 246-271 行):
```typescript
const handleTabChange = useCallback(
  (tab: SidebarTab) => {
    setActiveTab(tab);
    if (settings.rememberState) {
      setLastActiveTab(tab);
    }
  },
  [settings.rememberState, setLastActiveTab]
);

const handleDrawingsSubTabChange = useCallback(
  (subTab: DrawingsSubTab) => {
    setActiveDrawingsSubTab(subTab);
    if (settings.rememberState) {
      setLastDrawingsSubTab(subTab);
    }
  },
  [settings.rememberState, setLastDrawingsSubTab]
);
```

**宽度调整** (第 283-308 行):
```typescript
const handleResizeMouseDown = useCallback(
  (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const clampedWidth = Math.max(320, Math.min(600, newWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  },
  [setWidth]
);
```

**图纸打开处理** (第 310-370 行):
```typescript
const handleDrawingOpen = useCallback(async (node: FileSystemNode, libraryType?: 'drawing' | 'block') => {
  try {
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    if (libraryType === 'drawing' || libraryType === 'block') {
      const { openLibraryDrawing, openLibraryBlock } = await import('../../services/mxcadManager');

      if (libraryType === 'drawing') {
        await openLibraryDrawing(node.id, node.name, node.path, node.updatedAt);
      } else {
        await openLibraryBlock(node.id, node.name, node.path, node.updatedAt);
      }
      return;
    }

    const fileResponse = await filesApi.get(node.id);
    const file = fileResponse.data as {
      fileHash?: string;
      path?: string;
      parentId?: string | null;
      id?: string;
      isRoot?: boolean;
      name?: string;
    };

    if (!file.fileHash) {
      console.error('文件尚未转换完成');
      return;
    }

    let targetProjectId: string | null | undefined = file.parentId || null;
    if (!file.isRoot &amp;&amp; file.parentId) {
      try {
        if (!file.id) throw new Error('节点ID缺失');
        const rootResponse = await filesApi.getRoot(file.id);
        if (rootResponse.data?.id) {
          targetProjectId = rootResponse.data.id;
        }
      } catch (error) {
        console.error('获取根节点失败:', error);
      }
    } else if (file.isRoot) {
      targetProjectId = file.id;
    }

    await openUploadedFile(node.id, file.parentId || targetProjectId || '');
  } catch (error) {
    console.error('打开图纸失败:', error);
  }
}, []);
```

**监听 mxcad 事件** (第 220-243 行):
```typescript
useEffect(() => {
  const handleOpenSidebar = (event: CustomEvent&lt;{ type: SidebarTab }&gt;) => {
    const { type } = event.detail;
    setActiveTab(type);
    setIsVisible(true);
    if (settings.rememberState) {
      setLastActiveTab(type);
    }
  };

  window.addEventListener('mxcad-open-sidebar', handleOpenSidebar as EventListener);

  return () => {
    window.removeEventListener('mxcad-open-sidebar', handleOpenSidebar as EventListener);
  };
}, [settings.rememberState, setIsVisible, setLastActiveTab]);
```

### 2.2 对外暴露的接口

**Props 接口**:
```typescript
interface SidebarContainerProps {
  projectId: string;
  onInsertFile?: (file: InsertFileParams) => void | Promise&lt;void&gt;;
}

interface InsertFileParams {
  nodeId: string;
  filename: string;
}
```

**暴露的事件/回调**:
- `onInsertFile`: 图库插入文件回调

**内部使用的 hooks**:
- `useSidebarSettings`: 侧边栏设置
- `useAuth`: 认证状态
- `mxcadManager`: mxcad 管理
- `openUploadedFile`: 打开已上传文件
- `checkAndConfirmUnsavedChanges`: 检查未保存变更

**监听的 CustomEvents**:
- `mxcad-open-sidebar`: 打开侧边栏
- `mxcad-file-opened`: 文件已打开
- `mxcad-database-modify`: 文档修改

### 2.3 与 mxcad-app 的通信方式

1. **CustomEvent 事件监听**
   - `mxcad-open-sidebar`: mxcad-app 发出的打开侧边栏命令
   - `mxcad-file-opened`: 文件打开完成，更新当前文件状态

2. **mxcadManager API 调用**
   ```typescript
   mxcadManager.adjustContainerPosition(width);
   mxcadManager.getCurrentFileInfo();
   ```

3. **文件操作 API 调用**
   ```typescript
   openUploadedFile(nodeId, parentId);
   openLibraryDrawing(nodeId, name, path, updatedAt);
   openLibraryBlock(nodeId, name, path, updatedAt);
   ```

### 2.4 当前实现的痛点

1. **组件职责过多**
   - SidebarContainer 同时处理：Tab 管理、子 Tab 管理、宽度调整、图纸打开、登录提示、状态同步
   - 600+ 行代码，难以测试和维护

2. **状态同步复杂**
   - React state、Zustand store、mxcadManager 状态需要保持同步
   - 使用了 useEffect 监听多个状态源

3. **条件渲染嵌套过深**
   ```tsx
   {activeDrawingsSubTab === 'drawings-gallery' &amp;&amp; (...)}
   {activeDrawingsSubTab === 'blocks-gallery' &amp;&amp; (...)}
   {activeDrawingsSubTab === 'my-project' &amp;&amp; (
     isAuthenticated ? (...) : (
       &lt;div className={styles.loginPromptContainer}&gt;...&lt;/div&gt;
     )
   )}
   ```

4. **直接的 DOM 事件处理**
   - 宽度调整使用原生 `document.addEventListener`
   - 需要手动清理，容易出错

5. **Tab 状态与 UI 渲染强耦合**
   - Tab 切换逻辑与渲染逻辑混在一起

### 2.5 Vue 3 封装建议

**1. 组合式函数拆分**
```typescript
// composables/useSidebarTabs.ts
export function useSidebarTabs() {
  const activeTab = ref&lt;SidebarTab&gt;('drawings');
  const activeSubTab = ref&lt;DrawingsSubTab&gt;('my-project');
  
  const switchTab = (tab: SidebarTab) => { /* ... */ };
  const switchSubTab = (subTab: DrawingsSubTab) => { /* ... */ };
  
  return { activeTab, activeSubTab, switchTab, switchSubTab };
}

// composables/useSidebarResize.ts
export function useSidebarResize(options: ResizeOptions) {
  const width = ref(options.defaultWidth);
  const isResizing = ref(false);
  
  const startResize = (e: MouseEvent) => { /* ... */ };
  
  return { width, isResizing, startResize };
}
```

**2. 组件化拆分**
```vue
&lt;!-- SidebarContainer.vue --&gt;
&lt;template&gt;
  &lt;div class="sidebar-container"&gt;
    &lt;SidebarTabBar 
      v-if="isVisible" 
      :active-tab="activeTab"
      @tab-change="switchTab"
    /&gt;
    &lt;SidebarContent 
      :active-tab="activeTab"
      :active-sub-tab="activeSubTab"
      :project-id="projectId"
      @insert-file="onInsertFile"
    /&gt;
    &lt;ResizeHandle v-if="isVisible" @start-resize="startResize" /&gt;
    &lt;SidebarTrigger v-else @show="showSidebar" /&gt;
  &lt;/div&gt;
&lt;/template&gt;
```

**3. Provide/Inject 上下文管理**
```typescript
// composables/useSidebarContext.ts
export const SidebarContextKey = Symbol('sidebar-context');

export function provideSidebarContext(options: SidebarContextOptions) {
  const context = reactive({
    projectId: options.projectId,
    onInsertFile: options.onInsertFile,
    activeTab: ref('drawings'),
    // ...
  });
  provide(SidebarContextKey, context);
  return context;
}

export function useSidebarContext() {
  return inject(SidebarContextKey);
}
```

---

## 3. 主题系统

### 3.1 涉及文件及核心代码片段

**主要文件**: `apps/frontend/src/contexts/ThemeContext.tsx`

#### 核心代码片段

**Context 定义** (第 6-19 行):
```typescript
interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () =&gt; void;
  setTheme: (dark: boolean) =&gt; void;
}

const ThemeContext = createContext&lt;ThemeContextType | undefined&gt;(undefined);

const THEME_STORAGE_KEY = 'mx-user-dark';
```

**存储与 DOM 同步** (第 24-71 行):
```typescript
function getStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const isDark = stored ? stored === 'true' : true;
    applyThemeToDOM(isDark);
    return isDark;
  } catch {
    applyThemeToDOM(true);
    return true;
  }
}

function applyThemeToDOM(isDark: boolean): void {
  const theme = isDark ? 'dark' : 'light';
  
  document.documentElement.setAttribute('data-theme', theme);
  
  if (isDark) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  
  document.body.setAttribute('data-theme', theme);
}
```

**Theme Provider 组件** (第 73-184 行):
```typescript
export const ThemeProvider: React.FC&lt;ThemeProviderProps&gt; = ({ children }) =&gt; {
  const [isDark, setIsDark] = useState&lt;boolean&gt;(getStoredTheme);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const newTheme = e.newValue === 'true';
        setIsDark(newTheme);
        applyThemeToDOM(newTheme);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent&lt;{ isDark: boolean }&gt;) => {
      const newTheme = e.detail.isDark;
      setIsDark(newTheme);
      applyThemeToDOM(newTheme);
      storeTheme(newTheme);
    };

    window.addEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
    };
  }, []);

  const toggleTheme = useCallback(async () => {
    const newTheme = !isDark;
    
    try {
      const win = window as unknown as {
        mxcadApp?: {
          getVuetify?: () =&gt; Promise&lt;{
            theme: {
              toggle: (themes: string[]) =&gt; void;
              change: (name: string) =&gt; void;
            };
          }&gt;;
        };
      };
      
      if (win.mxcadApp?.getVuetify) {
        const vuetify = await win.mxcadApp.getVuetify();
        vuetify.theme.toggle(['light', 'dark']);
        console.log('[ThemeContext] 通过 mxcad-app 切换主题:', newTheme ? 'dark' : 'light');
        return;
      }
    } catch (error) {
      console.warn('[ThemeContext] mxcad-app 不可用，直接切换:', error);
    }
    
    setIsDark(newTheme);
    applyThemeToDOM(newTheme);
    storeTheme(newTheme);
  }, [isDark]);

  const setTheme = useCallback(async (dark: boolean) => {
    try {
      const win = window as unknown as {
        mxcadApp?: {
          getVuetify?: () =>&gt; Promise&lt;{
            theme: {
              toggle: (themes: string[]) =&gt; void;
              change: (name: string) =&gt; void;
            };
          }&gt;;
        };
      };
      
      if (win.mxcadApp?.getVuetify) {
        const vuetify = await win.mxcadApp.getVuetify();
        vuetify.theme.change(dark ? 'dark' : 'light');
        console.log('[ThemeContext] 通过 mxcad-app 设置主题:', dark ? 'dark' : 'light');
        return;
      }
    } catch (error) {
      console.warn('[ThemeContext] mxcad-app 不可用，直接设置:', error);
    }
    
    setIsDark(dark);
    applyThemeToDOM(dark);
    storeTheme(dark);
  }, []);

  const value: ThemeContextType = {
    isDark,
    toggleTheme,
    setTheme,
  };

  return (
    &lt;ThemeContext.Provider value={value}&gt;
      {children}
    &lt;/ThemeContext.Provider&gt;
  );
};
```

**useTheme hook** (第 189-195 行):
```typescript
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```

### 3.2 对外暴露的接口

**Context API**:
```typescript
interface ThemeContextType {
  isDark: boolean;                    // 当前是否暗色主题
  toggleTheme: () =&gt; void;             // 切换主题
  setTheme: (dark: boolean) =&gt; void;   // 设置主题
}
```

**Provider 组件**:
```typescript
&lt;ThemeProvider&gt;{children}&lt;/ThemeProvider&gt;
```

**CustomEvent** (与 mxcad-app 通信):
- 监听: `mxcad-theme-changed`
- 发出: `mxcad-theme-changed` (从 mxcad-app 内部发出)

**localStorage 键**:
- `mx-user-dark`: 存储主题设置

### 3.3 与 mxcad-app 的通信方式

1. **双向事件同步**
   - React → mxcad-app: 通过 `mxcadApp.getVuetify().theme.change()`
   - mxcad-app → React: 通过 `mxcad-theme-changed` CustomEvent

2. **Vue watch 集成** (在 CADEditorDirect 中)
   ```typescript
   const { watch } = await import('vue');
   watch(
     () => vuetify.theme.global.name.value,
     (themeName) => {
       const isDark = themeName === 'dark';
       window.dispatchEvent(new CustomEvent('mxcad-theme-changed', { detail: { isDark } }));
     }
   );
   ```

3. **localStorage 共享**
   - React 和 mxcad-app 都读写 `mx-user-dark`
   - 通过 `storage` 事件监听跨标签页变更

### 3.4 当前实现的痛点

1. **两套主题系统**
   - React 有自己的 Context + useState
   - mxcad-app (Vue) 有 Vuetify 主题系统
   - 需要双向同步，容易出现不一致

2. **动态导入 Vue 依赖**
   ```typescript
   const { watch } = await import('vue');
   ```
   - 在 React 项目中依赖 Vue 库，增加了包体积
   - 初始化逻辑分散在 CADEditorDirect 中

3. **错误处理不完善**
   - `try/catch` 只是打印警告，没有降级策略
   - mxcad-app 不可用时直接切换本地主题，但没有同步机制

4. **状态变更循环风险**
   - React 改变 → 通知 mxcad-app → mxcad-app 改变 → 通知 React
   - 理论上有 watch 去重，但实际可能出现问题

5. **主题同步初始化时机不明确**
   - `initThemeSync` 在 `initializeMxCADView` 之后调用
   - 依赖 mxcadApp 的加载时机

### 3.5 Vue 3 封装建议

**1. 统一主题管理 composable**
```typescript
// composables/useTheme.ts
import { useVuetifyTheme } from 'vuetify';

export function useTheme() {
  const vuetifyTheme = useVuetifyTheme();
  const isDark = computed(() => vuetifyTheme.global.name.value === 'dark');
  
  const toggleTheme = () => {
    vuetifyTheme.global.name.value = isDark.value ? 'light' : 'dark';
  };
  
  const setTheme = (dark: boolean) => {
    vuetifyTheme.global.name.value = dark ? 'dark' : 'light';
  };
  
  watch(isDark, (newValue) => {
    applyThemeToDOM(newValue);
    localStorage.setItem('mx-user-dark', String(newValue));
  }, { immediate: true });
  
  return { isDark, toggleTheme, setTheme };
}
```

**2. 提供统一的主题配置**
```typescript
// config/themeConfig.ts
export const themeConfig = {
  storageKey: 'mx-user-dark',
  defaultDark: true,
  cssVars: {
    dark: {
      '--bg-primary': '#1a1a2e',
      '--text-primary': '#ffffff',
      // ...
    },
    light: {
      '--bg-primary': '#ffffff',
      '--text-primary': '#1a1a2e',
      // ...
    }
  }
};
```

**3. Vue 3 插件封装**
```typescript
// plugins/theme.ts
import type { App } from 'vue';
import { themeConfig } from '@/config/themeConfig';

export const themePlugin = {
  install(app: App, options: ThemePluginOptions = {}) {
    app.provide('theme-config', { ...themeConfig, ...options });
    app.directive('theme-aware', {
      mounted(el, binding) {
        // 主题感知指令
      }
    });
  }
};
```

---

## 4. 进度条

### 4.1 涉及文件及核心代码片段

**主要文件**: `apps/frontend/src/components/ui/LoadingOverlay.tsx`

**相关文件**: 
- `apps/frontend/src/stores/uiStore.ts`
- `apps/frontend/src/utils/loadingUtils.ts`

#### 核心代码片段

**LoadingOverlay 组件** (LoadingOverlay.tsx):
```typescript
import { useUIStore } from '../../stores/uiStore';
import { createPortal } from 'react-dom';

export const LoadingOverlay = () => {
  const { globalLoading, loadingMessage, loadingProgress } = useUIStore();

  if (!globalLoading) return null;

  return createPortal(
    &lt;div className="fixed inset-0 z-[99999]"&gt;
      &lt;div className="fixed bottom-0 left-0 right-0 h-[20px] bg-gray-900/80 flex items-center justify-center px-4"&gt;
        &lt;div className="absolute top-0 left-0 right-0 h-[3px]"&gt;
          &lt;div
            className="h-full transition-all duration-300"
            style={{ 
              width: loadingProgress &gt; 0 ? `${loadingProgress}%` : '100%',
              background: loadingProgress &gt; 0 
                ? 'linear-gradient(to right, #3b82f6, #22d3ee)' 
                : 'linear-gradient(90deg, transparent, #3b82f6, #22d3ee, #3b82f6, transparent)',
              backgroundSize: loadingProgress &gt; 0 ? '100% 100%' : '200% 100%',
              animation: loadingProgress &gt; 0 ? 'none' : 'shimmer 2s linear infinite'
            }}
          /&gt;
        &lt;/div&gt;
        
        &lt;div className="flex items-center gap-4"&gt;
          &lt;span className="text-white text-xs"&gt;
            {loadingMessage || '加载中...'}
          &lt;/span&gt;
          
          {loadingProgress &gt; 0 &amp;&amp; (
            &lt;span className="text-white text-xs"&gt;
              {loadingProgress.toFixed(1)}%
            &lt;/span&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;
      
      &lt;style&gt;{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}&lt;/style&gt;
    &lt;/div&gt;,
    document.body
  );
};
```

**loadingUtils.ts** (部分片段):
```typescript
import { useUIStore } from '../stores/uiStore';

export function showGlobalLoading(message?: string) {
  const uiStore = useUIStore.getState();
  uiStore.setGlobalLoading(true);
  if (message) {
    uiStore.setLoadingMessage(message);
  }
}

export function hideGlobalLoading() {
  const uiStore = useUIStore.getState();
  uiStore.setGlobalLoading(false);
  uiStore.setLoadingProgress(0);
}

export function setLoadingMessage(message: string) {
  const uiStore = useUIStore.getState();
  uiStore.setLoadingMessage(message);
}

export function setLoadingProgress(progress: number) {
  const uiStore = useUIStore.getState();
  uiStore.setLoadingProgress(progress);
}
```

**uiStore.ts** (部分片段):
```typescript
import { create } from 'zustand';

interface UIState {
  globalLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  
  setGlobalLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setLoadingProgress: (progress: number) => void;
}

export const useUIStore = create&lt;UIState&gt;((set) => ({
  globalLoading: false,
  loadingMessage: '',
  loadingProgress: 0,
  
  setGlobalLoading: (loading) => set({ globalLoading: loading }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
}));
```

### 4.2 对外暴露的接口

**Store API (Zustand)**:
```typescript
interface UIState {
  globalLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  
  setGlobalLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setLoadingProgress: (progress: number) => void;
}
```

**工具函数 API**:
```typescript
showGlobalLoading(message?: string);
hideGlobalLoading();
setLoadingMessage(message: string);
setLoadingProgress(progress: number);
```

**组件 API**:
```tsx
&lt;LoadingOverlay /&gt;  // 无 props，自动从 store 获取状态
```

### 4.3 与 mxcad-app 的通信方式

1. **通过工具函数间接调用**
   - mxcadManager 中调用 `showGlobalLoading()` / `hideGlobalLoading()`
   - 不直接与 mxcad-app 通信

2. **Zustand store 作为单一数据源**
   - React 组件读取 store 渲染
   - mxcadManager 通过工具函数更新 store

### 4.4 当前实现的痛点

1. **Store 与组件强绑定**
   - LoadingOverlay 直接导入 useUIStore
   - 难以在不同项目中复用

2. **动画样式内联**
   ```typescript
   &lt;style&gt;{`
     @keyframes shimmer { ... }
   `}&lt;/style&gt;
   ```
   - CSS 定义在 TS 中，难以维护

3. **进度状态不统一**
   - `loadingProgress: 0` 表示无进度（显示 shimmer）
   - `loadingProgress > 0` 表示有具体进度
   - 语义不清晰

4. **Portal 挂载目标硬编码**
   ```typescript
   createPortal(..., document.body);
   ```
   - 不可配置

### 4.5 Vue 3 封装建议

**1. 组合式函数封装**
```typescript
// composables/useLoading.ts
import { ref, computed } from 'vue';

export function useLoading() {
  const isLoading = ref(false);
  const message = ref('加载中...');
  const progress = ref&lt;number | null&gt;(null);
  
  const show = (msg?: string) => {
    isLoading.value = true;
    if (msg) message.value = msg;
  };
  
  const hide = () => {
    isLoading.value = false;
    progress.value = null;
  };
  
  const setProgress = (p: number) => {
    progress.value = p;
  };
  
  const hasProgress = computed(() => progress.value !== null);
  
  return {
    isLoading, message, progress, hasProgress,
    show, hide, setProgress
  };
}
```

**2. Provide/Inject 全局注入**
```typescript
// composables/useGlobalLoading.ts
import { createInjectionState } from '@vueuse/core';

const [useProvideGlobalLoading, useGlobalLoading] = createInjectionState(() => {
  return useLoading();
});

export { useProvideGlobalLoading, useGlobalLoading };
```

**3. 组件实现**
```vue
&lt;!-- components/GlobalLoading.vue --&gt;
&lt;template&gt;
  &lt;Teleport to="body"&gt;
    &lt;Transition name="fade"&gt;
      &lt;div v-if="isLoading" class="global-loading"&gt;
        &lt;div class="loading-bar"&gt;
          &lt;div 
            class="loading-progress"
            :class="{ 'has-progress': hasProgress }"
            :style="{ width: hasProgress ? `${progress}%` : '100%' }"
          /&gt;
        &lt;/div&gt;
        &lt;div class="loading-info"&gt;
          &lt;span class="loading-message"&gt;{{ message }}&lt;/span&gt;
          &lt;span v-if="hasProgress" class="loading-percent"&gt;
            {{ progress.toFixed(1) }}%
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/Transition&gt;
  &lt;/Teleport&gt;
&lt;/template&gt;

&lt;script setup lang="ts"&gt;
import { useGlobalLoading } from '@/composables/useGlobalLoading';
const { isLoading, message, progress, hasProgress } = useGlobalLoading();
&lt;/script&gt;

&lt;style scoped&gt;
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.global-loading {
  position: fixed;
  inset: 0;
  z-index: 99999;
}

.loading-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: rgba(17, 24, 39, 0.8);
}

.loading-progress {
  height: 3px;
  width: 100%;
  transition: all 0.3s;
}

.loading-progress:not(.has-progress) {
  background: linear-gradient(90deg, transparent, #3b82f6, #22d3ee, #3b82f6, transparent);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
&lt;/style&gt;
```

---

## 5. mxcad 管理器

### 5.1 涉及文件及核心代码片段

**主要文件**: `apps/frontend/src/services/mxcadManager.ts`

#### 核心代码片段

**全局状态定义** (第 95-125 行):
```typescript
let currentFileInfo: {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  path?: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  fromPlatform?: boolean;
  updatedAt?: string;
} | null = null;

let cachedPersonalSpaceId: string | null = null;
let documentModified = false;

interface PendingImage {
  url: string;
  fileName: string;
  entity: any;
  file?: File;
}

let pendingImages: PendingImage[] = [];
```

**文档修改状态管理** (第 127-160 行):
```typescript
export function isDocumentModified(): boolean {
  try {
    const mxcad = MxCpp.getCurrentMxCAD();
    if (
      mxcad &amp;&amp;
      typeof (mxcad as unknown as { isModified?: boolean }).isModified === 'boolean'
    ) {
      return (mxcad as unknown as { isModified: boolean }).isModified;
    }
  } catch {
  }
  return documentModified;
}

export function setDocumentModified(modified: boolean): void {
  documentModified = modified;
}

export function resetDocumentModified(): void {
  documentModified = false;
}
```

**未保存变更对话框** (第 185-356 行):
```typescript
export function showUnsavedChangesDialog(): Promise&lt;'save' | 'discard' | 'cancel'&gt; {
  return new Promise((resolve) => {
    const dialogId = 'mxcad-unsaved-changes-dialog';
    let dialog = document.getElementById(dialogId) as HTMLElement;

    if (dialog) {
      document.body.removeChild(dialog);
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-overlay, ${isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.5)'});
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      &lt;div style="...(省略长样式)"&gt;
        &lt;div style="..."&gt;
          &lt;svg ...&gt;&lt;/svg&gt;
        &lt;/div&gt;
        &lt;h3&gt;未保存的更改&lt;/h3&gt;
        &lt;p&gt;当前图纸有未保存的更改，是否保存？&lt;/p&gt;
      &lt;/div&gt;
      &lt;div style="..."&gt;
        &lt;button id="mxcad-unsaved-cancel"&gt;取消&lt;/button&gt;
        &lt;button id="mxcad-unsaved-discard"&gt;不保存&lt;/button&gt;
        &lt;button id="mxcad-unsaved-save"&gt;保存&lt;/button&gt;
      &lt;/div&gt;
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#mxcad-unsaved-cancel');
    const discardBtn = dialog.querySelector('#mxcad-unsaved-discard');
    const saveBtn = dialog.querySelector('#mxcad-unsaved-save');

    const cleanup = () => {
      if (dialog &amp;&amp; dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
      }
    };

    cancelBtn?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
    discardBtn?.addEventListener('click', () => { cleanup(); resolve('discard'); });
    saveBtn?.addEventListener('click', () => { cleanup(); resolve('save'); });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) { cleanup(); resolve('cancel'); }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeyDown);
        cleanup();
        resolve('cancel');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  });
}

export async function checkAndConfirmUnsavedChanges(): Promise&lt;boolean&gt; {
  if (!isDocumentModified()) {
    return true;
  }

  const choice = await showUnsavedChangesDialog();

  if (choice === 'cancel') {
    return false;
  }

  if (choice === 'save') {
    try {
      await MxFun.sendStringToExecute('Mx_Save');
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (isDocumentModified()) {
        return false;
      }
    } catch (error) {
      console.error('保存失败:', error);
      return false;
    }
  }

  if (choice === 'discard') {
    resetDocumentModified();
  }

  return true;
}
```

**文件信息设置函数** (第 417-459 行):
```typescript
export function setCurrentFileInfo(fileInfo: {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  path?: string;
  fromPlatform?: boolean;
  updatedAt?: string;
}) {
  currentFileInfo = fileInfo;
}

export function getCurrentFileInfo() {
  return currentFileInfo;
}

export function setPersonalSpaceId(personalSpaceId: string | null) {
  cachedPersonalSpaceId = personalSpaceId;
}

export function setNavigateFunction(navigate: (path: string) => void) {
  navigateFunction = navigate;
}

export function clearCurrentFileInfo() {
  currentFileInfo = null;
  navigateFunction = null;
}

export function refreshFileName() {
  const fileName = currentFileInfo?.name || '';
  try {
    globalThis.MxPluginContext.useFileName().fileName.value = formatEditorFileName(fileName);
  } catch (error) {
    console.error('[refreshFileName] 刷新文件名失败:', error);
  }
}
```

**返回命令注册** (第 547-570 行):
```typescript
MxFun.addCommand('return-to-cloud-map-management', () => {
  mxcadManager.showMxCAD(false);

  if (currentFileInfo?.fromPlatform &amp;&amp; window.opener) {
    window.close();
    return;
  }

  if (!currentFileInfo) {
    navigateToProjectsList();
    return;
  }

  const { parentId, projectId, personalSpaceId, libraryKey } = currentFileInfo;
  const targetPath = calculateReturnPath(parentId, projectId, personalSpaceId, libraryKey);
  navigateTo(targetPath);
});
```

**打开已上传文件** (第 1114-1151 行):
```typescript
export async function openUploadedFile(
  newNodeId: string,
  uploadTargetNodeId: string
): Promise&lt;void&gt; {
  setLoadingMessage(DEFAULT_MESSAGES.OPENING_FILE);

  const fileInfo = await waitForFileReady(newNodeId);

  if (!fileInfo) {
    hideGlobalLoading();
    throw new Error('文件转换未完成，请稍后在文件列表中查看');
  }

  const projectId = await getProjectId(uploadTargetNodeId, fileInfo, newNodeId);

  setCurrentFileInfo({
    fileId: newNodeId,
    parentId: fileInfo.parentId || uploadTargetNodeId,
    projectId,
    name: fileInfo.name,
    personalSpaceId: cachedPersonalSpaceId,
  });

  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  await mxcadManager.openFile(mxcadFileUrl);

  window.dispatchEvent(
    new CustomEvent('mxcad-file-opened', {
      detail: {
        fileId: newNodeId,
        parentId: fileInfo.parentId || uploadTargetNodeId,
        projectId,
      },
    })
  );
}
```

**打开资源库文件** (第 1153-1244 行):
```typescript
export async function openLibraryDrawing(
  nodeId: string,
  fileName?: string,
  nodePath?: string,
  updatedAt?: string
): Promise&lt;void&gt; {
  try {
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    let finalFileName = fileName;
    let finalNodePath = nodePath;
    let finalUpdatedAt = updatedAt;

    if (!finalFileName || !finalNodePath) {
      const { libraryApi } = await import('./libraryApi');
      const nodeResponse = await libraryApi.getDrawingNode(nodeId);
      const node = nodeResponse.data as any;
      finalFileName = finalFileName || node.name;
      finalNodePath = finalNodePath || node.path;
      finalUpdatedAt = finalUpdatedAt || node.updatedAt;
    }

    if (!finalNodePath) {
      throw new Error('无法获取文件路径');
    }

    if (!finalFileName) {
      throw new Error('无法获取文件名');
    }

    let libraryFileUrl = `/api/library/drawing/filesData/${finalNodePath}`;
    let cacheTimestamp: number | undefined;
    if (finalUpdatedAt) {
      cacheTimestamp = new Date(finalUpdatedAt).getTime();
      libraryFileUrl += `?t=${cacheTimestamp}`;
      setCacheTimestamp(cacheTimestamp);
    }

    setCurrentFileInfo({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      name: finalFileName,
      personalSpaceId: null,
      libraryKey: 'drawing',
      path: finalNodePath,
    });

    await mxcadManager.openFile(libraryFileUrl);

    window.dispatchEvent(
      new CustomEvent('mxcad-file-opened', {
        detail: {
          fileId: nodeId,
          parentId: null,
          projectId: null,
          fileUrl: libraryFileUrl,
          fileName: finalFileName,
          libraryKey: 'drawing',
        },
      })
    );

    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    console.error('打开图纸库文件失败:', error);
    throw error;
  }
}
```

### 5.2 对外暴露的接口

**状态管理函数**:
```typescript
setCurrentFileInfo(fileInfo: FileInfo): void;
getCurrentFileInfo(): FileInfo | null;
clearCurrentFileInfo(): void;
setPersonalSpaceId(id: string | null): void;
setNavigateFunction(navigate: (path: string) => void): void;
refreshFileName(): void;
```

**文档修改状态**:
```typescript
isDocumentModified(): boolean;
setDocumentModified(modified: boolean): void;
resetDocumentModified(): void;
checkAndConfirmUnsavedChanges(): Promise&lt;boolean&gt;;
```

**对话框函数**:
```typescript
showUnsavedChangesDialog(): Promise&lt;'save' | 'discard' | 'cancel'&gt;;
showDuplicateFileDialog(filename: string): Promise&lt;'open' | 'upload' | null&gt;;
showSaveConfirmDialog(): Promise&lt;string | null&gt;;
```

**文件操作函数**:
```typescript
openUploadedFile(nodeId: string, parentId: string): Promise&lt;void&gt;;
openLibraryDrawing(nodeId: string, fileName?: string, nodePath?: string, updatedAt?: string): Promise&lt;void&gt;;
openLibraryBlock(nodeId: string, fileName?: string, nodePath?: string, updatedAt?: string): Promise&lt;void&gt;;
openLocalMxwebFile(file: File, noCache?: boolean): Promise&lt;void&gt;;
```

**mxcadManager 对象** (从 mxcad-app 导入并封装):
```typescript
mxcadManager.initializeMxCADView(fileUrl?: string): Promise&lt;void&gt;;
mxcadManager.openFile(url: string, noCache?: boolean): Promise&lt;void&gt;;
mxcadManager.showMxCAD(show: boolean): void;
mxcadManager.isCreated(): boolean;
mxcadManager.isReady(): boolean;
mxcadManager.adjustContainerPosition(width: number): void;
mxcadManager.reloadCurrentFile(): Promise&lt;void&gt;;
mxcadManager.getCurrentFileName(): string;
```

**CustomEvents 发出**:
- `mxcad-file-opened`: 文件打开完成
- `mxcad-database-modify`: 文档修改（内部）

### 5.3 与 mxcad-app 的通信方式

1. **直接 API 调用** (主要方式)
   ```typescript
   import { MxCADView } from 'mxcad-app';
   await mxcadManager.initializeMxCADView(fileUrl);
   await mxcadManager.openFile(url);
   mxcadManager.showMxCAD(true);
   ```

2. **MxFun 命令调用**
   ```typescript
   import { MxFun } from 'mxdraw';
   MxFun.addCommand('command-name', handler);
   MxFun.execCommand('command-name');
   MxFun.sendStringToExecute('Mx_Save');
   ```

3. **MxCpp 访问**
   ```typescript
   import { MxCpp } from 'mxcad';
   const mxcad = MxCpp.getCurrentMxCAD();
   ```

4. **全局对象访问**
   ```typescript
   globalThis.MxPluginContext.useFileName().fileName.value = ...;
   ```

5. **CustomEvent 通信**
   - 发出: `mxcad-file-opened`
   - 监听: 从 mxcad-app 接收各种事件

### 5.4 当前实现的痛点

1. **使用模块级变量作为状态**
   ```typescript
   let currentFileInfo: FileInfo | null = null;
   let documentModified = false;
   let pendingImages: PendingImage[] = [];
   ```
   - 没有响应式更新机制
   - 多组件状态同步困难

2. **手动 DOM 操作创建对话框**
   - 直接 `document.createElement` + `innerHTML`
   - 难以维护和测试
   - 与 React 组件体系脱节

3. **函数体过大**
   - `openLibraryDrawing` 100+ 行
   - `showUnsavedChangesDialog` 170+ 行
   - 职责过多

4. **异步操作无取消机制**
   - `waitForFileReady` 使用简单的 `setTimeout` 轮询
   - 无法取消正在进行的操作

5. **与 CADEditorDirect 强耦合**
   - `setNavigateFunction` 依赖 React Router 的 navigate
   - 难以在非 React 环境中使用

6. **错误处理不完善**
   - 很多函数只是 `console.error` 后重新抛出
   - 缺乏统一的错误处理策略

### 5.5 Vue 3 封装建议

**1. 响应式状态管理**
```typescript
// stores/cadStore.ts
import { defineStore } from 'pinia';

export const useCadStore = defineStore('cad', () => {
  const currentFileInfo = ref&lt;FileInfo | null&gt;(null);
  const documentModified = ref(false);
  const pendingImages = ref&lt;PendingImage[]&gt;([]);
  
  const setCurrentFileInfo = (info: FileInfo) => {
    currentFileInfo.value = info;
  };
  
  const setDocumentModified = (modified: boolean) => {
    documentModified.value = modified;
  };
  
  return {
    currentFileInfo, documentModified, pendingImages,
    setCurrentFileInfo, setDocumentModified
  };
});
```

**2. 对话框组件化**
```vue
&lt;!-- components/UnsavedChangesDialog.vue --&gt;
&lt;script setup lang="ts"&gt;
const props = defineProps&lt;{
  modelValue: boolean;
}&gt;();

const emit = defineEmits&lt;{
  'update:modelValue': [value: boolean];
  action: [choice: 'save' | 'discard' | 'cancel'];
}&gt;();

const handleAction = (choice: 'save' | 'discard' | 'cancel') => {
  emit('action', choice);
  emit('update:modelValue', false);
};
&lt;/script&gt;

&lt;template&gt;
  &lt;Teleport to="body"&gt;
    &lt;Transition name="fade"&gt;
      &lt;div v-if="modelValue" class="dialog-overlay" @click.self="handleAction('cancel')"&gt;
        &lt;div class="dialog-content"&gt;
          &lt;div class="dialog-icon"&gt;...&lt;/div&gt;
          &lt;h3&gt;未保存的更改&lt;/h3&gt;
          &lt;p&gt;当前图纸有未保存的更改，是否保存？&lt;/p&gt;
          &lt;div class="dialog-actions"&gt;
            &lt;button @click="handleAction('cancel')"&gt;取消&lt;/button&gt;
            &lt;button @click="handleAction('discard')" class="danger"&gt;不保存&lt;/button&gt;
            &lt;button @click="handleAction('save')" class="primary"&gt;保存&lt;/button&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/Transition&gt;
  &lt;/Teleport&gt;
&lt;/template&gt;
```

**3. 组合式函数拆分**
```typescript
// composables/useCadFileOperations.ts
export function useCadFileOperations() {
  const { show, hide, setProgress } = useLoading();
  
  const openUploadedFile = async (nodeId: string, parentId: string) => {
    show('正在打开文件...');
    try {
      // ... 逻辑
      hide();
    } catch (error) {
      hide();
      throw error;
    }
  };
  
  const openLibraryDrawing = async (nodeId: string, options?: OpenFileOptions) => {
    // ...
  };
  
  return { openUploadedFile, openLibraryDrawing };
}

// composables/useCadDialogs.ts
export function useCadDialogs() {
  const unsavedChangesDialogVisible = ref(false);
  
  const showUnsavedChangesDialog = (): Promise&lt;'save' | 'discard' | 'cancel'&gt; => {
    return new Promise((resolve) => {
      unsavedChangesDialogVisible.value = true;
      const cleanup = () => {
        unsavedChangesDialogVisible.value = false;
      };
      // ... 事件绑定
    });
  };
  
  return { unsavedChangesDialogVisible, showUnsavedChangesDialog };
}
```

**4. 插件化集成**
```typescript
// plugins/mxcadManager.ts
import type { App } from 'vue';
import { mxcadManager } from 'mxcad-app';

export const mxcadManagerPlugin = {
  install(app: App, options?: MxcadPluginOptions) {
    const manager = reactive({
      ...mxcadManager,
      // 额外封装
    });
    
    app.provide('mxcad-manager', manager);
    app.config.globalProperties.$mxcad = manager;
  }
};
```

---

## 6. 总结与建议

### 6.1 核心架构问题总结

| 模块 | 主要问题 | 严重程度 |
|------|---------|---------|
| CAD 编辑器 | 组件过大(1300+行)、职责过多、竞态条件 | 🔴 高 |
| 侧边栏 | 状态管理复杂、嵌套渲染过深 | 🟡 中 |
| 主题系统 | 双向同步复杂、依赖 Vue 库 | 🟡 中 |
| 进度条 | Store 耦合、样式内联 | 🟢 低 |
| mxcad 管理器 | 无响应式状态、手动 DOM 操作 | 🔴 高 |

### 6.2 Vue 3 封装核心原则

**1. 组合式优先**
- 使用 `composables` 替代 React hooks
- 按功能领域拆分（文件操作、对话框、主题、事件）

**2. 响应式状态**
- 使用 Pinia 或 Vue reactive 替代模块级变量
- 状态变更自动触发 UI 更新

**3. 组件分层清晰**
```
页面层 (Page)
  ↓
容器层 (Container)
  ↓
功能组件 (Feature Components)
  ↓
基础组件 (UI Components)
```

**4. Provide/Inject 上下文管理**
- 避免过深的 prop drilling
- 提供类型安全的上下文访问

**5. Teleport 替代 React Portal**
- Vue 原生支持
- 更简洁的 API

### 6.3 迁移路线图建议

**阶段一: 基础设施搭建** (1-2 周)
1. 搭建 Vue 3 + Vite 项目结构
2. 配置 TypeScript、ESLint、Prettier
3. 集成 Pinia 状态管理
4. 实现基础的 composables 框架

**阶段二: 核心模块迁移** (2-3 周)
1. 主题系统迁移
2. 进度条组件迁移
3. mxcadManager 响应式改造
4. 事件总线封装

**阶段三: 业务组件迁移** (3-4 周)
1. 侧边栏组件迁移
2. CAD 编辑器容器迁移
3. 对话框组件化
4. 路由配置

**阶段四: 集成与测试** (2 周)
1. 与 mxcad-app 集成
2. 端到端测试
3. 性能优化
4. 文档完善

### 6.4 关键技术选型建议

| 技术领域 | React 现有方案 | Vue 3 推荐方案 |
|---------|--------------|--------------|
| 状态管理 | Zustand | Pinia |
| 路由 | React Router | Vue Router |
| UI 组件库 | 自定义 | Vuetify (与 mxcad-app 一致) |
| 工具库 | React hooks | Vue composables + VueUse |
| 表单处理 | React Hook Form | VeeValidate |
| 测试框架 | Vitest + React Testing Library | Vitest + Vue Testing Library |

### 6.5 注意事项

1. **保持与 mxcad-app 一致**
   - 主题系统使用相同的 Vuetify 配置
   - 事件名称保持一致
   - 命令注册方式保持一致

2. **渐进式迁移**
   - 可以考虑使用 Vue 组件在 React 中运行（通过 micro-frontend 方案）
   - 或者先迁移非核心模块，最后迁移 CAD 编辑器

3. **状态同步策略**
   - 避免双向绑定死循环
   - 使用 watch 时注意 immediate 和 deep 选项
   - 考虑使用 VueUse 的 watchOnce/watchDebounced

4. **性能优化**
   - 避免在 render 中创建新函数
   - 使用 markRaw 标记不需要响应式的对象
   - 合理使用 shallowRef/shallowReactive

---

**文档生成时间**: 2026-05-03  
**审计范围**: CAD 编辑器、侧边栏、主题系统、进度条、mxcad 管理器  
**报告目的**: 为 Vue 3 封装层设计提供 React 现有实现参考