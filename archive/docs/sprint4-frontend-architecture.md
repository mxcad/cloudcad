# 冲刺四：前端架构设计方案

> CloudCAD React → Vue 3 迁移技术架构
> 版本：1.0
> 日期：2026-05-03

---

## 一、Vue 3 应用骨架

### 1.1 目录结构

```
packages/frontend-vue/
├── index.html                    # HTML 入口
├── vite.config.ts                # Vite 配置（Vue 插件）
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.ts            # Tailwind CSS v4 配置
├── env.d.ts                      # 环境类型声明
│
├── src/
│   ├── main.ts                   # 应用入口：createApp + 插件注册
│   ├── App.vue                   # 根组件：Provider 层 + RouterView
│   │
│   ├── router/
│   │   ├── index.ts              # createRouter + 全局守卫
│   │   ├── routes.ts             # 路由表定义
│   │   └── guards/
│   │       ├── auth.guard.ts     # 认证守卫
│   │       └── permission.guard.ts # 权限守卫
│   │
│   ├── stores/
│   │   ├── auth.store.ts         # 认证状态（由 AuthContext 迁移）
│   │   ├── file-system.store.ts  # 文件系统状态
│   │   ├── ui.store.ts           # UI 状态
│   │   ├── notification.store.ts # 通知状态
│   │   └── index.ts              # 统一导出
│   │
│   ├── composables/              # Vue 组合式函数（替代 React Hooks）
│   │   ├── useAuth.ts            # 认证操作封装
│   │   ├── usePermission.ts      # 权限检查
│   │   ├── useBreadcrumb.ts      # 面包屑导航
│   │   ├── useMxCadEditor.ts     # CAD 编辑器集成
│   │   ├── useMxCadInstance.ts   # CAD 实例管理
│   │   ├── useMxCadUpload.ts     # CAD 文件上传
│   │   ├── useExternalReference.ts # 外部参照
│   │   ├── useFileSystem.ts      # 文件系统操作（子模块拆分同现有 hooks/file-system/）
│   │   ├── useLibrary.ts         # 资源库操作
│   │   ├── useTour.ts            # 引导系统
│   │   ├── useSidebar.ts         # 侧边栏
│   │   └── useTheme.ts           # 主题管理
│   │
│   ├── components/
│   │   ├── layouts/
│   │   │   ├── AppLayout.vue     # 主布局（替代 Layout.tsx）
│   │   │   ├── AuthLayout.vue    # 认证页布局
│   │   │   ├── AppHeader.vue     # 顶部导航栏
│   │   │   ├── packagesidebar.vue    # 侧边栏导航
│   │   │   └── NavItem.vue       # 导航项
│   │   │
│   │   ├── ui/                   # 基础 UI 组件
│   │   │   ├── Button.vue
│   │   │   ├── Modal.vue
│   │   │   ├── Toast.vue
│   │   │   ├── Tooltip.vue
│   │   │   ├── Pagination.vue
│   │   │   ├── ConfirmDialog.vue
│   │   │   ├── LoadingOverlay.vue
│   │   │   ├── PageSkeleton.vue
│   │   │   └── TruncateText.vue
│   │   │
│   │   ├── file-system/          # 文件系统专用组件
│   │   │   ├── FileSystemContent.vue
│   │   │   ├── FileSystemHeader.vue
│   │   │   ├── FileSystemBatchActions.vue
│   │   │   ├── FileItem.vue
│   │   │   └── ...
│   │   │
│   │   ├── modals/               # 模态框组件
│   │   ├── mxcad/                # MxCAD 集成组件
│   │   │   ├── MxCadContainer.vue # CAD 编辑器容器
│   │   │   ├── MxCadUploader.vue  # CAD 上传组件
│   │   │   └── CollaborateSidebar.vue
│   │   │
│   │   ├── tour/                 # 引导系统组件
│   │   └── common/               # 通用业务组件
│   │
│   ├── pages/                    # 路由页面组件
│   │   ├── auth/
│   │   │   ├── LoginPage.vue
│   │   │   ├── RegisterPage.vue
│   │   │   ├── ForgotPasswordPage.vue
│   │   │   ├── ResetPasswordPage.vue
│   │   │   ├── EmailVerificationPage.vue
│   │   │   └── PhoneVerificationPage.vue
│   │   ├── DashboardPage.vue
│   │   ├── FileSystemPage.vue
│   │   ├── CADEditorPage.vue
│   │   ├── ProfilePage.vue
│   │   ├── admin/
│   │   │   ├── UserManagementPage.vue
│   │   │   ├── RoleManagementPage.vue
│   │   │   ├── FontLibraryPage.vue
│   │   │   ├── LibraryManagerPage.vue
│   │   │   ├── AuditLogPage.vue
│   │   │   ├── SystemMonitorPage.vue
│   │   │   └── RuntimeConfigPage.vue
│   │   └── profile/
│   │       ├── ProfileAccountTab.vue
│   │       ├── ProfileEmailTab.vue
│   │       ├── ProfilePasswordTab.vue
│   │       ├── ProfilePhoneTab.vue
│   │       └── ProfileWechatTab.vue
│   │
│   ├── services/                 # API 服务层（直接复用，无需迁移）
│   │   └── ...                   # 从现有 services/ 整体搬迁
│   │
│   ├── config/                   # 应用配置（直接复用）
│   │   └── ...
│   │
│   ├── constants/                # 常量定义（直接复用）
│   │   └── ...
│   │
│   ├── types/                    # TypeScript 类型（直接复用）
│   │   └── ...
│   │
│   ├── utils/                    # 工具函数（直接复用）
│   │   └── ...
│   │
│   └── styles/                   # 样式文件（直接复用）
│       ├── app.css
│       ├── theme.css
│       ├── transitions.css
│       └── icon.css
```

### 1.2 入口文件 main.ts

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

// 样式导入
import './styles/transitions.css';
import './styles/theme.css';
import './styles/app.css';
import './styles/icon.css';

// API 客户端初始化
import { initApiClient } from './services/apiClient';
import { fetchBrandConfig } from './constants/appConfig';

async function bootstrap() {
  // 阶段一：初始化基础设施（对应 React 版 AppInitializer）
  try {
    await Promise.all([initApiClient(), fetchBrandConfig()]);
  } catch (err) {
    console.error('[CloudCAD] 初始化失败:', err);
    // 即使失败也继续，使用默认配置
  }

  // 阶段二：创建 Vue 应用
  const app = createApp(App);

  // 注册插件
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);

  // 全局错误处理（替代 React ErrorBoundary）
  app.config.errorHandler = (err, instance, info) => {
    console.error('[CloudCAD] 全局错误:', err, info);
  };

  app.mount('#root');
}

bootstrap();
```

**关键决策说明：**

- **合并初始化逻辑**：React 版本将初始化拆分在 `index.tsx`（AppInitializer）和 `App.tsx`（Provider 嵌套）中。Vue 版本统一在 `main.ts` 的 `bootstrap()` 中完成，消除了 Provider 层级嵌套
- **Pinia 在 Router 之前注册**：确保路由守卫可以访问 Store
- **保留 #root 挂载点**：与现有 HTML 兼容

### 1.3 根组件 App.vue

```vue
<template>
  <BrandProvider>
    <RuntimeConfigProvider>
      <TourProvider>
        <div class="layout-container">
          <!-- 全局加载遮罩 -->
          <LoadingOverlay />
          <!-- CAD 编辑器全局覆盖层 -->
          <CADEditorOverlay />

          <RouterView />
        </div>

        <!-- 全局引导渲染 -->
        <GlobalTourRenderer />
      </TourProvider>
    </RuntimeConfigProvider>
  </BrandProvider>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import LoadingOverlay from './components/ui/LoadingOverlay.vue';
import CADEditorOverlay from './components/mxcad/CADEditorOverlay.vue';
import GlobalTourRenderer from './components/tour/GlobalTourRenderer.vue';

// Provider 组件（见 1.4 节）
import BrandProvider from './components/providers/BrandProvider.vue';
import RuntimeConfigProvider from './components/providers/RuntimeConfigProvider.vue';
import TourProvider from './components/providers/TourProvider.vue';
</script>
```

### 1.4 Provider 迁移策略：Context → Composable + Provide/Inject

现有 7 个 React Context，迁移策略如下：

| React Context | Vue 3 方案 | 说明 |
|---|---|---|
| `ThemeContext` | Pinia Store (`useThemeStore`) | 主题状态全局共享，Store 更直观 |
| `AuthContext` | Pinia Store (`useAuthStore`) | 认证状态需跨组件、守卫访问 |
| `NotificationContext` | Pinia Store (`useNotificationStore`) | 已有 Zustand Store，直接迁移 |
| `BrandContext` | `provide/inject` + Composable | 品牌配置只读且初始化后不变 |
| `RuntimeConfigContext` | `provide/inject` + Composable | 运行时配置只读，低频更新 |
| `SidebarContext` | Pinia Store (`useUIStore`) 扩展 | 侧边栏状态与 UI Store 内聚 |
| `TourContext` | `provide/inject` + Composable | 引导系统状态局部化，无需全局 Store |

**原则**：
- 需要在路由守卫、非组件代码中访问 → Pinia Store
- 只读配置、仅在组件树内共享 → `provide/inject`
- 高频更新、需跨组件修改 → Pinia Store

---

## 二、路由设计

### 2.1 路由表定义（routes.ts）

```typescript
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // ===== 公开路由（无 Layout） =====
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/pages/auth/RegisterPage.vue'),
    meta: { public: true },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('@/pages/auth/EmailVerificationPage.vue'),
    meta: { public: true },
  },
  {
    path: '/verify-phone',
    name: 'verify-phone',
    component: () => import('@/pages/auth/PhoneVerificationPage.vue'),
    meta: { public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/pages/auth/ForgotPasswordPage.vue'),
    meta: { public: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/pages/auth/ResetPasswordPage.vue'),
    meta: { public: true },
  },

  // ===== CAD 编辑器（公开访问，全屏覆盖） =====
  {
    path: '/cad-editor',
    name: 'cad-editor',
    component: () => import('@/pages/CADEditorPage.vue'),
    meta: { public: true, fullscreen: true },
  },
  {
    path: '/cad-editor/:fileId',
    name: 'cad-editor-file',
    component: () => import('@/pages/CADEditorPage.vue'),
    meta: { public: true, fullscreen: true },
  },

  // ===== 受保护路由（需要 Layout） =====
  {
    path: '/',
    component: () => import('@/components/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/cad-editor',
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/pages/DashboardPage.vue'),
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/pages/FileSystemPage.vue'),
      },
      {
        path: 'projects/:projectId/files',
        name: 'project-files',
        component: () => import('@/pages/FileSystemPage.vue'),
      },
      {
        path: 'projects/:projectId/files/:nodeId',
        name: 'project-folder',
        component: () => import('@/pages/FileSystemPage.vue'),
      },
      {
        path: 'personal-space',
        name: 'personal-space',
        component: () => import('@/pages/FileSystemPage.vue'),
        props: { mode: 'personal-space' },
      },
      {
        path: 'personal-space/:nodeId',
        name: 'personal-space-folder',
        component: () => import('@/pages/FileSystemPage.vue'),
        props: { mode: 'personal-space' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/pages/ProfilePage.vue'),
      },

      // ===== 权限保护路由 =====
      {
        path: 'users',
        name: 'users',
        component: () => import('@/pages/admin/UserManagementPage.vue'),
        meta: { permission: 'SYSTEM_USER_READ' },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/pages/admin/RoleManagementPage.vue'),
        meta: { permission: 'SYSTEM_ROLE_READ' },
      },
      {
        path: 'font-library',
        name: 'font-library',
        component: () => import('@/pages/admin/FontLibraryPage.vue'),
        meta: { permission: 'SYSTEM_FONT_READ' },
      },
      {
        path: 'library',
        name: 'library',
        component: () => import('@/pages/admin/LibraryManagerPage.vue'),
        meta: { permission: 'LIBRARY_DRAWING_MANAGE' },
      },
      {
        path: 'library/:libraryType',
        name: 'library-type',
        component: () => import('@/pages/admin/LibraryManagerPage.vue'),
        meta: { permission: 'LIBRARY_DRAWING_MANAGE' },
      },
      {
        path: 'library/:libraryType/:nodeId',
        name: 'library-folder',
        component: () => import('@/pages/admin/LibraryManagerPage.vue'),
        meta: { permission: 'LIBRARY_DRAWING_MANAGE' },
      },
      {
        path: 'audit-logs',
        name: 'audit-logs',
        component: () => import('@/pages/admin/AuditLogPage.vue'),
        meta: { permission: 'SYSTEM_ADMIN' },
      },
      {
        path: 'system-monitor',
        name: 'system-monitor',
        component: () => import('@/pages/admin/SystemMonitorPage.vue'),
        meta: { permission: 'SYSTEM_MONITOR' },
      },
      {
        path: 'runtime-config',
        name: 'runtime-config',
        component: () => import('@/pages/admin/RuntimeConfigPage.vue'),
        meta: { permission: 'SYSTEM_CONFIG_READ' },
      },
    ],
  },

  // ===== 兜底路由 =====
  {
    path: '/:pathMatch(.*)*',
    redirect: '/cad-editor',
  },
];
```

### 2.2 路由守卫设计

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { routes } from './routes';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissionStore } from '@/stores/permission.store';
import { SystemPermission } from '@/constants/permissions';

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// 全局前置守卫
router.beforeEach(async (to, _from) => {
  const authStore = useAuthStore();

  // 1. 公开路由直接放行
  if (to.meta.public) {
    return true;
  }

  // 2. 认证检查（对应 React 版 ProtectedRoute）
  if (!authStore.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }

  // 3. Token 有效期检查（懒验证，非每次导航）
  if (authStore.shouldValidate) {
    await authStore.validateToken();
  }

  // 4. 权限检查（对应 React 版 PermissionRoute）
  const requiredPermission = to.meta.permission as SystemPermission | undefined;
  if (requiredPermission) {
    const permissionStore = usePermissionStore();
    if (!permissionStore.hasPermission(requiredPermission)) {
      // 无权限 → 重定向到项目列表
      return { name: 'projects' };
    }
  }

  return true;
});

export default router;
```

### 2.3 React Router → Vue Router 概念映射

| 概念 | React Router v7 | Vue Router v4 | 迁移要点 |
|------|----------------|---------------|---------|
| 路由定义 | `<Route>` JSX 声明式 | `routes[]` 配置式 | 嵌套路由用 `children`，对应 `<RouterView>` |
| 路由守卫 | `<ProtectedRoute>` 组件包装 | `beforeEach` 全局守卫 + `meta` 标记 | 统一在守卫中处理，减少组件层级 |
| 权限守卫 | `<PermissionRoute>` 组件包装 | `meta.permission` + 守卫检查 | 权限信息从 meta 读取，守卫统一拦截 |
| 懒加载 | `React.lazy()` + `<Suspense>` | `() => import(...)` | Vue Router 原生支持，无需 Suspense |
| 加载状态 | `<Suspense fallback={<PageLoader />}>` | `<RouterView v-slot="{ Component }">` + `<Transition>` | 见 2.4 节 |
| 编程导航 | `useNavigate()` | `useRouter().push()` | API 名称不同，逻辑一致 |
| 路由参数 | `useParams()` | `useRoute().params` | 响应式，无需手动监听 |
| 查询参数 | `useSearchParams()` | `useRoute().query` | 响应式 |
| 当前路径 | `useLocation()` | `useRoute().path` | 响应式 |
| 链接导航 | `<Link to="...">` | `<RouterLink to="...">` | 标签名不同 |

### 2.4 页面加载过渡方案

```vue
<!-- App.vue 中的路由视图 -->
<RouterView v-slot="{ Component, route }">
  <Transition name="fade" mode="out-in">
    <component :is="Component" :key="route.path" />
  </Transition>
</RouterView>
```

配合全局 loading 状态（由 Pinia `useUIStore` 管理），在路由守卫中设置：

```typescript
router.beforeEach(() => {
  const uiStore = useUIStore();
  uiStore.setPageLoading(true);
});

router.afterEach(() => {
  const uiStore = useUIStore();
  uiStore.setPageLoading(false);
});
```

---

## 三、状态管理：Zustand → Pinia 迁移

### 3.1 迁移总览

| Zustand Store | Pinia Store | 变化 |
|---|---|---|
| `useFileSystemStore` | `useFileSystemStore` | 状态结构一致，actions 从 `set()` 改为直接修改 |
| `useUIStore` | `useUIStore` | Toast 逻辑改为 Vue 响应式 |
| `useNotificationStore` | `useNotificationStore` | 自动移除用 `watchEffect` 替代 `setTimeout` |
| _(AuthContext)_ | `useAuthStore` | 从 Context 提升为 Store，守卫可直接访问 |
| _(SidebarContext)_ | 并入 `useUIStore` | sidebar 状态与 UI 内聚 |
| _(ThemeContext)_ | `useThemeStore` | 主题切换持久化到 localStorage |

### 3.2 Store 设计：useFileSystemStore

```typescript
// stores/file-system.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FileSystemNode } from '@/types/filesystem';

export const useFileSystemStore = defineStore('fileSystem', () => {
  // ===== State =====
  const currentPath = ref<FileSystemNode[]>([]);
  const selectedItems = ref<string[]>([]);
  const currentParentId = ref<string | null>(null);

  // 私人空间缓存
  const personalSpaceId = ref<string | null>(null);
  const personalSpaceIdLoading = ref(false);

  // 视图设置
  const viewMode = ref<'grid' | 'list'>('grid');
  const sortBy = ref<'name' | 'date' | 'size' | 'type'>('name');
  const sortOrder = ref<'asc' | 'desc'>('asc');

  // 搜索与分页
  const searchTerm = ref('');
  const pageSize = ref(20);

  // ===== Getters =====
  const hasSelection = computed(() => selectedItems.value.length > 0);

  // ===== Actions =====
  function setCurrentPath(path: FileSystemNode[]) {
    currentPath.value = path;
  }

  function addSelectedItem(id: string) {
    if (!selectedItems.value.includes(id)) {
      selectedItems.value.push(id);
    }
  }

  function removeSelectedItem(id: string) {
    selectedItems.value = selectedItems.value.filter((item) => item !== id);
  }

  function clearSelection() {
    selectedItems.value = [];
  }

  function navigateUp() {
    if (currentPath.value.length > 0) {
      currentPath.value.pop();
      const itemNode = currentPath.value[currentPath.value.length - 1];
      currentParentId.value = itemNode?.id ?? null;
    }
  }

  // 持久化：仅持久化用户偏好
  function $reset() {
    currentPath.value = [];
    selectedItems.value = [];
    currentParentId.value = null;
    searchTerm.value = '';
  }

  return {
    // State
    currentPath,
    selectedItems,
    currentParentId,
    personalSpaceId,
    personalSpaceIdLoading,
    viewMode,
    sortBy,
    sortOrder,
    searchTerm,
    pageSize,
    // Getters
    hasSelection,
    // Actions
    setCurrentPath,
    addSelectedItem,
    removeSelectedItem,
    clearSelection,
    navigateUp,
    $reset,
  };
}, {
  persist: {
    pick: ['viewMode', 'sortBy', 'sortOrder', 'pageSize'],
  },
});
```

**与 Zustand 版本的关键差异：**

| 特性 | Zustand | Pinia |
|------|---------|-------|
| 状态修改 | `set({ key: value })` 不可变更新 | `state.value = newValue` 直接修改（Vue 响应式代理） |
| 选择项操作 | `set(s => ({ items: [...s.items, id] }))` | `selectedItems.value.push(id)` 原生数组操作 |
| 持久化 | `zustand/middleware` persist 插件 | `pinia-plugin-persistedstate` |
| 在组件外使用 | `useStore.getState()` | `useStore()` （需在 app 创建后） |
| 计算属性 | 无内建，需手动 memo | `computed()` 天然支持 |

### 3.3 Store 设计：useUIStore

```typescript
// stores/ui.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export const useUIStore = defineStore('ui', () => {
  // ===== Toast =====
  const toasts = ref<Toast[]>([]);

  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = Date.now().toString();
    toasts.value.push({ id, type, message });

    // 自动移除（5s）
    setTimeout(() => removeToast(id), 5000);
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  // ===== Modal =====
  const activeModal = ref<string | null>(null);

  function openModal(modalId: string) {
    activeModal.value = modalId;
  }

  function closeModal() {
    activeModal.value = null;
  }

  // ===== 全局加载 =====
  const globalLoading = ref(false);
  const loadingMessage = ref('');
  const loadingProgress = ref(0);
  const pageLoading = ref(false); // 路由切换加载

  function setGlobalLoading(loading: boolean, message = '') {
    globalLoading.value = loading;
    loadingMessage.value = message;
    loadingProgress.value = loading ? 0 : 0;
  }

  function setLoadingProgress(progress: number) {
    loadingProgress.value = progress;
  }

  function resetLoading() {
    globalLoading.value = false;
    loadingMessage.value = '';
    loadingProgress.value = 0;
  }

  // ===== 侧边栏（从 SidebarContext 合并） =====
  const sidebarOpen = ref(false);

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return {
    toasts, addToast, removeToast,
    activeModal, openModal, closeModal,
    globalLoading, loadingMessage, loadingProgress, pageLoading,
    setGlobalLoading, setLoadingProgress, resetLoading,
    sidebarOpen, toggleSidebar,
  };
});
```

### 3.4 Store 设计：useAuthStore

AuthContext 是 React 版本中最复杂的 Context（450+ 行），迁移为 Pinia Store 后的关键变化：

```typescript
// stores/auth.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getApiClientAsync } from '@/services/apiClient';
import { authApi } from '@/services/authApi';
import type { LoginDto, RegisterDto, UserDto, AuthApiResponseDto } from '@/types/api-client';

type AuthResponseData = AuthApiResponseDto['data'];

export const useAuthStore = defineStore('auth', () => {
  // ===== State =====
  const user = ref<UserDto | null>(null);
  const token = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastValidated = ref<number>(0); // Token 上次验证时间戳

  // ===== Getters =====
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const shouldValidate = computed(() => {
    // 5 分钟内不重复验证
    return Date.now() - lastValidated.value > 5 * 60 * 1000;
  });

  // ===== 初始化（从 localStorage 恢复） =====
  function _initFromStorage() {
    try {
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');
      if (storedToken && storedUser) {
        token.value = storedToken;
        user.value = JSON.parse(storedUser);
      }
    } catch {
      // 静默失败
    }
  }

  // 立即恢复
  _initFromStorage();

  // ===== Actions =====
  async function login(account: string, password: string) {
    const client = await getApiClientAsync();
    const response = await client.AuthController_login(null, {
      account,
      password,
    } as LoginDto);

    const { accessToken, refreshToken, user: userData } =
      response.data as unknown as AuthResponseData;

    _setAuthData(accessToken, refreshToken, userData);
  }

  async function loginByPhone(phone: string, code: string) {
    const client = await getApiClientAsync();
    const response = await client.AuthController_loginByPhone(null, {
      phone,
      code,
    });

    const { accessToken, refreshToken, user: userData } =
      response.data as unknown as AuthResponseData;

    _setAuthData(accessToken, refreshToken, userData);
  }

  async function register(data: {
    email?: string;
    password: string;
    username: string;
    nickname?: string;
  }): Promise<{ message: string; email?: string }> {
    const client = await getApiClientAsync();
    const response = await client.AuthController_register(
      null,
      data as RegisterDto
    );

    const responseData = response.data as Record<string, unknown>;

    if (responseData.message && !responseData.accessToken) {
      return {
        message: responseData.message as string,
        email: responseData.email as string | undefined,
      };
    }

    const { accessToken, refreshToken, user: userData } =
      responseData as unknown as AuthResponseData;

    _setAuthData(accessToken, refreshToken, userData);
    return { message: '注册成功' };
  }

  async function validateToken() {
    if (!token.value || !user.value) return;

    loading.value = true;
    try {
      const client = await getApiClientAsync();
      const response = await client.AuthController_getProfile();
      const userData = response.data as UserDto;
      user.value = userData;
      localStorage.setItem('user', JSON.stringify(userData));
      lastValidated.value = Date.now();
    } catch (err) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 401) {
        _clearAuth();
      }
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      const client = await getApiClientAsync();
      await client.AuthController_logout();
    } catch {
      // 后端失败也要清除本地状态
    } finally {
      _clearAuth();
      window.location.href = '/login';
    }
  }

  // ===== 内部方法 =====
  function _setAuthData(
    accessToken: string,
    refreshToken: string,
    userData: UserDto
  ) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem('personalSpaceId');

    token.value = accessToken;
    user.value = userData;
  }

  function _clearAuth() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('personalSpaceId');

    token.value = null;
    user.value = null;
  }

  return {
    user, token, loading, error,
    isAuthenticated, shouldValidate,
    login, loginByPhone, register,
    validateToken, logout,
    setError: (e: string | null) => { error.value = e; },
    refreshUser: validateToken,
  };
});
```

**与 React 版本的关键改进：**

1. **消除 `useCallback` / `useMemo` 依赖数组**：Pinia 的 actions 和 getters 自动追踪依赖
2. **Token 验证频率控制**：新增 `shouldValidate` + `lastValidated`，避免 React 版每次渲染都触发 `useEffect` 验证
3. **统一 `_setAuthData` / `_clearAuth`**：React 版本中登录、注册、验证等多处重复的 localStorage 操作统一提取
4. **守卫可直接调用**：无需依赖 Context Provider 层级，`useAuthStore()` 可在路由守卫中直接使用

### 3.5 Store 设计：useNotificationStore

```typescript
// stores/notification.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([]);

  const unreadCount = computed(
    () => notifications.value.filter((n) => !n.read).length
  );

  function addNotification(
    type: Notification['type'],
    title: string,
    message: string
  ) {
    const id = Date.now().toString();
    const notification: Notification = {
      id, type, title, message,
      timestamp: new Date(),
      read: false,
    };
    notifications.value.unshift(notification);

    // 非错误类型自动移除（10s）
    if (type !== 'error') {
      setTimeout(() => removeNotification(id), 10000);
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  function markAsRead(id: string) {
    const notification = notifications.value.find((n) => n.id === id);
    if (notification) notification.read = true;
  }

  function markAllAsRead() {
    notifications.value.forEach((n) => { n.read = true; });
  }

  function clearAll() {
    notifications.value = [];
  }

  return {
    notifications, unreadCount,
    addNotification, removeNotification,
    markAsRead, markAllAsRead, clearAll,
  };
});
```

---

## 四、与 mxcad-app 的集成模式

### 4.1 现状分析

当前 `mxcad-app` 在项目中的集成方式：

1. **mxcad-app 暴露了 `MxCADView` 类**，在 `mxcadManager.ts` 中直接 import 使用
2. **mxcad-app 依赖 Vue 3 + Vuetify 3**：`MxPluginContext` 使用了 Vue 3 响应式 API（如 `useFileName().fileName.value`）
3. **mxcad-app 通过 `MxFun.addCommand` 注册命令**，平台通过 DOM 事件（`CustomEvent`）与编辑器通信
4. **CAD 编辑器以全屏覆盖层形式存在**，不嵌入 Layout，通过 `showMxCAD(true/false)` 控制显隐
5. **所有弹框（保存确认、未保存更改、重复文件）使用原生 DOM 操作**，不依赖 React 组件

### 4.2 集成架构

```
┌──────────────────────────────────────────────────────┐
│                 Vue 3 平台应用                          │
│                                                      │
│  ┌────────────────┐    ┌──────────────────────────┐  │
│  │  Pinia Stores   │    │   Vue Router             │  │
│  │  (auth, ui,     │    │   /cad-editor/:fileId    │  │
│  │   filesystem)   │    │                          │  │
│  └───────┬────────┘    └──────────┬───────────────┘  │
│          │                        │                   │
│          │    ┌───────────────────┼────────────┐     │
│          │    │  CADEditorOverlay.vue           │     │
│          │    │  ┌─────────────────────────┐    │     │
│          └────│  │  mxcad-app (Vue 3 App)   │    │     │
│               │  │  ┌───────────────────┐   │    │     │
│               │  │  │  Vuetify 3 实例    │   │    │     │
│               │  │  │  (MxCADView 管辖)  │   │    │     │
│               │  │  └───────────────────┘   │    │     │
│               │  └─────────────────────────┘    │     │
│               └─────────────────────────────────┘     │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  DOM 事件桥接层 (mxcadManager.ts)                │  │
│  │  window.dispatchEvent ←→ MxFun.addCommand       │  │
│  │  CustomEvent ←→ useNavigate()                   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 4.3 两个 Vuetify 实例共存方案

**核心问题**：mxcad-app 内部创建了自己的 Vue 3 App + Vuetify 3 实例（用于 CAD 工具栏、属性面板等），而平台侧如果也使用 Vuetify，会产生两个 Vuetify 实例。

**决策：平台侧不使用 Vuetify**

理由：
1. 当前 React 版本使用 Radix UI + Tailwind CSS，不使用 Vuetify，迁移后自然也不需要
2. 平台 UI（导航、表单、表格等）使用 radix-vue + Tailwind CSS 已足够
3. Vuetify 的 Material Design 风格与平台现有设计语言不一致
4. 避免两个 Vuetify 实例的 CSS 冲突、主题冲突、全局组件注册冲突

**共存边界**：

| 区域 | UI 框架 | 作用域 |
|------|---------|--------|
| 平台 UI | radix-vue + Tailwind CSS | 平台 Vue App 实例 |
| CAD 编辑器工具栏/面板 | Vuetify 3 | mxcad-app 内部 Vue App 实例 |
| 全局弹框 | 原生 DOM（保持现有方式） | document.body |

**CSS 隔离措施**：

1. mxcad-app 的 Vuetify 样式限定在 `.mxcad-global-container` 内
2. 平台 Tailwind 使用 `prefix` 配置（如 `tw-`）避免与 Vuetify class 冲突（仅在冲突实际发生时启用）
3. CSS 变量命名空间：平台使用 `--cloudcad-*`，mxcad 使用 `--mx-*` / `--v-*`

### 4.4 mxcad-app 复用模式

mxcad-app 已暴露 Vue 3 生态，平台复用方式：

```typescript
// composables/useMxCadEditor.ts
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { mxcadManager } from '@/services/mxcadManager';

export function useMxCadEditor() {
  const router = useRouter();
  const isReady = ref(false);

  onMounted(async () => {
    // 1. 将 Vue Router 的导航函数注入 mxcadManager
    mxcadManager.setNavigateFunction((path: string) => {
      router.push(path);
    });

    // 2. 初始化 MxCADView
    await mxcadManager.initializeMxCADView();
    isReady.value = true;
  });

  onUnmounted(() => {
    // 不销毁 MxCADView 容器（与 React 版一致）
    mxcadManager.clearCurrentFileInfo();
  });

  return { isReady };
}
```

**mxcadManager.ts 迁移要点**：

1. `mxcadManager.ts` 是纯 TypeScript 模块，不依赖 React，**可直接复用**
2. `navigateFunction` 从 `useNavigate()` 改为 `useRouter().push()`
3. `MxPluginContext` 的 Vue 3 API（如 `useFileName().fileName.value`）在 mxcad-app 内部运行，平台无需处理
4. 所有 `CustomEvent` 通信机制保持不变

### 4.5 CADEditorOverlay 组件设计

```vue
<!-- components/mxcad/CADEditorOverlay.vue -->
<template>
  <Transition name="mxcad-overlay">
    <div
      v-if="isVisible"
      class="mxcad-global-container"
      :style="{ zIndex: 1000 }"
    />
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { mxcadManager } from '@/services/mxcadManager';
import { useMxCadInstance } from '@/composables/useMxCadInstance';

const route = useRoute();
const isVisible = ref(false);
const { initializeMxCAD, showMxCAD } = useMxCadInstance();

// 监听路由变化控制显隐
watch(
  () => route.path,
  (path) => {
    const isEditorRoute = path.startsWith('/cad-editor');
    showMxCAD(isEditorRoute);
    isVisible.value = isEditorRoute;
  },
  { immediate: true }
);

onMounted(() => {
  initializeMxCAD();
});
</script>
```

---

## 五、分批次迁移策略

### 5.1 第一批：简单验证（基础架构搭建 + 简单页面）

**目标**：验证 Vue 3 应用骨架、路由、状态管理、API 服务层的基础可行性

**包含内容**：

| 模块 | 说明 |
|------|------|
| 应用骨架 | `main.ts`、`App.vue`、Vite 配置、TypeScript 配置 |
| 路由系统 | `router/index.ts`、`routes.ts`、全局守卫 |
| Pinia Store | `useAuthStore`、`useUIStore`、`useFileSystemStore`、`useNotificationStore` |
| API 服务层 | `services/` 整体搬迁（零修改，纯 TypeScript） |
| 工具函数层 | `utils/`、`constants/`、`types/`、`config/` 整体搬迁 |
| 样式系统 | `styles/` 整体搬迁 + Tailwind CSS v4 配置 |
| Login 页面 | 验证认证流程、表单验证（vee-validate + zod）、路由跳转 |
| Register 页面 | 验证多步骤表单、邮箱验证流程 |
| Dashboard 页面 | 验证 Layout 组件、侧边栏、权限菜单渲染 |

**验收标准**：

1. `pnpm dev` 可启动，访问 `/login` 显示登录页
2. 登录流程完整：输入账号密码 → 获取 Token → 存储到 localStorage → 跳转 Dashboard
3. Dashboard 页面正常渲染，侧边栏菜单根据权限动态显示
4. 退出登录正常清除状态并跳回登录页
5. 刷新页面后认证状态保持（Token 恢复）
6. `pnpm type-check` 无错误，`pnpm lint` 无新增警告

### 5.2 第二批：批量迁移（核心业务页面）

**目标**：完成主要业务页面的迁移，建立完整的业务闭环

**包含内容**：

| 模块 | 说明 |
|------|------|
| FileSystemManager | 核心页面：项目列表、文件浏览、文件夹导航 |
| Profile 页面 | 个人设置：账号、邮箱、手机、密码、微信绑定 |
| UserManagement | 用户管理 CRUD |
| RoleManagement | 角色权限管理 |
| LibraryManager | 公共资源库 |
| FontLibrary | 字体库管理 |
| 所有 Modal 组件 | CreateFolderModal、RenameModal、MembersModal 等 |
| 文件系统组件树 | FileItem、FileSystemContent、FileSystemHeader、BatchActions |
| 文件上传组件 | MxCadUploader |
| 侧边栏组件 | CollaborateSidebar、ProjectDrawingsPanel |

**验收标准**：

1. 项目列表页可创建/删除/归档项目
2. 文件浏览页可上传/下载/移动/复制/删除文件
3. 文件夹导航和面包屑正常工作
4. 所有 Modal 正常弹出/关闭/提交
5. 批量操作（多选 + 批量删除/移动）正常
6. 分页、搜索、排序功能正常
7. Profile 页面所有 Tab 可正常编辑保存
8. 用户管理、角色管理 CRUD 完整
9. 公共资源库浏览和操作正常
10. 跨页面状态保持：从文件列表进入 CAD 编辑器再返回，文件列表状态不丢失

### 5.3 第三批：复杂重写（CAD 编辑器集成 + 管理后台）

**目标**：完成最复杂的集成和重写工作

**包含内容**：

| 模块 | 说明 | 重写原因 |
|------|------|---------|
| CADEditorPage | CAD 编辑器全屏页面 | mxcad-app 集成是核心难点，需重写交互逻辑 |
| mxcadManager 适配 | 导航函数注入、事件桥接 | React Router → Vue Router 适配 |
| AuditLogPage | 审计日志 | 依赖 Recharts → ECharts 重写 |
| SystemMonitorPage | 系统监控 | 依赖 Recharts → ECharts 重写 |
| RuntimeConfigPage | 运行时配置 | 复杂表单 + 动态配置 |
| 引导系统 | Tour 组件 | 依赖 DOM 定位，需重新实现 |
| 主题系统 | ThemeProvider → ThemeStore | CSS 变量动态切换 |
| 外部参照功能 | useExternalReferenceUpload | 涉及文件上传 + CAD API 联动 |

**验收标准**：

1. CAD 编辑器可通过 URL 直接打开指定文件
2. 文件保存/另存为/新建命令正常执行
3. 退出编辑器返回正确的文件列表位置
4. 审计日志和系统监控页面图表正常渲染
5. 引导系统可正常启动、跳步、完成
6. 主题切换（亮/暗）全局生效，包括 CAD 编辑器区域
7. 外部参照检查和上传流程完整
8. 所有页面端到端测试通过

---

## 六、组件树设计

### 6.1 全局组件树

```
App.vue
├── BrandProvider                    # 品牌配置（provide/inject）
│   └── RuntimeConfigProvider        # 运行时配置（provide/inject）
│       └── TourProvider             # 引导系统（provide/inject）
│           ├── LoadingOverlay       # 全局加载遮罩（Pinia: uiStore.globalLoading）
│           ├── CADEditorOverlay     # CAD 编辑器覆盖层（监听路由）
│           │   └── [mxcad-app Vuetify 实例]  # 隔离的 Vuetify 渲染区域
│           └── <RouterView>         # 路由出口
│               ├── auth/*           # 公开页面（无 Layout）
│               ├── cad-editor/*     # CAD 编辑器页面（全屏）
│               └── AppLayout        # 受保护页面 Layout
│                   ├── packagesidebar   # 侧边栏导航
│                   │   ├── Logo
│                   │   ├── NavItem[]  # 权限过滤的菜单项
│                   │   ├── StorageInfo # 存储空间
│                   │   ├── TourEntry  # 引导入口
│                   │   └── UserMenu   # 用户信息 + 退出
│                   ├── AppHeader    # 顶部导航栏
│                   │   ├── MobileMenuButton
│                   │   ├── Clock
│                   │   ├── ThemeToggle
│                   │   └── SettingsDropdown
│                   └── <RouterView> # 子路由出口
│                       └── [PageComponent]
└── GlobalTourRenderer               # 全局引导浮层（Teleport to body）
```

### 6.2 路由容器层级

```
/ (AppLayout)
├── /dashboard → DashboardPage
├── /projects → FileSystemPage
│   └── props: { mode: 'project' }
├── /projects/:projectId/files → FileSystemPage
├── /projects/:projectId/files/:nodeId → FileSystemPage
├── /personal-space → FileSystemPage
│   └── props: { mode: 'personal-space' }
├── /users → UserManagementPage (meta.permission: SYSTEM_USER_READ)
├── /roles → RoleManagementPage (meta.permission: SYSTEM_ROLE_READ)
├── /profile → ProfilePage
└── /audit-logs → AuditLogPage (meta.permission: SYSTEM_ADMIN)

/login → LoginPage (无 Layout, meta.public: true)
/cad-editor → CADEditorPage (全屏, meta.public: true, meta.fullscreen: true)
```

### 6.3 错误边界

Vue 3 没有内建的 ErrorBoundary 组件。替代方案：

**方案一：全局错误处理 + `onErrorCaptured`（推荐）**

```vue
<!-- components/ErrorBoundary.vue -->
<template>
  <slot v-if="!error" />
  <ErrorFallback v-else :error="error" @retry="reset" />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import ErrorFallback from './ErrorFallback.vue';

const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err;
  // 阻止错误继续向上传播
  return false;
});

function reset() {
  error.value = null;
}
</script>
```

**方案二：Suspense + 异步组件错误处理**

对于异步加载的页面组件，Vue 的 `<Suspense>` 配合 `onErrorCaptured` 可以处理加载失败：

```vue
<RouterView v-slot="{ Component }">
  <ErrorBoundary>
    <Suspense>
      <component :is="Component" />
      <template #fallback>
        <PageSkeleton />
      </template>
    </Suspense>
  </ErrorBoundary>
</RouterView>
```

**错误处理层级**：

| 层级 | 机制 | 处理内容 |
|------|------|---------|
| 全局 | `app.config.errorHandler` | 未捕获的 Promise 错误、渲染错误 |
| 路由 | `router.onError()` | 懒加载 chunk 失败（网络错误） |
| 页面 | `ErrorBoundary` 组件 | 页面级渲染错误、子组件异常 |
| 组件 | `try/catch` + `onErrorCaptured` | 单个组件内异步操作错误 |

---

## 七、技术决策记录

### 7.1 为什么选择 Composition API 而非 Options API

1. 与现有 React Hooks 代码结构最接近，降低迁移理解成本
2. `composables/` 与 `hooks/` 一一对应，代码审查时可逐行对比
3. TypeScript 推导更友好，无需手动声明 `this` 类型
4. Pinia 的 Setup Store 模式天然使用 Composition API

### 7.2 为什么不使用 Vuetify 作为平台 UI 框架

1. 现有 React 版本使用 Radix UI（无样式原语），Vuetify 是完整的组件库，迁移映射不直接
2. mxcad-app 已使用 Vuetify，两个实例共存增加复杂度和包体积
3. Tailwind CSS + radix-vue 的组合与现有设计系统更一致
4. Vuetify 的 Material Design 风格与 CloudCAD 现有设计语言不匹配

### 7.3 为什么 mxcadManager.ts 不迁移为 Composable

1. `mxcadManager.ts` 是纯 TypeScript 模块，使用模块级全局变量（`currentFileInfo`、`navigateFunction`）管理状态
2. 它通过 `MxFun.addCommand` 注册命令、通过 `CustomEvent` 与 UI 通信，不依赖任何框架生命周期
3. 迁移为 Composable 没有收益，反而增加了组件挂载/卸载时的生命周期管理复杂度
4. 只需将 `navigateFunction` 的注入从 React Router 的 `useNavigate()` 改为 Vue Router 的 `useRouter().push()`

### 7.4 为什么新增 `useAuthStore` 而非保持 Context 模式

1. **路由守卫需要访问认证状态**：Vue Router 的 `beforeEach` 守卫运行在组件外部，无法使用 `provide/inject`
2. **非组件代码需要认证状态**：`authCheck.ts`、`mxcadManager.ts` 等纯 TS 模块需要判断登录状态
3. **Pinia 支持组件外访问**：`useAuthStore()` 在 app 创建后可在任何位置使用
4. **React 版本的 AuthContext 本质上就是全局状态**，用 Store 更合理

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| mxcad-app 内部 API 变更 | CAD 编辑器功能不可用 | 第一批即验证 MxCADView 初始化和文件打开流程；与 mxcad-app 团队确认 API 稳定性 |
| 两个 Vuetify 实例 CSS 冲突 | 样式异常 | 平台不使用 Vuetify；mxcad 容器使用 CSS scope 隔离 |
| radix-vue 组件覆盖不全 | 部分交互模式缺失 | 评估现有 @radix-ui 使用范围，radix-vue 已覆盖所有当前使用的组件 |
| 表单验证迁移工作量 | vee-validate 与 react-hook-form API 差异大 | Zod schema 完全复用，仅需重写表单绑定层 |
| ECharts 配置式 API vs Recharts 声明式 | 图表重写成本高 | 第三批处理；ECharts 配置可封装为 Composable 降低重复代码 |
| 并行开发期间 API 服务层同步 | 两个前端版本 API 调用不一致 | services/ 层设计为纯 TypeScript 模块，两版本共享同一份代码 |

---

## 九、附录

### A. 完整依赖替换清单

| React 依赖 | Vue 3 替代 | 版本 | 迁移成本 |
|------------|-----------|------|---------|
| react ^19.2.1 | vue ^3.5+ | - | 高 |
| react-dom ^19.2.1 | （vue 内建） | - | 高 |
| react-router-dom ^7.10.1 | vue-router ^4.x | - | 中 |
| zustand ^5.0.10 | pinia ^3.x | - | 中 |
| react-hook-form ^7.68.0 | vee-validate ^4.x | - | 中 |
| @radix-ui/react-* | radix-vue ^1.x | - | 中 |
| lucide-react ^0.556.0 | lucide-vue-next ^0.556.0 | - | 低 |
| recharts ^3.5.1 | echarts + vue-echarts | - | 高 |
| @testing-library/react | @testing-library/vue | - | 低 |

### B. 可直接复用的模块

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `services/` | 25+ | 纯 TypeScript API 客户端，零修改 |
| `utils/` | 12 | 纯工具函数，零修改 |
| `constants/` | 3 | 常量定义，零修改 |
| `types/` | 5 | TypeScript 类型，零修改 |
| `config/` | 4+ | 应用配置，零修改 |
| `styles/` | 4 | CSS 文件，零修改 |
| axios, zod, spark-md5, tailwindcss, vite, typescript | - | 框架无关依赖，零修改 |

### C. React Hook → Vue Composable 对照表

| React Hook | Vue Composable | 差异说明 |
|------------|---------------|---------|
| `useState` | `ref` / `reactive` | Vue 自动追踪依赖，无需 setter |
| `useEffect` | `onMounted` + `watch` / `watchEffect` | 需区分挂载逻辑和响应式逻辑 |
| `useCallback` | 不需要 | Vue 的函数引用天然稳定 |
| `useMemo` | `computed` | 自动追踪依赖 |
| `useRef` | `ref` / `template ref` | Vue 的 ref 同时是响应式的 |
| `useContext` | `inject` | 需配合 `provide` |
| `useNavigate` | `useRouter().push` | API 名称不同 |
| `useParams` | `useRoute().params` | 响应式 |
| `useLocation` | `useRoute()` | 返回完整路由信息对象 |

---

汇报人：CodeBuddy Code
