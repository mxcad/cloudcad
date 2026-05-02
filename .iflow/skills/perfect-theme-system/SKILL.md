---
name: perfect-theme-system
description: 'CloudCAD 主题系统设计规范。涉及主题、颜色、CSS 变量、深色/亮色模式、UI 样式规范、组件样式、动画过渡、布局间距等时必须触发此技能。确保 UI 实现符合项目设计规范。'
---

# CloudCAD 完美主题系统

> **触发条件**：当涉及主题系统、颜色定义、CSS 变量、深色/亮色模式切换、UI 组件样式、动画过渡、布局规范等时，必须触发此技能

## 触发场景清单

以下场景**必须触发**此技能：

| 场景 | 示例 |
|------|------|
| 定义/修改 CSS 变量 | `--bg-primary`、`--text-secondary` |
| 主题切换实现 | 深色/亮色模式切换 |
| 组件样式编写 | 按钮、卡片、输入框、侧边栏等 |
| 动画与过渡 | 主题切换动画、组件交互动画 |
| 布局与间距 | gap、padding、margin、圆角 |
| 颜色选择 | 品牌色、强调色、功能色 |

---

## 一、设计哲学

### 核心理念

- **深色主题**：沉浸、专注、高端 - 适合长时间 CAD 设计工作
- **亮色主题**：清晰、通透、活力 - 适合日常文件管理和协作
- **无缝切换**：平滑过渡，零感知延迟
- **协调统一**：与 mxcad-app CAD 编辑器主题联动

### 设计原则

| 维度 | 原则 |
|------|------|
| 色彩 | 层次分明、语义清晰、对比舒适、品牌一致 |
| 交互 | 即时反馈、平滑过渡、一致性、可预测 |
| 视觉 | 简洁优雅、专业稳重、细节精致、沉浸体验 |

---

## 二、色彩系统

### 2.1 深色主题 - "Midnight Engineering"

```css
[data-theme="dark"] {
  /* 背景层次 - 从深到浅 */
  --bg-canvas: #0d0f12;           /* 最深 - CAD 画布背景 */
  --bg-primary: #141619;          /* 主背景 - 页面、面板 */
  --bg-secondary: #1a1d21;        /* 次级背景 - 卡片、输入框 */
  --bg-tertiary: #22262b;         /* 三级背景 - 悬停、选中 */
  --bg-elevated: #2a2f35;         /* 提升层 - 弹窗、下拉菜单 */
  --bg-overlay: rgba(0, 0, 0, 0.7); /* 遮罩层 */
  
  /* 文字层次 - 从高对比到低对比 */
  --text-primary: #f0f4f8;        /* 主要文字 - 标题 */
  --text-secondary: #b8c5d1;      /* 次要文字 - 正文 */
  --text-tertiary: #7a8a99;       /* 辅助文字 - 描述、提示 */
  --text-muted: #5a6a7a;          /* 弱化文字 - 禁用、占位符 */
  --text-inverse: #141619;        /* 反色文字 */
  
  /* 边框层次 */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.15);
  --border-focus: rgba(34, 211, 238, 0.5);  /* 青蓝发光 */
  
  /* 主品牌色 - 工程蓝 */
  --primary-500: #818cf8;
  --primary-600: #a5b4fc;
  
  /* CAD 强调色 - 青蓝 */
  --accent-500: #06b6d4;   /* 主强调色 */
  --accent-600: #22d3ee;   /* 高亮 */
  --accent-700: #67e8f9;   /* 最亮 */
  
  /* 功能色 */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
  
  /* 特殊效果 */
  --glow-accent: 0 0 20px rgba(34, 211, 238, 0.3);
  --glow-primary: 0 0 20px rgba(99, 102, 241, 0.3);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

### 2.2 亮色主题 - "Daylight Clarity"

```css
[data-theme="light"] {
  /* 背景层次 - 从浅到深 */
  --bg-canvas: #ffffff;
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f1f5f9;
  --bg-elevated: #ffffff;
  --bg-overlay: rgba(15, 23, 42, 0.5);
  
  /* 文字层次 */
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-tertiary: #64748b;
  --text-muted: #94a3b8;
  --text-inverse: #ffffff;
  
  /* 边框层次 */
  --border-subtle: #f1f5f9;
  --border-default: #e2e8f0;
  --border-strong: #cbd5e1;
  --border-focus: #6366f1;
  
  /* 主品牌色 */
  --primary-500: #6366f1;
  --primary-600: #4f46e5;   /* 主按钮 */
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```

### 2.3 色彩使用规范

| 场景 | 深色 | 亮色 | 说明 |
|------|------|------|------|
| 页面背景 | `--bg-primary` | `--bg-primary` | 整体页面底色 |
| 卡片/面板 | `--bg-secondary` | `--bg-secondary` | 内容容器 |
| 悬停状态 | `--bg-tertiary` | `--bg-tertiary` | 鼠标悬停反馈 |
| 选中状态 | `--bg-tertiary` | `--primary-50` | 选中高亮 |
| 弹窗/下拉 | `--bg-elevated` | `--bg-elevated` | 浮层元素 |
| 页面标题 | `--text-primary` | `--text-primary` | 最大字号 |
| 正文内容 | `--text-secondary` | `--text-secondary` | 主要阅读文字 |
| 描述/提示 | `--text-tertiary` | `--text-tertiary` | 辅助说明 |

---

## 三、组件样式规范

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

/* 次级按钮 */
.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

/* 幽灵按钮 */
.btn-ghost {
  background: transparent;
  color: var(--text-tertiary);
}

.btn-ghost:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
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
  transition: all 0.2s ease;
}

.input::placeholder {
  color: var(--text-muted);
}

.input:focus {
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}
```

### 3.4 侧边栏 (Sidebar)

```css
.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-default);
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
}
```

### 3.5 模态框 (Modal)

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
```

---

## 四、动画与过渡

### 4.1 主题切换动画

```css
/* 全局过渡 */
[data-theme] * {
  transition: background-color 0.3s ease,
              border-color 0.3s ease;
}

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
.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
}

/* 骨架屏 shimmer */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
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

---

## 五、布局规范

### 5.1 间距系统

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
}
```

### 5.2 圆角系统

```css
:root {
  --radius-sm: 0.25rem;    /* 4px */
  --radius-md: 0.375rem;   /* 6px */
  --radius-lg: 0.5rem;     /* 8px */
  --radius-xl: 0.75rem;    /* 12px */
  --radius-2xl: 1rem;      /* 16px */
  --radius-full: 9999px;
}
```

### 5.3 响应式断点

```css
/* 移动优先 */
/* sm: 640px+ */
@media (min-width: 640px) {}
/* md: 768px+ */
@media (min-width: 768px) {}
/* lg: 1024px+ */
@media (min-width: 1024px) {}
/* xl: 1280px+ */
@media (min-width: 1280px) {}
```

---

## 六、最佳实践检查清单

### 色彩检查

- [ ] 背景使用正确的层次变量（canvas → primary → secondary → tertiary → elevated）
- [ ] 文字使用正确的层次变量（primary → secondary → tertiary → muted）
- [ ] 边框使用正确的层次变量（subtle → default → strong → focus）
- [ ] 深色主题聚焦状态有青蓝色发光效果
- [ ] 所有文字对比度达到 WCAG AAA 标准（≥7:1）

### 交互检查

- [ ] 所有可交互元素有悬停状态
- [ ] 所有可交互元素有聚焦状态
- [ ] 状态变化有平滑过渡动画
- [ ] 主题切换有全局过渡动画

### 组件检查

- [ ] 按钮有正确的渐变和阴影
- [ ] 卡片有正确的悬停效果
- [ ] 输入框有正确的聚焦状态
- [ ] 模态框有背景模糊效果

---

## 七、快速参考

| 需求 | 使用 |
|------|------|
| 页面背景 | `var(--bg-primary)` |
| 卡片背景 | `var(--bg-secondary)` |
| 悬停背景 | `var(--bg-tertiary)` |
| 主要文字 | `var(--text-primary)` |
| 次要文字 | `var(--text-secondary)` |
| 描述文字 | `var(--text-tertiary)` |
| 默认边框 | `var(--border-default)` |
| 聚焦边框 | `var(--border-focus)` |
| 主按钮背景 | `var(--primary-600)` |
| 强调色 | `var(--accent-500)` |
| 成功色 | `var(--success)` |
| 警告色 | `var(--warning)` |
| 错误色 | `var(--error)` |
| 默认阴影 | `var(--shadow-md)` |
| 默认圆角 | `var(--radius-lg)` |
| 默认间距 | `var(--space-4)` |

---

**所有 UI 开发必须遵循此规范，确保主题系统的一致性和专业性。**
