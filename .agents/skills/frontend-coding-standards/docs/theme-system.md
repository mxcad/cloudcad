# 主题系统使用规则（ADR-0032）

CloudCAD 的 CSS 变量主题系统（v2.0.0），支持亮色/深色双主题。**所有视觉属性必须使用 CSS 变量 token，禁止硬编码。**

## 主范式（ADR-0032）

```
主题语义 token（theme.css：--bg-* / --text-* / --primary-* 等） → 颜色/主题
CSS Modules（.module.css / 组件内 <style>）                    → 组件复杂样式
Tailwind utility（布局/间距/flex/grid 等无主题类）              → 布局
内联 style                                                     → 仅限动态值（isSelected 分支、尺寸计算、transform 等），禁止主题色硬编码
```

- **`--color-*` 命名空间已废弃**：禁止新增 `--color-*` 变量；存量引用（`var(--color-primary-500)` 等）应机械替换为语义 token（`--color-primary-*`→`--primary-*`，slate 按语义映射 `--bg-*`/`--text-*`/`--border-*`，success/error/warning 系→`--success-*` 等）。执行 ticket 193 正在迁移中。
- **主题色不用 Tailwind 色板类**：`text-primary-600` 等未注册 `@theme` 会静默失效，用 `var(--primary-600)` 或任意值语法 `bg-[var(--primary-600)]`。
- **禁止 JS 模板字符串 CSS**（`<style>${...}</style>`）：存量（LoginStyles/RoleManagementStyles/UserManagementStyles 等）随样式迁移执行 ticket 193 消灭，新增一律 CSS Modules 或组件内 `<style>`。

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

### 品牌色（theme.css 语义 token）

| 色阶 | 主品牌（工程蓝） | 强调色（青蓝） |
|------|--------------|------------|
| 50-900 | `var(--primary-{50..900})` | `var(--accent-{50..900})` |

基准色：`--primary-500` #6366f1，`--accent-500` #06b6d4。

### 语义色

| 用途 | CSS 变量 |
|------|---------|
| 成功 | `var(--success-500)` / `var(--success-600)` |
| 警告 | `var(--warning-500)` / `var(--warning-600)` |
| 错误 | `var(--error-500)` / `var(--error-600)` |
| 信息 | `var(--info-500)` / `var(--info-600)` |

### 中性色

Tailwind 内置 slate 色板可用（`bg-slate-50`、`text-slate-700` 等），无需自定义变量。

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
// 内联硬编码色值
<div style={{ color: '#6366f1', background: 'white', border: '1px solid #e2e8f0' }}>
// 已废弃的 --color-* 变量
<div style={{ color: 'var(--color-primary-500)' }}>
// 未注册的 Tailwind 色板类（静默失效）
<div className="text-primary-600">
// JS 模板字符串 CSS
<style>{`.my-button { color: ${primaryColor}; }`}</style>
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
<div className="bg-[var(--primary-500)] text-slate-700">
```
```css
/* 组件样式用 CSS Modules */
.my-button {
  color: var(--text-primary);
  background: var(--bg-primary);
}
```

## 主题切换

深色模式通过 `data-theme="dark"` 属性触发（在根元素上），CSS 变量自动切换值。写组件时只需使用变量，主题切换由基础设施处理。

## 快速检查

写完任何组件/样式后，检查：
- [ ] 所有颜色用了 CSS 变量或布局类（无硬编码色值）
- [ ] 无 `--color-*` 变量引用
- [ ] 所有背景色用了 `--bg-*` 变量
- [ ] 所有文字颜色用了 `--text-*` 变量
- [ ] 所有边框用了 `--border-*` 变量
- [ ] 字体用了 `--font-family-*` 变量（无硬编码字体栈）
- [ ] 无 JS 模板字符串 CSS；组件复杂样式在 `.module.css`
- [ ] 内联 style 只放动态值
