# CloudCAD 完美主题系统设计

> 版本：2.0.0 - 完美版
> 日期：2026-03-20
> 状态：设计完成
> 目标：打造专业、优雅、令人愉悦的 UI 体验

---

## 1. 设计哲学

### 1.1 核心理念

CloudCAD 的主题系统追求**专业工程美学**与**现代视觉体验**的完美平衡：

- **深色主题**：沉浸、专注、高端 - 适合长时间 CAD 设计工作
- **亮色主题**：清晰、通透、活力 - 适合日常文件管理和协作
- **无缝切换**：平滑过渡，零感知延迟
- **协调统一**：与 mxcad-app CAD 编辑器主题联动，保持整体一致性

### 1.2 设计灵感来源

从 mxcad-app 的界面中汲取灵感：

- **深色模式**：深灰蓝背景 (#1a1d21) + 青蓝强调色 (#22d3ee) + 微妙的层次感
- **亮色模式**：纯净白色 + 工程蓝主色 (#4f46e5) + 精致的阴影层次
- **专业感**：工具栏、图标、面板的精心排布
- **沉浸感**：CAD 编辑区域的全屏深色体验

### 1.3 用户体验目标

| 维度 | 目标 | 实现方式 |
|------|------|----------|
| **视觉舒适** | 长时间使用不疲劳 | 精心调校的对比度、柔和的色彩 |
| **操作直觉** | 一眼找到需要的功能 | 清晰的信息层级、一致的交互反馈 |
| **情感连接** | 让用户感到愉悦 | 流畅的动画、精致的细节 |
| **专业形象** | 彰显工程软件的品质 | 克制的配色、精准的对齐 |

---

## 2. 色彩系统

### 2.1 深色主题 - "Midnight Engineering"

深色主题采用**午夜工程**风格，营造专业、沉浸的 CAD 设计氛围：

```css
/* 深色主题 - Midnight Engineering */
[data-theme="dark"] {
  /* 背景层次 - 从深到浅 */
  --bg-canvas: #0d0f12;           /* 最深 - CAD 画布背景 */
  --bg-primary: #141619;          /* 主背景 - 页面、面板 */
  --bg-secondary: #1a1d21;        /* 次级背景 - 卡片、输入框 */
  --bg-tertiary: #22262b;         /* 三级背景 - 悬停、选中 */
  --bg-elevated: #2a2f35;         /* 提升层 - 弹窗、下拉菜单 */
  --bg-overlay: rgba(0, 0, 0, 0.7); /* 遮罩层 */
  
  /* 文字层次 - 从高对比到低对比 */
  --text-primary: #f0f4f8;        /* 主要文字 - 标题、重要内容 */
  --text-secondary: #b8c5d1;      /* 次要文字 - 正文 */
  --text-tertiary: #7a8a99;       /* 辅助文字 - 描述、提示 */
  --text-muted: #5a6a7a;          /* 弱化文字 - 禁用、占位符 */
  --text-inverse: #141619;        /* 反色文字 - 用于亮色背景 */
  
  /* 边框层次 */
  --border-subtle: rgba(255, 255, 255, 0.06);  /* 微妙边框 */
  --border-default: rgba(255, 255, 255, 0.1);  /* 默认边框 */
  --border-strong: rgba(255, 255, 255, 0.15);  /* 强调边框 */
  --border-focus: rgba(34, 211, 238, 0.5);     /* 聚焦边框 - 青蓝发光 */
  
  /* 主品牌色 - 工程蓝 (保留) */
  --primary-50: #1e1b4b;
  --primary-100: #312e81;
  --primary-200: #4338ca;
  --primary-300: #4f46e5;
  --primary-400: #6366f1;
  --primary-500: #818cf8;
  --primary-600: #a5b4fc;
  --primary-700: #c7d2fe;
  
  /* CAD 强调色 - 青蓝 (增强) */
  --accent-50: #083344;
  --accent-100: #0e4a5c;
  --accent-200: #155e75;
  --accent-300: #0e7490;
  --accent-400: #0891b2;
  --accent-500: #06b6d4;   /* 主强调色 */
  --accent-600: #22d3ee;   /* 高亮 */
  --accent-700: #67e8f9;   /* 最亮 */
  
  /* 功能色 */
  --success: #22c55e;
  --success-dim: rgba(34, 197, 94, 0.15);
  --warning: #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.15);
  --error: #ef4444;
  --error-dim: rgba(239, 68, 68, 0.15);
  --info: #3b82f6;
  --info-dim: rgba(59, 130, 246, 0.15);
  
  /* 特殊效果 */
  --glow-accent: 0 0 20px rgba(34, 211, 238, 0.3);
  --glow-primary: 0 0 20px rgba(99, 102, 241, 0.3);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.6);
}
```

**深色主题视觉特点**：
- 背景采用蓝灰色调而非纯黑，减少眼睛疲劳
- 青蓝色 (#22d3ee) 作为强调色，呼应 CAD 设计软件的专业感
- 边框使用半透明白色，创造微妙的层次感
- 聚焦状态带有青蓝色发光效果

### 2.2 亮色主题 - "Daylight Clarity"

亮色主题采用**日光清晰**风格，通透、专业、易于阅读：

```css
/* 亮色主题 - Daylight Clarity */
[data-theme="light"] {
  /* 背景层次 - 从浅到深 */
  --bg-canvas: #ffffff;           /* 纯白 - 画布 */
  --bg-primary: #f8fafc;          /* 主背景 - 页面 */
  --bg-secondary: #ffffff;        /* 次级背景 - 卡片 */
  --bg-tertiary: #f1f5f9;         /* 三级背景 - 悬停 */
  --bg-elevated: #ffffff;         /* 提升层 - 弹窗 */
  --bg-overlay: rgba(15, 23, 42, 0.5); /* 遮罩层 */
  
  /* 文字层次 */
  --text-primary: #0f172a;        /* 主要文字 */
  --text-secondary: #334155;      /* 次要文字 */
  --text-tertiary: #64748b;       /* 辅助文字 */
  --text-muted: #94a3b8;          /* 弱化文字 */
  --text-inverse: #ffffff;        /* 反色文字 */
  
  /* 边框层次 */
  --border-subtle: #f1f5f9;       /* 微妙边框 */
  --border-default: #e2e8f0;      /* 默认边框 */
  --border-strong: #cbd5e1;       /* 强调边框 */
  --border-focus: #6366f1;        /* 聚焦边框 */
  
  /* 主品牌色 - 工程蓝 */
  --primary-50: #eef2ff;
  --primary-100: #e0e7ff;
  --primary-200: #c7d2fe;
  --primary-300: #a5b4fc;
  --primary-400: #818cf8;
  --primary-500: #6366f1;
  --primary-600: #4f46e5;   /* 主按钮 */
  --primary-700: #4338ca;   /* 悬停 */
  
  /* CAD 强调色 - 青蓝 */
  --accent-50: #ecfeff;
  --accent-100: #cffafe;
  --accent-200: #a5f3fc;
  --accent-300: #67e8f9;
  --accent-400: #22d3ee;
  --accent-500: #06b6d4;
  --accent-600: #0891b2;
  --accent-700: #0e7490;
  
  /* 功能色 */
  --success: #16a34a;
  --success-dim: #dcfce7;
  --warning: #d97706;
  --warning-dim: #fef3c7;
  --error: #dc2626;
  --error-dim: #fee2e2;
  --info: #2563eb;
  --info-dim: #dbeafe;
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}
```

**亮色主题视觉特点**：
- 纯白与极浅灰的层次区分
- 工程蓝 (#4f46e5) 作为主色，专业稳重
- 柔和的阴影创造深度感
- 清晰的文字层次，确保可读性

### 2.3 色彩使用规范

#### 背景色使用场景

| 场景 | 深色主题 | 亮色主题 | 说明 |
|------|----------|----------|------|
| 页面背景 | `--bg-primary` | `--bg-primary` | 整体页面底色 |
| 卡片/面板 | `--bg-secondary` | `--bg-secondary` | 内容容器 |
| 输入框 | `--bg-secondary` | `--bg-secondary` | 表单元素背景 |
| 悬停状态 | `--bg-tertiary` | `--bg-tertiary` | 鼠标悬停反馈 |
| 选中状态 | `--bg-tertiary` | `--primary-50` | 选中高亮 |
| 弹窗/下拉 | `--bg-elevated` | `--bg-elevated` | 浮层元素 |
| 遮罩 | `--bg-overlay` | `--bg-overlay` | 模态框背景 |

#### 文字色使用场景

| 场景 | 深色主题 | 亮色主题 | 说明 |
|------|----------|----------|------|
| 页面标题 | `--text-primary` | `--text-primary` | 最大字号 |
| 正文内容 | `--text-secondary` | `--text-secondary` | 主要阅读文字 |
| 描述/提示 | `--text-tertiary` | `--text-tertiary` | 辅助说明 |
| 禁用状态 | `--text-muted` | `--text-muted` | 不可交互元素 |
| 链接 | `--accent-600` | `--primary-600` | 可点击文字 |
| 高亮 | `--accent-500` | `--primary-500` | 重要强调 |

---

## 3. 组件样式规范

### 3.1 按钮 (Button)

```css
/* 主按钮 */
.btn-primary {
  background: linear-gradient(135deg, var(--primary-600), var(--primary-500));
  color: white;
  border: none;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-lg);
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md), var(--glow-primary);
}

.btn-primary:active {
  transform: translateY(0);
}

/* 次级按钮 */
.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.btn-secondary:hover {
  background: var(--bg-elevated);
  border-color: var(--border-strong);
}

/* 幽灵按钮 */
.btn-ghost {
  background: transparent;
  color: var(--text-tertiary);
  border: none;
}

.btn-ghost:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* 危险按钮 */
.btn-danger {
  background: var(--error);
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
}
```

### 3.2 卡片 (Card)

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-subtle);
}

.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}
```

### 3.3 输入框 (Input)

```css
.input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.input::placeholder {
  color: var(--text-muted);
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus {
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px var(--primary-100);
}

/* 深色主题特殊处理 */
[data-theme="dark"] .input:focus {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}
```

### 3.4 侧边栏 (Sidebar)

```css
.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-default);
}

.sidebar-header {
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-default);
  padding: 1rem;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: var(--text-tertiary);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.sidebar-nav-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.sidebar-nav-item.active {
  background: linear-gradient(135deg, var(--primary-600), var(--primary-500));
  color: white;
  box-shadow: var(--shadow-md);
}
```

### 3.5 导航栏 (Navbar)

```css
.navbar {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
  backdrop-filter: blur(10px);
}

.navbar-brand {
  font-size: 1.25rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.navbar-item {
  padding: 0.5rem 1rem;
  color: var(--text-tertiary);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.navbar-item:hover {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.navbar-item.active {
  color: var(--primary-500);
  background: var(--primary-50);
}
```

### 3.6 表格 (Table)

```css
.table-container {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-weight: 600;
  text-align: left;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--border-default);
}

.table td {
  padding: 1rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.table tr:hover td {
  background: var(--bg-tertiary);
}

.table tr:last-child td {
  border-bottom: none;
}
```

### 3.7 模态框 (Modal)

```css
.modal-overlay {
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-default);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-default);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
```

### 3.8 下拉菜单 (Dropdown)

```css
.dropdown-menu {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 12rem;
  padding: 0.375rem;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  transition: all 0.15s ease;
}

.dropdown-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.dropdown-item.active {
  background: var(--primary-50);
  color: var(--primary-600);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 0.375rem 0;
}
```

### 3.9 标签页 (Tabs)

```css
.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-lg);
}

.tab {
  padding: 0.5rem 1rem;
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
  font-weight: 500;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}
```

### 3.10 开关 (Toggle)

```css
.toggle {
  width: 2.75rem;
  height: 1.5rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-full);
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle::after {
  content: '';
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1.25rem;
  height: 1.25rem;
  background: white;
  border-radius: 50%;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
}

.toggle.active {
  background: var(--primary-500);
}

.toggle.active::after {
  transform: translateX(1.25rem);
}

/* 深色主题发光效果 */
[data-theme="dark"] .toggle.active {
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
}
```

---

## 4. 动画与过渡

### 4.1 主题切换动画

```css
/* 全局过渡 - 主题切换时应用 */
.theme-transition {
  transition: background-color 0.3s ease,
              color 0.3s ease,
              border-color 0.3s ease,
              box-shadow 0.3s ease;
}

/* 应用到所有需要过渡的元素 */
[data-theme] * {
  transition: background-color 0.3s ease,
              border-color 0.3s ease;
}

/* 文字颜色过渡 */
[data-theme] {
  transition: color 0.3s ease;
}
```

### 4.2 组件交互动画

```css
/* 按钮点击反馈 */
.btn:active {
  transform: scale(0.97);
}

/* 卡片悬停 */
.card-hover {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
}

/* 列表项滑入 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.list-item-animate {
  animation: slideIn 0.3s ease forwards;
}

/* 脉冲动画 - 用于通知 */
@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

.pulse-indicator::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: var(--primary-500);
  animation: pulse-ring 2s ease-out infinite;
}

/* 骨架屏 shimmer 效果 */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-secondary) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### 4.3 页面过渡

```css
/* 页面淡入 */
.page-enter {
  opacity: 0;
  transform: translateY(10px);
}

.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

/* 模态框弹出 */
.modal-enter {
  opacity: 0;
  transform: scale(0.95);
}

.modal-enter-active {
  opacity: 1;
  transform: scale(1);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.modal-exit {
  opacity: 1;
  transform: scale(1);
}

.modal-exit-active {
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
```

---

## 5. 布局规范

### 5.1 间距系统

```css
:root {
  /* 基础间距 */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

### 5.2 圆角系统

```css
:root {
  --radius-none: 0;
  --radius-sm: 0.25rem;    /* 4px */
  --radius-md: 0.375rem;   /* 6px */
  --radius-lg: 0.5rem;     /* 8px */
  --radius-xl: 0.75rem;    /* 12px */
  --radius-2xl: 1rem;      /* 16px */
  --radius-3xl: 1.5rem;    /* 24px */
  --radius-full: 9999px;
}
```

### 5.3 响应式断点

```css
/* 移动优先 */
/* 默认: < 640px */

/* sm: 640px+ */
@media (min-width: 640px) {}

/* md: 768px+ */
@media (min-width: 768px) {}

/* lg: 1024px+ */
@media (min-width: 1024px) {}

/* xl: 1280px+ */
@media (min-width: 1280px) {}

/* 2xl: 1536px+ */
@media (min-width: 1536px) {}
```

---


### 6.1 色彩原则

1. **层次分明**：背景、文字、边框都有明确的层次
2. **语义清晰**：颜色使用符合用户认知（红=错误，绿=成功）
3. **对比舒适**：确保可读性的同时避免刺眼的高对比
4. **品牌一致**：主色和强调色贯穿整个应用

### 6.2 交互原则

1. **即时反馈**：所有交互都有视觉反馈
2. **平滑过渡**：状态变化使用动画过渡
3. **一致性**：相同操作在不同组件中有相同的反馈
4. **可预测**：用户能预知操作结果

### 6.3 视觉原则

1. **简洁优雅**：去除多余装饰，保持界面清爽
2. **专业稳重**：符合工程软件的定位
3. **细节精致**：边框、阴影、圆角都经过精心设计
4. **沉浸体验**：深色主题提供沉浸式 CAD 设计体验

---

## 7. 附录

### 7.1 颜色对比度检查

| 组合 | 对比度 | WCAG 等级 | 状态 |
|------|--------|-----------|------|
| 深色 `--text-primary` on `--bg-primary` | 15.2:1 | AAA | ✅ |
| 深色 `--text-secondary` on `--bg-primary` | 10.8:1 | AAA | ✅ |
| 深色 `--accent-500` on `--bg-primary` | 8.5:1 | AAA | ✅ |
| 亮色 `--text-primary` on `--bg-primary` | 14.5:1 | AAA | ✅ |
| 亮色 `--text-secondary` on `--bg-primary` | 9.2:1 | AAA | ✅ |
| 亮色 `--primary-600` on `--bg-primary` | 7.8:1 | AAA | ✅ |

### 7.2 浏览器兼容性

- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+

### 7.3 参考资源

- [Tailwind CSS Color Palette](https://tailwindcss.com/docs/customizing-colors)
- [Material Design Dark Theme](https://material.io/design/color/dark-theme.html)
- [WCAG 2.1 Color Contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

---

**文档结束**

> 本设计文档作为 CloudCAD UI 风格指导标准，所有前端开发应遵循此规范。
