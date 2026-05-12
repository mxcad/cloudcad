# 颜色使用示例

## ❌ 错误写法

```tsx
// 硬编码色值 — 不支持主题切换，维护困难
<div style={{ color: '#6366f1', background: 'white', border: '1px solid #e2e8f0' }}>
  标题文字
</div>

<div style={{ color: '#333', fontSize: '14px' }}>
  正文内容
</div>

<button style={{ background: '#4f46e5', color: 'white' }}>
  提交
</button>

<div className="bg-white text-gray-900 border border-gray-200">
  卡片内容  // 虽然用了 Tailwind 类名，但没有使用项目自定义的 Token
</div>
```

## ✅ 正确写法 — 使用 CSS 变量 + Tailwind Token

```tsx
// 方式 1：Tailwind 类名（推荐 — app.css 已映射到 CSS 变量）
<div className="text-primary-500 bg-primary border border-default rounded-md">
  标题文字
</div>

<div className="text-secondary">
  正文内容
</div>

<button className="bg-primary-600 text-white hover:bg-primary-700">
  提交
</button>

<div className="bg-secondary text-primary border border-default rounded-md p-4 shadow-sm">
  卡片内容
</div>

// 方式 2：内联样式使用 CSS 变量（动态场景）
<div style={{
  color: 'var(--primary-500)',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
}}>
  标题文字
</div>

// 语义色
<span className="text-success-500">操作成功</span>
<span className="text-error-500">操作失败</span>
<span className="text-warning-500">请注意</span>
<span className="text-info-500">提示信息</span>
```

## ✅ 正确写法 — 组件侧变量（theme.css）

```tsx
// 使用组件侧变量 — 适合需要明确语义的组件
<div style={{
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)',
  boxShadow: 'var(--shadow-md)',
}}>
  <h2 style={{ color: 'var(--text-primary)' }}>弹窗标题</h2>
  <p style={{ color: 'var(--text-secondary)' }}>弹窗正文</p>
  <span style={{ color: 'var(--text-muted)' }}>辅助信息</span>
</div>
```

## 背景层次选择

| 场景 | 使用 |
|------|------|
| 页面背景 | `var(--bg-primary)` 或 `className="bg-primary"` |
| 卡片 | `var(--bg-secondary)` 或 `className="bg-secondary"` |
| 卡片悬停 | `var(--bg-tertiary)` 或 `className="bg-tertiary"` |
| 弹窗 | `var(--bg-elevated)` |
| 遮罩 | `var(--bg-overlay)` |
| CAD 画布 | `var(--bg-canvas)` |

## 文字颜色选择

| 场景 | 使用 |
|------|------|
| 标题 | `var(--text-primary)` 或 `className="text-primary"` |
| 正文 | `var(--text-secondary)` 或 `className="text-secondary"` |
| 描述/辅助 | `var(--text-tertiary)` 或 `className="text-tertiary"` |
| 禁用 | `var(--text-muted)` 或 `className="text-muted"` |
