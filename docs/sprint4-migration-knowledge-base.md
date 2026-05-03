# CloudCAD Sprint 4 迁移知识库

## 概述

本文档记录了 CloudCAD 项目从 React 19 迁移到 Vue 3 + Vuetify 3 的核心迁移模式和最佳实践。基于实际源码对照，总结了常见迁移场景的转换方法。

**React 源码**: `apps/frontend/src/`
**Vue 迁移版源码**: `apps/frontend-vue/src/`

---

## 1. Context 与 Composables 的转换

### 1.1 AuthContext 到 useAuth Composable

React 的 Context + useContext 模式在 Vue 中通过 Composables + Pinia 实现。

#### React 旧代码

```tsx
// apps/frontend/src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Token 验证逻辑
  useEffect(() => {
    const validateToken = async () => {
      if (token && user) {
        setLoading(true);
        try {
          const client = await getApiClientAsync();
          const response = await client.AuthController_getProfile();
          setUser(response.data);
        } catch (error) {
          if (axiosError.response?.status === 401) {
            localStorage.removeItem('accessToken');
            setToken(null);
            setUser(null);
          }
        } finally {
          setLoading(false);
        }
      }
    };
    const timer = setTimeout(validateToken, 300);
    return () => clearTimeout(timer);
  }, [token]);

  const login = useCallback(async (account: string, password: string) => {
    const client = await getApiClientAsync();
    const response = await client.AuthController_login(null, { account, password });
    const { accessToken, user: userData } = response.data;
    localStorage.setItem('accessToken', accessToken);
    setToken(accessToken);
    setUser(userData);
  }, []);

  const value = useMemo(() => ({
    user, token, login, loading, isAuthenticated: !!token && !!user
  }), [user, token, login, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/composables/useAuth.ts
import { computed, onMounted, onUnmounted } from 'vue';
import { authApi } from '@/services/authApi';
import { useAuthStore } from '@/stores/auth.store';

export function useAuth() {
  const store = useAuthStore();

  // 响应式派生状态
  const user = computed(() => store.user);
  const token = computed(() => store.token);
  const loading = computed(() => store.loading);
  const isAuthenticated = computed(() => !!store.token && !!store.user);

  // Token 验证（照搬 React useEffect 逻辑）
  let validateTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleValidation(): void {
    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = setTimeout(doValidate, 300);
  }

  async function doValidate(): Promise<void> {
    if (!store.token || !store.user) return;
    store.loading = true;
    try {
      const res = await authApi.getProfile();
      store.user = res.data;
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 401) {
        localStorage.removeItem('accessToken');
        store.token = null;
        store.user = null;
      }
    } finally {
      store.loading = false;
    }
  }

  async function login(account: string, password: string): Promise<void> {
    const loginRes = await authApi.login(account, password);
    persistAuth(loginRes.data);
  }

  function persistAuth(data: AuthResponse): void {
    localStorage.setItem('accessToken', data.accessToken);
    store.token = data.accessToken;
    store.user = data.user;
  }

  // 生命周期
  onMounted(() => {
    scheduleValidation();
    window.addEventListener('storage', handleStorageChange);
  });

  onUnmounted(() => {
    if (validateTimer) clearTimeout(validateTimer);
    window.removeEventListener('storage', handleStorageChange);
  });

  return { user, token, login, loading, isAuthenticated };
}
```

```typescript
// apps/frontend-vue/src/stores/auth.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDto | null>(null);
  const token = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  // 从 localStorage 初始化
  const storedToken = localStorage.getItem('accessToken');
  const storedUser = localStorage.getItem('user');
  if (storedToken && storedUser) {
    token.value = storedToken;
    user.value = JSON.parse(storedUser);
  }

  function clearAuth(): void {
    localStorage.removeItem('accessToken');
    token.value = null;
    user.value = null;
  }

  return { user, token, loading, error, isAuthenticated, clearAuth };
});
```

#### 关键差异

| React 概念 | Vue 实现 | 说明 |
|------------|----------|------|
| `createContext` | Pinia Store | 状态集中管理 |
| `useContext` | `useStore()` + computed | 获取响应式状态 |
| `useState` | `ref()` / `reactive()` | 响应式状态 |
| `useMemo` | `computed()` | 计算属性 |
| `useCallback` | 普通函数 | Vue 中函数自动无需缓存 |
| `useEffect` | `onMounted` / `watch` | 副作用处理 |
| Provider 嵌套 | Store 直接使用 | 无需 Provider 包裹 |

---

## 2. Zustand 到 Pinia 的状态管理转换

### 2.1 UI Store 转换

#### React 旧代码

```typescript
// apps/frontend/src/stores/uiStore.ts
import { create } from 'zustand';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface UIState {
  toasts: Toast[];
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
  activeModal: string | null;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  activeModal: null,
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),
  globalLoading: false,
  setGlobalLoading: (loading, message = '') =>
    set({ globalLoading: loading, loadingMessage: message }),
}));
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/stores/ui.store.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore('ui', () => {
  // Toast 状态
  const toasts = ref<Toast[]>([]);

  function addToast(message: string, type: Toast['type'] = 'info'): void {
    const id = Date.now().toString();
    toasts.value.push({ id, type, message });
    setTimeout(() => removeToast(id), 5000);
  }

  function removeToast(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  // Modal 状态
  const activeModal = ref<string | null>(null);

  function openModal(modalId: string): void {
    activeModal.value = modalId;
  }

  function closeModal(): void {
    activeModal.value = null;
  }

  // 全局加载状态
  const globalLoading = ref(false);
  const loadingMessage = ref('');
  const loadingProgress = ref(0);

  function setGlobalLoading(loading: boolean, message = ''): void {
    globalLoading.value = loading;
    loadingMessage.value = message;
    loadingProgress.value = 0;
  }

  function showLoading(key: string, message: string, block = false): void {
    if (globalLoading.value && loadingKey.value !== null && loadingKey.value !== key) return;
    globalLoading.value = true;
    loadingKey.value = key;
    loadingMessage.value = message;
  }

  function hideLoading(key: string): void {
    if (loadingKey.value !== key) return;
    globalLoading.value = false;
    loadingMessage.value = '';
    loadingProgress.value = 0;
  }

  return {
    toasts, addToast, removeToast,
    activeModal, openModal, closeModal,
    globalLoading, loadingMessage, loadingProgress,
    setGlobalLoading, showLoading, hideLoading,
  };
});
```

### 2.2 FileSystem Store 转换

#### React 旧代码

```typescript
// apps/frontend/src/stores/fileSystemStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useFileSystemStore = create<FileSystemState>()(
  persist(
    (set, get) => ({
      currentPath: [],
      selectedItems: [],
      viewMode: 'grid',
      sortBy: 'name',
      sortOrder: 'asc',

      setCurrentPath: (path) => set({ currentPath: path }),
      setSelectedItems: (items) => set({ selectedItems: items }),
      addSelectedItem: (id) =>
        set((state) => {
          if (state.selectedItems.includes(id)) return state;
          return { selectedItems: [...state.selectedItems, id] };
        }),
      removeSelectedItem: (id) =>
        set((state) => ({
          selectedItems: state.selectedItems.filter((item) => item !== id),
        })),
      clearSelection: () => set({ selectedItems: [] }),
    }),
    {
      name: 'fileSystemStore',
      partialize: (state) => ({
        pageSize: state.pageSize,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
    }
  )
);
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/stores/fileSystem.store.ts (概念示例)
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useFileSystemStore = defineStore('fileSystem', () => {
  const currentPath = ref<FileSystemNode[]>([]);
  const selectedItems = ref<string[]>([]);
  const viewMode = ref<'grid' | 'list'>('grid');
  const sortBy = ref<'name' | 'date' | 'size' | 'type'>('name');
  const sortOrder = ref<'asc' | 'desc'>('asc');

  function addSelectedItem(id: string): void {
    if (!selectedItems.value.includes(id)) {
      selectedItems.value.push(id);
    }
  }

  function removeSelectedItem(id: string): void {
    selectedItems.value = selectedItems.value.filter((item) => item !== id);
  }

  function clearSelection(): void {
    selectedItems.value = [];
  }

  return {
    currentPath,
    selectedItems,
    viewMode,
    sortBy,
    sortOrder,
    addSelectedItem,
    removeSelectedItem,
    clearSelection,
  };
});
```

#### 关键差异

| Zustand (React) | Pinia (Vue) | 说明 |
|-----------------|-------------|------|
| `create((set) => ({}))` | `defineStore(() => {})` | Store 定义 |
| `set({ key: value })` | `ref.value = value` | 状态更新 |
| `set((state) => ({...}))` | 直接操作 `ref.value` | 函数式更新 |
| `persist` 中间件 | 手动 localStorage | 持久化方案 |
| `get()` 获取状态 | 直接访问 `store.xxx` | 状态读取 |

---

## 3. 自定义 Hooks 到 Composables 的转换

### 3.1 usePermission Hook

#### React 旧代码

```typescript
// apps/frontend/src/hooks/usePermission.ts
import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const usePermission = () => {
  const { user } = useAuth();

  const getUserPermissions = useCallback((): Permission[] => {
    if (!user?.role?.permissions) return [];
    return user.role.permissions.map((p) =>
      typeof p === 'string' ? p : p.permission
    );
  }, [user?.role?.permissions]);

  const permissionSet = useMemo(() => {
    return new Set(getUserPermissions());
  }, [getUserPermissions]);

  const hasPermission = useCallback(
    (permission: Permission): boolean => permissionSet.has(permission),
    [permissionSet]
  );

  const hasAnyPermission = useCallback(
    (permissions: Permission[]): boolean =>
      permissions.some((perm) => permissionSet.has(perm)),
    [permissionSet]
  );

  return useMemo(
    () => ({
      getUserPermissions,
      hasPermission,
      hasAnyPermission,
    }),
    [getUserPermissions, hasPermission, hasAnyPermission]
  );
};
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/composables/usePermission.ts (概念)
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

export function usePermission() {
  const authStore = useAuthStore();

  const getUserPermissions = computed((): Permission[] => {
    const user = authStore.user;
    if (!user?.role?.permissions) return [];
    return user.role.permissions.map((p) =>
      typeof p === 'string' ? p : p.permission
    );
  });

  const permissionSet = computed(() => new Set(getUserPermissions.value));

  function hasPermission(permission: Permission): boolean {
    return permissionSet.value.has(permission);
  }

  function hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some((perm) => permissionSet.value.has(perm));
  }

  return {
    getUserPermissions,
    hasPermission,
    hasAnyPermission,
  };
}
```

### 3.2 useProjectManagement Hook

#### React 旧代码

```typescript
// apps/frontend/src/hooks/useProjectManagement.ts
import { useState, useCallback } from 'react';
import { FileSystemNode } from '../types/filesystem';

export function useProjectManagement(options = {}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  const openCreateModal = useCallback(() => {
    setEditingProject(null);
    setFormData({ name: '', description: '' });
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setFormData({ name: project.name, description: project.description || '' });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProject(null);
  }, []);

  return {
    isModalOpen,
    editingProject,
    formData,
    loading,
    openCreateModal,
    openEditModal,
    closeModal,
    setFormData,
  };
}
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/composables/useProjectManagement.ts
import { ref } from 'vue';
import type { FileSystemNode } from './useFileSystemData';

export function useProjectManagement(options = {}) {
  const isModalOpen = ref(false);
  const editingProject = ref<FileSystemNode | null>(null);
  const formData = ref({ name: '', description: '' });
  const loading = ref(false);

  function openCreateModal(): void {
    editingProject.value = null;
    formData.value = { name: '', description: '' };
    isModalOpen.value = true;
  }

  function openEditModal(project: FileSystemNode): void {
    editingProject.value = project;
    formData.value = {
      name: project.name,
      description: project.description || '',
    };
    isModalOpen.value = true;
  }

  function closeModal(): void {
    isModalOpen.value = false;
    editingProject.value = null;
  }

  return {
    isModalOpen,
    editingProject,
    formData,
    loading,
    openCreateModal,
    openEditModal,
    closeModal,
    setFormData: (data: { name: string; description: string }) => { formData.value = data; },
  };
}
```

---

## 4. 组件转换：Modal 和 ConfirmDialog

### 4.1 ConfirmDialog 组件

#### React 旧代码

```tsx
// apps/frontend/src/components/ui/ConfirmDialog.tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, message, confirmText = '确定', onConfirm, onCancel, type = 'warning'
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onCancel} className="px-4 py-2 text-sm">{cancelText}</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm text-white bg-red-600">{confirmText}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
```

#### Vue 新代码

```vue
// apps/frontend-vue/src/components/ConfirmDialog.vue
<template>
  <v-dialog v-model="localIsOpen" max-width="400">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleCancel">取消</v-btn>
        <v-btn :color="confirmColor" :loading="loading" @click="handleConfirm">
          {{ confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  type?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确定',
  type: 'warning',
  loading: false,
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const localIsOpen = ref(props.isOpen);

const confirmColor = computed(() => {
  switch (props.type) {
    case 'danger': return 'error';
    case 'warning': return 'warning';
    default: return 'primary';
  }
});

watch(() => props.isOpen, (val) => { localIsOpen.value = val; });
watch(localIsOpen, (val) => { emit('update:isOpen', val); });

function handleConfirm(): void { emit('confirm'); }
function handleCancel(): void {
  emit('update:isOpen', false);
  emit('cancel');
}
</script>
```

### 4.2 Toast 处理

#### React 旧代码

```tsx
// apps/frontend/src/components/ui/Toast.tsx
export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
      type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
    }`}>
      {type === 'success' && <CheckCircle size={20} />}
      {type === 'error' && <AlertCircle size={20} />}
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose}><X size={16} /></button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 space-y-2" style={{ zIndex: 100010 }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={() => onRemove(toast.id)} />
      ))}
    </div>
  );
};
```

#### Vue 新代码

```typescript
// apps/frontend-vue/src/composables/useFileSystemUI.ts
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export function useFileSystemUI() {
  const toasts = ref<Toast[]>([]);

  function showToast(message: string, type: Toast['type'] = 'info'): void {
    const id = Date.now().toString();
    toasts.value.push({ id, type, message });
    const timerId = setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 5000);
  }

  function removeToast(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, showToast, removeToast };
}
```

---

## 5. 路由和页面转换

### 5.1 Login 页面

#### React 旧代码 (摘要)

```tsx
// apps/frontend/src/pages/Login.tsx
export const Login: React.FC = () => {
  useDocumentTitle('登录');
  const navigate = useNavigate();
  const { login, loginByPhone, isAuthenticated, loading: authLoading } = useAuth();
  const { isDark } = useTheme();

  const [formData, setFormData] = useState({ account: '', password: '' });
  const [phoneForm, setPhoneForm] = useState({ phone: '', code: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const from = location.state?.from || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(formData.account, formData.password);
      navigate('/');
    } catch (err) {
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <InteractiveBackground />
      <div className="login-container">
        <div className="login-card">
          <form onSubmit={handleAccountSubmit}>
            <div className="input-group">
              <label>账号</label>
              <input
                type="text"
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
              />
            </div>
            <button type="submit" disabled={loading}>登录</button>
          </form>
        </div>
      </div>
    </div>
  );
};
```

#### Vue 新代码 (摘要)

```vue
// apps/frontend-vue/src/pages/LoginPage.vue
<template>
  <v-form @submit.prevent="handleAccountSubmit">
    <v-text-field v-model="formData.account" label="账号" />
    <v-text-field v-model="formData.password" type="password" label="密码" />
    <v-btn type="submit" :loading="loading">登录</v-btn>
  </v-form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useLogin } from '@/composables/useLogin';

useDocumentTitle('登录');
const router = useRouter();
const route = useRoute();

const {
  formData,
  loading,
  error,
  handleAccountSubmit,
} = useLogin();

watch([isAuthenticated, authLoading], ([authed, authLoad]) => {
  if (authed && !authLoad) {
    const from = (route.state as { from?: string })?.from || '/';
    router.push(from);
  }
});
</script>
```

---

## 6. Radix UI 到 Vuetify 3 组件映射

### 6.1 组件映射表

| Radix UI (React) | Vuetify 3 (Vue) | 说明 |
|------------------|-----------------|------|
| `<Dialog>` | `<v-dialog>` | 模态对话框 |
| `<DropdownMenu>` | `<v-menu>` | 下拉菜单 |
| `<Tabs>` | `<v-tabs>` | 标签页 |
| `<Select>` | `<v-select>` | 选择器 |
| `<Checkbox>` | `<v-checkbox>` | 复选框 |
| `<RadioGroup>` | `<v-radio-group>` | 单选组 |
| `<Tooltip>` | `<v-tooltip>` | 工具提示 |
| `<Sonner>` / Toast | `<v-snackbar>` | 消息提示 |
| `<Progress>` | `<v-progress-linear>` | 进度条 |
| `<Skeleton>` | `<v-skeleton-loader>` | 骨架屏 |
| `<Button>` | `<v-btn>` | 按钮 |
| `<Input>` | `<v-text-field>` | 输入框 |
| `<Card>` | `<v-card>` | 卡片 |
| `<Avatar>` | `<v-avatar>` | 头像 |
| `<Badge>` | `<v-chip>` | 徽章/标签 |
| `<Alert>` | `<v-alert>` | 警告提示 |
| `<Divider>` | `<v-divider>` | 分割线 |
| `<List>` | `<v-list>` | 列表 |

### 6.2 常用组件转换示例

#### Dialog

```tsx
// React with Radix
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Content>
    <Dialog.Title>标题</Dialog.Title>
    <Dialog.Description>描述内容</Dialog.Description>
    <button onClick={() => setIsOpen(false)}>关闭</button>
  </Dialog.Content>
</Dialog>
```

```vue
<!-- Vue with Vuetify -->
<v-dialog v-model="isOpen" max-width="500">
  <v-card>
    <v-card-title>标题</v-card-title>
    <v-card-text>描述内容</v-card-text>
    <v-card-actions>
      <v-btn @click="isOpen = false">关闭</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

#### Tabs

```tsx
// React with Radix
<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">标签1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">标签2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">内容1</Tabs.Content>
  <Tabs.Content value="tab2">内容2</Tabs.Content>
</Tabs>
```

```vue
<!-- Vue with Vuetify -->
<v-tabs v-model="activeTab">
  <v-tab value="tab1">标签1</v-tab>
  <v-tab value="tab2">标签2</v-tab>
</v-tabs>

<v-window v-model="activeTab">
  <v-window-item value="tab1">内容1</v-window-item>
  <v-window-item value="tab2">内容2</v-window-item>
</v-window>
```

---

## 7. 表单处理转换

### 7.1 登录表单对照

#### React (React Hook Form)

```tsx
// apps/frontend/src/pages/Login.tsx
const [formData, setFormData] = useState<LoginDto>({ account: '', password: '' });

const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  setFormData((prev) => ({ ...prev, [name]: value }));
}, []);

return (
  <form onSubmit={handleAccountSubmit}>
    <input
      name="account"
      type="text"
      value={formData.account}
      onChange={handleChange}
    />
    <input
      name="password"
      type="password"
      value={formData.password}
      onChange={handleChange}
    />
  </form>
);
```

#### Vue (Vuetify)

```vue
// apps/frontend-vue/src/pages/LoginPage.vue
const formData = ref({ account: '', password: '' });

return (
  <v-form @submit.prevent="handleAccountSubmit">
    <v-text-field v-model="formData.value.account" label="账号" />
    <v-text-field v-model="formData.value.password" type="password" label="密码" />
  </v-form>
);
```

---

## 8. 常见逻辑偏差与修复

### 8.1 响应式丢失问题

**问题描述**: 在 Vue 中直接修改对象属性不会触发响应式更新。

**React 写法**:
```tsx
const [user, setUser] = useState({ name: 'John', age: 30 });
// 直接修改属性后调用 setUser
user.age = 31;
setUser({ ...user }); // 需要手动扩展
```

**Vue 错误写法**:
```typescript
const user = ref({ name: 'John', age: 30 });
user.value.age = 31; // 这样不会触发响应式更新
```

**Vue 正确写法**:
```typescript
const user = ref({ name: 'John', age: 30 });
user.value = { ...user.value, age: 31 }; // 需要替换整个对象

// 或者使用 reactive
const user = reactive({ name: 'John', age: 30 });
user.age = 31; // reactive 可以直接修改属性
```

### 8.2 生命周期差异

**React `useEffect` vs Vue `onMounted`**

React:
```tsx
useEffect(() => {
  // 挂载时执行
  const timer = setTimeout(doSomething, 100);
  return () => clearTimeout(timer); // 清理函数
}, [dependency]);
```

Vue:
```typescript
onMounted(() => {
  // 挂载时执行
});

onUnmounted(() => {
  // 卸载时执行
});

// 监听变化
watch(someRef, (newVal, oldVal) => {
  // 处理变化
});
```

### 8.3 组件挂载顺序

**问题**: Vue 的 `setup` 执行时机早于 DOM 挂载，某些在构造函数中访问 DOM 的逻辑会失败。

**解决**: 使用 `onMounted` 钩子确保 DOM 已挂载。

### 8.4 异步状态管理

**React 状态更新**:
```tsx
const [data, setData] = useState(null);
useEffect(() => {
  fetchData().then(res => setData(res.data));
}, []);
```

**Vue 状态更新**:
```typescript
const data = ref(null);
onMounted(async () => {
  const res = await fetchData();
  data.value = res.data;
});
```

---

## 9. Composables 最佳实践

### 9.1 状态与逻辑分离

将状态放在 Pinia Store，逻辑放在 Composables：

```typescript
// Store: 只存储状态
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(null);
  return { user, token };
});

// Composable: 处理业务逻辑
export function useAuth() {
  const store = useAuthStore();
  const router = useRouter();

  async function login(credentials) {
    const res = await authApi.login(credentials);
    store.token = res.data.accessToken;
    store.user = res.data.user;
  }

  return { user: computed(() => store.user), login };
}
```

### 9.2 Composables 命名规范

- 文件名: `use[功能名].ts` (如 `useAuth.ts`, `useLogin.ts`)
- 函数名: `use[功能名]` (如 `useAuth()`, `useLogin()`)
- 返回值使用 `computed` 包装响应式状态

---

## 10. 迁移检查清单

### 代码层面
- [ ] Context API 替换为 Pinia Store + Composables
- [ ] useState 替换为 ref / reactive
- [ ] useEffect 替换为 onMounted / watch
- [ ] useCallback / useMemo 检查是否需要
- [ ] Props 使用 defineProps 声明
- [ ] Emits 使用 defineEmits 声明
- [ ] Children 替换为 slots

### 组件层面
- [ ] Radix UI 替换为 Vuetify 组件
- [ ] Portal 写法替换为 Vuetify Dialog
- [ ] 自定义 Toast 替换为 v-snackbar 或 composable
- [ ] 样式使用 Vuetify 主题变量

### 路由层面
- [ ] React Router 替换为 Vue Router
- [ ] useNavigate 替换为 useRouter
- [ ] useLocation 替换为 useRoute
- [ ] 路由守卫转换

### 状态管理
- [ ] Zustand stores 转换为 Pinia stores
- [ ] 选择器模式转换
- [ ] 持久化方案迁移

---

## 附录：关键源码文件对照

| React 源码 | Vue 迁移版 |
|-----------|-----------|
| `contexts/AuthContext.tsx` | `composables/useAuth.ts` + `stores/auth.store.ts` |
| `stores/uiStore.ts` | `stores/ui.store.ts` |
| `stores/fileSystemStore.ts` | `stores/fileSystem.store.ts` |
| `hooks/usePermission.ts` | `composables/usePermission.ts` |
| `hooks/useProjectManagement.ts` | `composables/useProjectManagement.ts` |
| `components/ui/ConfirmDialog.tsx` | `components/ConfirmDialog.vue` |
| `components/ui/Modal.tsx` | Vuetify `v-dialog` |
| `components/ui/Toast.tsx` | `composables/useFileSystemUI.ts` |
| `pages/Login.tsx` | `pages/LoginPage.vue` + `composables/useLogin.ts` |
| `pages/Register.tsx` | `pages/RegisterPage.vue` + `composables/useRegister.ts` |
| `hooks/useMxCadInstance.ts` | `composables/useCadEngine.ts` |
