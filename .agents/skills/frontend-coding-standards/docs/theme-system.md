# 主题系统使用规则

CloudCAD 具有完善的 CSS 变量主题系统（v2.0.0），支持亮色/深色双主题。**所有视觉属性必须使用 CSS 变量，禁止硬编码。**

## 颜色速查

### 背景颜色

| 用途 | CSS 变量 | 说明 |
|------|---------|------|
| 页面整体背景 | `var(--bg-primary)` | #f8fafc 浅灰 |
| 卡片/面板背景 | `var(--bg-secondary)` | #ffffff 白色 |
| 悬停态背景 | `var(--bg-tertiary)` | #f1f5f9 更浅灰 |
| 弹窗背景 | `var(--bg-elevated)` | #ffffff 白色 |
| 遮罩层 | `var(--bg-overlay)` | rgba(15,23,42,0.5) |
| 画布背景 | `var(--bg-canvas)` | #ffffff |

### 文字颜色

| 用途 | CSS 变量 |
|------|---------|
| 标题/重要文字 | `var(--text-primary)` |
| 正文 | `var(--text-secondary)` |
| 辅助/描述文字 | `var(--text-tertiary)` |
| 禁用/弱化文字 | `var(--text-muted)` |
| 深色背景上的文字 | `var(--text-inverse)` |

### 边框颜色

| 用途 | CSS 变量 |
|------|---------|
| 微妙分割线 | `var(--border-subtle)` |
| 默认边框 | `var(--border-default)` |
| 强调边框 | `var(--border-strong)` |
| 聚焦边框 | `var(--border-focus)` |

### 品牌色（Tailwind 侧 `--color-*`）

| 色阶 | 主品牌（工程蓝） | 强调色（青蓝） |
|------|--------------|------------|
| 50 | `var(--color-primary-50)` | `var(--color-accent-50)` |
| 100 | `var(--color-primary-100)` | `var(--color-accent-100)` |
| 200 | `var(--color-primary-200)` | `var(--color-accent-200)` |
| 300 | `var(--color-primary-300)` | `var(--color-accent-300)` |
| 400 | `var(--color-primary-400)` | `var(--color-accent-400)` |
| 500 (基准) | `var(--color-primary-500)` #6366f1 | `var(--color-accent-500)` #06b6d4 |
| 600 | `var(--color-primary-600)` | `var(--color-accent-600)` |
| 700 | `var(--color-primary-700)` | `var(--color-accent-700)` |
| 800 | `var(--color-primary-800)` | `var(--color-accent-800)` |
| 900 | `var(--color-primary-900)` | `var(--color-accent-900)` |

### 语义色

| 用途 | CSS 变量 |
|------|---------|
| 成功 | `var(--color-success-500)` / `var(--color-success-600)` |
| 警告 | `var(--color-warning-500)` / `var(--color-warning-600)` |
| 错误 | `var(--color-error-500)` / `var(--color-error-600)` |
| 信息 | `var(--color-info-500)` / `var(--color-info-600)` |

### 中性色（Tailwind 侧）

| 色阶 | CSS 变量 |
|------|---------|
| 50-900 | `var(--color-slate-{50..900})` |

## 其他 Token

| 属性 | 使用 |
|------|------|
| 字体 | `font-family: var(--font-family-base)` 或 `var(--font-family-mono)` |
| 间距 | `var(--spacing-1)` ~ `var(--spacing-96)`，优先使用 Tailwind 类名 `p-4` 等 |
| 圆角 | `var(--radius-sm)` / `var(--radius-md)` / `var(--radius-lg)` |
| 阴影 | `var(--shadow-sm)` / `var(--shadow-md)` / `var(--shadow-lg)` |

## 正确 vs 错误

### ❌ 错误
```tsx
<div style={{ color: '#6366f1', background: 'white', border: '1px solid #e2e8f0' }}>
```
```css
.my-button { color: #333; background: #f8fafc; }
```

### ✅ 正确
```tsx
<div style={{
  color: 'var(--primary-500)',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-default)'
}}>
```
```css
.my-button {
  color: var(--text-primary);
  background: var(--bg-primary);
}
```

### Tailwind 类名（推荐）
```tsx
<div className="text-primary-500 bg-primary text-slate-700 border border-default">
```
Tailwind 类名已通过 `app.css` 的 `@layer base` 配置映射到 CSS 变量，优先使用 Tailwind 类名。

## 主题切换

深色模式通过 `data-theme="dark"` 属性触发（在根元素上），CSS 变量自动切换值。写组件时只需使用变量，主题切换由基础设施处理。

## 快速检查

写完任何组件/样式后，检查：
- [ ] 所有颜色用了 CSS 变量或 Tailwind 类名（无硬编码色值）
- [ ] 所有背景色用了 `--bg-*` 变量
- [ ] 所有文字颜色用了 `--text-*` 变量
- [ ] 所有边框用了 `--border-*` 变量
- [ ] 字体用了 `--font-family-*` 变量（无硬编码字体栈）
