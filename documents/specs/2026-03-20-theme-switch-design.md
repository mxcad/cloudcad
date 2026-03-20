# 主题切换方案设计

> 版本：1.0.0
> 日期：2026-03-20
> 状态：讨论中

---

## 1. 背景

CloudCAD 需要支持明暗主题切换，并与 mxcad-app CAD 编辑器主题联动。

### 现状

| 项目 | 状态 |
|------|------|
| ThemeContext.tsx | 已存在，但未使用（未在 index.tsx 包裹） |
| CSS 变量 | 已定义亮色变量，缺少暗色覆盖 |
| Tailwind | 使用中，未配置 dark mode |
| mxcad-app | 使用 Vuetify 主题系统，支持 `getVuetify()` 获取实例 |

---

## 2. 目标

1. **最小改动**：不改动页面组件代码
2. **联动同步**：CloudCAD 与 mxcad-app 主题双向同步
3. **持久化**：主题选择存储在 localStorage

---

## 3. 页面分类

| 类型 | 页面 | Layout | 主题行为 |
|------|------|--------|----------|
| 公开 | Login, Register, ForgotPassword, ResetPassword, EmailVerification | ❌ 无 | 跟随 localStorage |
| 受保护 | FileSystemManager, UserManagement, RoleManagement, Profile, FontLibrary, AuditLogPage, SystemMonitorPage, RuntimeConfigPage | ✅ 有 | 支持切换 + 联动 |
| CAD 编辑器 | CADEditorDirect | ❌ 覆盖层 | mxcad-app 控制 + 联动 |

---

## 4. 技术方案

### 4.1 核心原理

```
┌─────────────────────────────────────────────────────────────┐
│                      mxcad-app (Vuetify)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  vuetify.theme.global.name = 'dark' | 'light'       │   │
│  │  vuetify.theme.change(name)                          │   │
│  │  vuetify.theme.toggle(['light', 'dark'])             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Vue watch + CustomEvent
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CloudCAD (React)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  document.body.setAttribute('data-theme', 'dark')   │   │
│  │  localStorage.setItem('mx-user-dark', 'true')        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ CSS 变量
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     app.css                                  │
│  [data-theme="dark"] { --color-slate-50: #0f172a; ... }     │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 实现步骤

#### Step 1: CSS 变量暗色覆盖

在 `app.css` 添加 `[data-theme="dark"]` 选择器覆盖 CSS 变量：

```css
/* 暗色主题 */
[data-theme="dark"] {
  /* 中性色反转 */
  --color-slate-50: #0f172a;
  --color-slate-100: #1e293b;
  --color-slate-200: #334155;
  --color-slate-300: #475569;
  --color-slate-400: #64748b;
  --color-slate-500: #94a3b8;
  --color-slate-600: #cbd5e1;
  --color-slate-700: #e2e8f0;
  --color-slate-800: #f1f5f9;
  --color-slate-900: #f8fafc;
  
  /* 背景色 */
  --color-bg-primary: #0f172a;
  --color-bg-secondary: #1e293b;
  --color-bg-tertiary: #334155;
}

/* 暗色主题下的特殊样式 */
[data-theme="dark"] body {
  background-color: var(--color-bg-primary);
  color: var(--color-slate-600);
}

[data-theme="dark"] .bg-white {
  background-color: var(--color-bg-secondary) !important;
}

[data-theme="dark"] .bg-slate-50 {
  background-color: var(--color-bg-primary) !important;
}
```

#### Step 2: 简化 ThemeContext

```typescript
// ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'mx-user-dark';

function getStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored ? stored === 'true' : true; // 默认暗色
  } catch {
    return true;
  }
}

function applyThemeToDOM(isDark: boolean): void {
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(getStoredTheme);

  // 初始化时应用主题
  useEffect(() => {
    applyThemeToDOM(isDark);
  }, [isDark]);

  // 监听 mxcad-app 主题变化（来自 Vue watch 派发的事件）
  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<{ isDark: boolean }>) => {
      const newTheme = e.detail.isDark;
      setIsDark(newTheme);
      localStorage.setItem(THEME_STORAGE_KEY, String(newTheme));
    };
    
    window.addEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
    return () => window.removeEventListener('mxcad-theme-changed', handleThemeChange as EventListener);
  }, []);

  const toggleTheme = useCallback(async () => {
    // 尝试通过 mxcad-app 切换
    try {
      const { mxcadApp } = await import('mxcad-app');
      const vuetify = await mxcadApp.getVuetify();
      vuetify.theme.toggle(['light', 'dark']);
      // Vue watch 会派发 mxcad-theme-changed 事件，触发 React 状态更新
    } catch {
      // mxcad-app 未初始化时，直接切换
      const newTheme = !isDark;
      setIsDark(newTheme);
      applyThemeToDOM(newTheme);
      localStorage.setItem(THEME_STORAGE_KEY, String(newTheme));
    }
  }, [isDark]);

  const setTheme = useCallback(async (dark: boolean) => {
    try {
      const { mxcadApp } = await import('mxcad-app');
      const vuetify = await mxcadApp.getVuetify();
      vuetify.theme.change(dark ? 'dark' : 'light');
    } catch {
      setIsDark(dark);
      applyThemeToDOM(dark);
      localStorage.setItem(THEME_STORAGE_KEY, String(dark));
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

#### Step 3: 在 CADEditorDirect 初始化时设置 Vue watch

```typescript
// CADEditorDirect.tsx 中，mxcad-app 初始化后
const initThemeSync = async () => {
  const { mxcadApp } = await import('mxcad-app');
  const vuetify = await mxcadApp.getVuetify();
  
  // 使用 Vue 的 watch 监听主题变化
  const { watch } = await import('vue');
  
  watch(
    () => vuetify.theme.global.name.value,
    (themeName) => {
      const isDark = themeName === 'dark';
      // 派发事件通知 React
      window.dispatchEvent(new CustomEvent('mxcad-theme-changed', {
        detail: { isDark }
      }));
      // 同时更新 DOM（双保险）
      document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
      localStorage.setItem('mx-user-dark', String(isDark));
    },
    { immediate: true }
  );
};
```

#### Step 4: Layout 顶部栏添加切换按钮

```tsx
// Layout.tsx 右侧工具栏区域添加
import { useTheme } from '../contexts/ThemeContext';
import Sun from 'lucide-react/dist/esm/icons/sun';
import Moon from 'lucide-react/dist/esm/icons/moon';

// 在组件内
const { isDark, toggleTheme } = useTheme();

// 在右侧工具栏添加按钮
<button
  onClick={toggleTheme}
  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
  title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
>
  {isDark ? <Sun size={20} /> : <Moon size={20} />}
</button>
```

#### Step 5: 在 index.tsx 包裹 ThemeProvider

```tsx
// index.tsx
import { ThemeProvider } from './contexts/ThemeContext';

// 在 AppInitializer 返回中包裹
return (
  <Suspense fallback={<GlobalLoading />}>
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  </Suspense>
);
```

---

## 5. 改动文件清单

| 文件 | 改动类型 | 改动内容 | 预计行数 |
|------|----------|----------|----------|
| `app.css` | 新增 | `[data-theme="dark"]` CSS 变量覆盖 | ~40 行 |
| `ThemeContext.tsx` | 重写 | 简化为事件驱动同步 | ~70 行 |
| `CADEditorDirect.tsx` | 新增 | 初始化时设置 Vue watch | ~15 行 |
| `Layout.tsx` | 新增 | 顶部栏添加切换按钮 | ~10 行 |
| `index.tsx` | 修改 | 包裹 ThemeProvider | ~3 行 |

**总计：~140 行代码改动**

---

## 6. 待确认事项

1. **暗色配色方案**：是否直接反转现有 slate 色阶？还是有特定设计稿？

2. **公开页面主题**：登录/注册页面是否需要支持主题切换？
   - 选项 A：跟随 localStorage，页面加载时读取并应用
   - 选项 B：固定浅色，不参与主题切换

3. **切换按钮位置**：Layout.tsx 顶部栏右侧（时间显示旁边），是否合适？

4. **其他样式覆盖**：是否需要处理以下场景？
   - Modal 弹窗暗色背景
   - Toast 通知暗色样式
   - 第三方组件（如有）

---

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CSS 变量覆盖不完整 | 部分组件颜色未变化 | 逐页测试，补充遗漏变量 |
| mxcad-app 未初始化时切换 | 切换按钮无响应 | 降级为直接 DOM 操作 + localStorage |
| Vue watch 内存泄漏 | 页面切换后监听未清理 | 在组件卸载时停止 watch |

---

## 8. 后续优化（可选）

1. **主题过渡动画**：添加 `transition: background-color 0.3s` 实现平滑切换
2. **系统主题跟随**：通过 `prefers-color-scheme` 媒体查询自动适配
3. **主题预览**：在设置页面提供主题预览卡片
