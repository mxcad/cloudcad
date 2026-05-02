# Vue 3 迁移方案：基于 mxcad-app 集成的详细规划

**生成日期**: 2026-05-02
**当前分支**: refactor/circular-deps
**目标**: 确定 Vue 3 项目如何复用 mxcad-app 的 Vuetify 3 依赖及状态同步方案

---

## 1. mxcad-app Vuetify 3 集成现状分析

### 1.1 当前集成架构

```
┌─────────────────────────────────────────────────────────────┐
│              CloudCAD Frontend (React)                       │
│  ┌─────────────────────┐  ┌─────────────────────────────┐ │
│  │   ThemeContext      │  │    CADEditorDirect.tsx       │ │
│  │   (主题状态管理)     │  │    (mxcad-app 容器)          │ │
│  └──────────┬──────────┘  └──────────────┬──────────────┘ │
└─────────────┼────────────────────────────┼────────────────┘
              │                            │
              │ CustomEvent                │ 动态 import
              │ mxcad-theme-changed        ▼
              │                   ┌─────────────────┐
              │                   │   mxcad-app     │
              │                   │   (Vue + Vuetify)│
              │                   │   getVuetify()   │
              │                   └─────────────────┘
```

### 1.2 mxcad-app 暴露的关键 API

| API 方法 | 返回类型 | 用途 | Vue 3 可复用性 |
|---------|---------|------|----------------|
| `mxcadApp.getVuetify()` | `Vuetify` 实例 | 获取 Vuetify 主题管理器 | ✅ 完全可复用 |
| `mxcadApp.setStaticAssetPath()` | `void` | 设置静态资源路径 | ✅ 完全可复用 |
| `mxcadApp.initConfig()` | `void` | 初始化 JSON 配置 | ✅ 完全可复用 |
| `mxcadApp.getMxCADView()` | `MxCADView` | 获取 CAD 视图实例 | ✅ 完全可复用 |

### 1.3 Vuetify 3 在 mxcad-app 中的使用场景

| 组件/功能 | 配置来源 | 说明 |
|----------|---------|------|
| 主题系统 | `myVuetifyThemeConfig.json` | 明暗主题切换 |
| 工具栏按钮 | `myUiConfig.json` → `mTopButtonBarData` | CAD 操作工具栏 |
| 菜单栏 | `myUiConfig.json` → `mMenuBarData` | 文件/编辑/视图菜单 |
| 右键菜单 | `myUiConfig.json` → `mRightMenuData` | 绘图区域上下文菜单 |
| 对话框 | `myUiConfig.json` → `Mx_SetAppDialog` | 设置、关于等对话框 |
| 侧边抽屉 | `myUiConfig.json` → `leftDrawerComponents` | 图块库、图纸库 |

---

## 2. Vue 3 项目复用 Vuetify 3 依赖的方案

### 2.1 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|-----|------|------|--------|
| **A. 共享 mxcad-app 的 Vuetify 实例** | 无需重复打包 Vuetify，保持主题同步 | 依赖 mxcad-app 加载 | ⭐⭐⭐⭐⭐ |
| B. Vue 3 项目独立引入 Vuetify | 完全独立 | 增加包体积 (~150KB)，主题需手动同步 | ⭐⭐⭐ |
| C. 使用其他 UI 组件库 | 不依赖 Vuetify | 无法使用 mxcad-app 的 UI 配置 | ⭐⭐ |

### 2.2 推荐方案：共享 mxcad-app 的 Vuetify 实例

**核心思路**: Vue 3 项目通过 `mxcadApp.getVuetify()` 获取 Vuetify 实例，无需单独安装 Vuetify 依赖。

#### 2.2.1 Vite 配置调整

**文件**: `apps/frontend/vite.config.ts` (Vue 3 版本)

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { mxcadAssetsPlugin } from 'mxcad-app/vite';

// 共享 Vuetify 的 chunks 配置（mxcad-app 已包含）
const sharedLibraries = ['vue', 'vuetify'];

export default defineConfig({
  plugins: [
    vue(),
    mxcadAssetsPlugin({
      libraryNames: sharedLibraries,
    }),
  ],
  optimizeDeps: {
    // 预构建时包含共享库
    include: [...sharedLibraries, 'axios', 'pinia'],
    exclude: ['mxcad-app'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 核心
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // 共享 Vuetify（来自 mxcad-app）
          'vendor-vuetify': ['vuetify'],
          // mxcad-app CAD 核心
          'vendor-cad': ['mxcad-app'],
        },
      },
    },
  },
});
```

#### 2.2.2 Vuetify 初始化封装

**文件**: `src/plugins/vuetify.ts` (新建)

```typescript
import type { Vuetify } from 'vuetify';

let vuetifyInstance: Vuetify | null = null;

export async function getSharedVuetify(): Promise<Vuetify> {
  if (vuetifyInstance) {
    return vuetifyInstance;
  }

  // 从 mxcad-app 获取 Vuetify 实例
  const { mxcadApp } = await import('mxcad-app');
  vuetifyInstance = await mxcadApp.getVuetify();
  
  return vuetifyInstance;
}

export async function initVuetifyTheme(configUrl: string) {
  const vuetify = await getSharedVuetify();
  
  // 注册主题变更监听
  const { watch } = await import('vue');
  watch(
    () => vuetify.theme.global.name.value,
    (themeName) => {
      const isDark = themeName === 'dark';
      // 通知外部（Vue/Pinia store）
      window.dispatchEvent(
        new CustomEvent('vue-theme-changed', {
          detail: { isDark },
        })
      );
    }
  );

  return vuetify;
}
```

#### 2.2.3 Vue 3 应用入口调整

**文件**: `src/main.ts` (新建 Vue 3 入口)

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initVuetifyTheme } from './plugins/vuetify';
import './styles/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// 初始化 Vuetify 主题同步
const configUrl = window.location.origin;
initVuetifyTheme(configUrl).then((vuetify) => {
  // 将 vuetify 实例提供给 Vue 应用（如需要）
  app.provide('vuetify', vuetify);
});

app.mount('#app');
```

---

## 3. React 与 Vue 状态同步清单

### 3.1 需要同步的状态

| 状态类型 | React 端实现 | Vue 3 端实现 | 同步机制 | 同步方向 |
|---------|-------------|--------------|---------|---------|
| **主题（明/暗）** | `ThemeContext` + `localStorage` | Pinia store + `useTheme()` | CustomEvent + `localStorage` | 双向同步 |
| **用户认证** | `AuthContext` + JWT | Pinia store + `useAuth()` | `localStorage` (JWT) + API | 单向（无状态） |
| **当前文件** | `CADEditorDirect` state | Pinia store | CustomEvent | 双向同步 |
| **UI 配置** | `myUiConfig.json` | 同 JSON 文件 | mxcad-app 内部 | 不需要同步 |
| **服务器配置** | `myServerConfig.json` | 同 JSON 文件 | mxcad-app 内部 | 不需要同步 |

### 3.2 主题同步详细方案

#### 3.2.1 主题同步流程图

```
┌─────────────────────┐         ┌─────────────────────┐
│   React 应用         │         │   Vue 3 应用         │
│   (当前前端)          │         │   (迁移目标)         │
│                      │         │                      │
│  ThemeContext        │         │  useTheme()          │
│  - isDark            │         │  - isDark            │
│  - toggleTheme()     │         │  - toggleTheme()    │
│         │            │         │         │            │
└─────────┼─────────────┘         └─────────┼─────────────┘
          │                                │
          │     ┌─────────────────┐       │
          │     │  localStorage   │       │
          │     │  mx-user-dark   │       │
          │     └────────┬────────┘       │
          │              │                │
          │     ┌────────┴────────┐       │
          │     │  mxcad-app     │       │
          │     │  (共享 Vuetify) │       │
          │     │  getVuetify()  │       │
          │     └────────┬────────┘       │
          │              │                │
          │    CustomEvent               │
          │    mxcad-theme-changed        │
          └──────────────┼────────────────┘
                         │
              ┌──────────┴──────────┐
              │   同步状态到 DOM    │
              │  data-theme="dark"  │
              │  body.dark-theme   │
              └───────────────────┘
```

#### 3.2.2 Vue 3 主题 Pinia Store

**文件**: `src/stores/theme.ts` (新建)

```typescript
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getSharedVuetify } from '../plugins/vuetify';

const THEME_STORAGE_KEY = 'mx-user-dark';

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref<boolean>(
    localStorage.getItem(THEME_STORAGE_KEY) === 'true'
  );

  async function toggleTheme() {
    const vuetify = await getSharedVuetify();
    vuetify.theme.toggle(['light', 'dark']);
  }

  async function setTheme(dark: boolean) {
    const vuetify = await getSharedVuetify();
    vuetify.theme.change(dark ? 'dark' : 'light');
  }

  // 监听来自 mxcad-app 的主题变更事件
  if (typeof window !== 'undefined') {
    window.addEventListener('vue-theme-changed', ((e: CustomEvent) => {
      isDark.value = e.detail.isDark;
      localStorage.setItem(THEME_STORAGE_KEY, String(e.detail.isDark));
    }) as EventListener);

    // 监听 localStorage 变化（多标签页同步）
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        isDark.value = e.newValue === 'true';
      }
    });
  }

  return { isDark, toggleTheme, setTheme };
});
```

#### 3.2.3 Vue 3 useTheme Composable

**文件**: `src/composables/useTheme.ts` (新建)

```typescript
import { computed } from 'vue';
import { useThemeStore } from '../stores/theme';

export function useTheme() {
  const store = useThemeStore();

  const isDark = computed(() => store.isDark);
  const toggleTheme = () => store.toggleTheme();
  const setTheme = (dark: boolean) => store.setTheme(dark);

  return { isDark, toggleTheme, setTheme };
}
```

### 3.3 用户认证同步方案

#### 3.3.1 认证状态来源

| 来源 | React 端 | Vue 3 端 |
|------|---------|----------|
| JWT Token | `localStorage` (`auth_token`) | `localStorage` (`auth_token`) |
| 用户信息 | `AuthContext` | Pinia `useAuthStore` |
| 刷新机制 | `apiClient` 拦截器 | 同上（复用） |

#### 3.3.2 Vue 3 认证 Pinia Store

**文件**: `src/stores/auth.ts` (新建)

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '../services/authApi';

export interface User {
  id: string;
  username: string;
  email: string;
  // ... 其他字段
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('auth_token'));

  const isAuthenticated = computed(() => !!token.value);

  async function login(credentials: { email: string; password: string }) {
    const response = await authApi.login(credentials);
    token.value = response.data.access_token;
    localStorage.setItem('auth_token', response.data.access_token);
    user.value = response.data.user;
    return response.data;
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('auth_token');
  }

  return { user, token, isAuthenticated, login, logout };
});
```

---

## 4. mxcad-app 初始化配置在 Vue 3 中的调整

### 4.1 配置文件清单

| 配置文件 | 路径 | 用途 | Vue 3 是否需要调整 |
|---------|------|------|-------------------|
| `myUiConfig.json` | `public/ini/` | UI 菜单、工具栏配置 | ❌ 不需要 |
| `myVuetifyThemeConfig.json` | `public/ini/` | 主题明暗配置 | ❌ 不需要 |
| `myServerConfig.json` | `public/ini/` | API、上传配置 | ❌ 不需要 |
| `myQuickCommand.json` | `public/ini/` | 快捷命令配置 | ❌ 不需要 |
| `mySketchesAndNotesUiConfig.json` | `public/ini/` | 草图笔记 UI | ❌ 不需要 |

### 4.2 配置文件在 Vue 3 中的加载方式

**结论**: 所有 JSON 配置文件**不需要调整**，可以直接复用。

#### 4.2.1 配置加载代码对比

**React (当前)**:
```typescript
// CADEditorDirect.tsx:349-362
const initMxCADConfig = async () => {
  const { mxcadApp } = await import('mxcad-app');
  const configUrl = window.location.origin;
  
  mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
  mxcadApp.initConfig({
    uiConfig: `${configUrl}/ini/myUiConfig.json`,
    themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
    serverConfig: `${configUrl}/ini/myServerConfig.json`,
    // ...
  });
};
```

**Vue 3 (迁移后)**:
```typescript
// src/plugins/mxcad.ts (新建)
export async function initMxCADConfig() {
  const { mxcadApp } = await import('mxcad-app');
  const configUrl = window.location.origin;
  
  mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
  mxcadApp.initConfig({
    uiConfig: `${configUrl}/ini/myUiConfig.json`,
    themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
    serverConfig: `${configUrl}/ini/myServerConfig.json`,
    quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
    sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
  });
}
```

#### 4.2.2 静态资源路径说明

| 资源类型 | React 前端路径 | Vue 3 前端路径 | 是否需要调整 |
|---------|--------------|--------------|------------|
| 公共 JSON 配置 | `public/ini/*.json` | `public/ini/*.json` | ❌ 不需要 |
| mxcad-app 静态资源 | `/mxcadAppAssets/` | `/mxcadAppAssets/` | ❌ 不需要 |
| Vue 组件 | `src/components/` | `src/components/` | ❌ 不需要 |
| 样式文件 | `src/styles/` | `src/styles/` | ⚠️ 需要调整 |

### 4.3 Vite 公共路径配置

**文件**: `vite.config.ts` (Vue 3 版本)

```typescript
export default defineConfig({
  base: '/',
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  // 确保 public 目录的静态资源路径正确
  publicDir: 'public',
});
```

---

## 5. Vue 3 项目结构规划

### 5.1 目录结构

```
apps/frontend/                    # 前端项目根目录
├── src/                         # Vue 3 源码
│   ├── assets/                  # 静态资源
│   ├── components/              # Vue 组件
│   │   ├── ui/                  # 基础 UI 组件
│   │   ├── file-system/         # 文件系统组件
│   │   ├── cad-editor/          # CAD 编辑器组件
│   │   └── auth/                # 认证相关组件
│   ├── composables/             # Vue Composables (替代 React Hooks)
│   │   ├── useTheme.ts          # 主题
│   │   ├── useAuth.ts           # 认证
│   │   ├── usePermission.ts     # 权限
│   │   ├── useFileSystem.ts     # 文件系统
│   │   └── useMxCadEditor.ts    # CAD 编辑器
│   ├── stores/                  # Pinia Stores
│   │   ├── theme.ts             # 主题状态
│   │   ├── auth.ts              # 认证状态
│   │   ├── fileSystem.ts        # 文件系统状态
│   │   └── permission.ts        # 权限状态
│   ├── services/                # API 服务 (复用现有)
│   │   ├── apiClient.ts         # Axios 实例
│   │   ├── authApi.ts           # 认证 API
│   │   ├── filesApi.ts          # 文件 API
│   │   └── ...
│   ├── plugins/                 # Vue 插件
│   │   ├── vuetify.ts           # Vuetify 初始化
│   │   └── mxcad.ts             # mxcad-app 初始化
│   ├── router/                  # Vue Router
│   │   └── index.ts
│   ├── views/                   # 页面视图
│   │   ├── Login.vue
│   │   ├── Dashboard.vue
│   │   ├── FileSystemManager.vue
│   │   └── CADEditor.vue
│   ├── styles/                  # 样式
│   │   ├── main.css             # 主样式 (复用)
│   │   └── variables.css        # CSS 变量
│   ├── App.vue                  # 根组件
│   └── main.ts                  # 入口文件
├── public/                      # 公共静态资源 (复用)
│   ├── ini/                     # mxcad-app JSON 配置
│   └── mxcadAppAssets/          # mxcad-app 静态资源
├── vite.config.ts               # Vite 配置
└── package.json                 # 依赖配置
```

### 5.2 Composables 与 React Hooks 对照表

| React Hook | Vue 3 Composable | 说明 |
|------------|-----------------|------|
| `useTheme()` | `useTheme()` | 主题状态 |
| `useAuth()` | `useAuth()` | 认证状态 |
| `usePermission()` | `usePermission()` | 权限检查 |
| `useDocumentTitle()` | `useDocumentTitle()` | 文档标题 |
| `useMxCadEditor()` | `useMxCadEditor()` | CAD 编辑器 |
| `useFileSystem()` | `useFileSystem()` | 文件系统核心 |
| `useFileSystemCRUD()` | 合并到 `useFileSystem()` | 文件 CRUD |
| `useFileSystemNavigation()` | 合并到 `useFileSystem()` | 导航 |
| `useFileSystemSelection()` | 合并到 `useFileSystem()` | 选择 |
| `useFileSystemSearch()` | 合并到 `useFileSystem()` | 搜索 |
| `useFileSystemUI()` | 合并到 `useFileSystem()` | UI 状态 |
| `useMxCadUploadNative()` | `useMxCadUpload()` | 文件上传 |
| `useExternalReferenceUpload()` | `useExternalReference()` | 外部参照 |
| `useLibrary()` | `useLibrary()` | 库管理 |
| `useLibraryPanel()` | `useLibraryPanel()` | 库面板 |
| `useProjectManagement()` | `useProject()` |项目管理 |
| `useBreadcrumbCollapse()` | `useBreadcrumb()` | 面包屑 |
| `useDirectoryImport()` | `useDirectoryImport()` | 目录导入 |
| `useFileListPagination()` | `usePagination()` | 分页 |
| `useFileListSearch()` | `useSearch()` | 搜索 |
| `useSidebarSettings()` | `useSidebar()` | 侧边栏 |
| `useTourVisibility()` | `useTour()` | 导览 |
| `useTour()` | `useTour()` | 导览 |

---

## 6. 迁移任务分解

### 6.1 阶段一：基础设施搭建

| 任务 | 文件 | 说明 | 优先级 |
|------|------|------|--------|
| 创建 Vue 3 项目结构 | `src/` | 目录规划 | P0 |
| 配置 Vite | `vite.config.ts` | Vue 插件 + mxcad 插件 | P0 |
| 迁移样式文件 | `src/styles/` | CSS 变量系统 | P0 |
| 创建 Vuetify 插件 | `src/plugins/vuetify.ts` | 共享 Vuetify 实例 | P0 |
| 创建 mxcad 插件 | `src/plugins/mxcad.ts` | 初始化配置 | P0 |
| 配置 Pinia | `src/stores/` | 状态管理 | P0 |
| 配置 Vue Router | `src/router/` | 路由系统 | P0 |
| 创建主题 Store | `src/stores/theme.ts` | Pinia 主题状态 | P0 |
| 创建认证 Store | `src/stores/auth.ts` | Pinia 认证状态 | P0 |

### 6.2 阶段二：核心功能迁移

| 任务 | 文件 | 说明 | 优先级 |
|------|------|------|--------|
| 迁移 API 服务 | `src/services/` | 复用现有配置 | P0 |
| 创建 useTheme Composable | `src/composables/useTheme.ts` | 主题 composable | P0 |
| 创建 useAuth Composable | `src/composables/useAuth.ts` | 认证 composable | P0 |
| 创建 usePermission Composable | `src/composables/usePermission.ts` | 权限 composable | P0 |
| 创建 useMxCadEditor Composable | `src/composables/useMxCadEditor.ts` | CAD 编辑器 | P0 |
| 迁移简单页面 | `views/PhoneVerification.vue` 等 | 简单页面 | P1 |
| 迁移中等页面 | `views/Dashboard.vue` 等 | 中等页面 | P1 |
| 迁移复杂页面 | `views/FileSystemManager.vue` 等 | 复杂页面 | P2 |

### 6.3 阶段三：组件迁移

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 迁移基础 UI 组件 | Button, Modal, Toast 等 | P0 |
| 迁移文件系统组件 | FileItem, FileGrid 等 | P1 |
| 迁移 CAD 编辑器组件 | CADEditorDirect 内部组件 | P2 |
| 迁移权限相关组件 | PermissionAssignment 等 | P1 |

---

## 7. 关键技术决策

### 7.1 为什么选择共享 Vuetify 实例？

1. **包体积优化**: mxcad-app 已包含 Vuetify，无需重复打包
2. **主题同步简化**: 同一 Vuetify 实例，主题变更自动同步
3. **UI 配置复用**: mxcad-app 的 JSON UI 配置直接可用

### 7.2 状态同步策略

1. **主题**: localStorage + CustomEvent 双向同步
2. **认证**: localStorage JWT，API 层自动处理刷新
3. **文件**: CustomEvent 同步（CAD 编辑器内部状态）

### 7.3 Composables vs Hooks 转换规则

| React Hook 模式 | Vue 3 Composable 模式 |
|----------------|----------------------|
| `useState()` | `ref()` / `reactive()` |
| `useEffect()` | `onMounted()` + `watch()` |
| `useCallback()` | `useCallback()` (VueUse) |
| `useMemo()` | `computed()` |
| `useContext()` | `inject()` + `provide()` |
| `useRef()` | `ref()` |

---

## 8. 风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| mxcad-app 版本升级破坏兼容性 | 高 | 低 | 锁定版本，定期回归测试 |
| Vuetify 实例在 Vue 3 中行为异常 | 中 | 低 | 充分测试主题切换功能 |
| 主题同步事件丢失 | 中 | 低 | localStorage 作为 fallback |
| Vue 3 与 Vue 2 (mxcad-app) 冲突 | 高 | 中 | mxcad-app 使用独立 Vue 实例 |

---

## 9. 后续步骤

1. **立即行动**:
   - 确认 mxcad-app 版本 (~1.0.60)
   - 创建 Vue 3 概念验证 (PoC) 项目
   - 测试 `getVuetify()` API 在 Vue 3 环境中的可用性

2. **短期计划** (1-2周):
   - 完成基础设施搭建
   - 完成主题系统迁移
   - 完成认证系统迁移

3. **中期计划** (1-2月):
   - 分批次迁移页面组件
   - 进行功能回归测试
   - 性能优化

---

**文档版本**: 1.0
**审核状态**: 待审核
**下一步**: 评审此方案，确定迁移时间表
