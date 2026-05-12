# Z-Index 层级系统

所有 z-index 必须引用 `Z_LAYERS` 常量，**绝对禁止裸数字**。

## 层级速查表

| 常量 | 值 | 用途 | 使用场景 |
|------|----|------|---------|
| `Z_LAYERS.BACKGROUND` | 0 | 动态背景 | ParticleBackground 等背景动画 |
| `Z_LAYERS.CONTENT` | 10 | 正常页面内容 | 常规 DOM 元素，无需设置 |
| `Z_LAYERS.SIDEBAR` | 100 | 侧边栏面板 | 文件树、属性面板、协作面板 |
| `Z_LAYERS.CAD_EDITOR` | 1000 | CAD 编辑器画布 | CADEditorDirect.tsx 的 WebGL 画布层 |
| `Z_LAYERS.OVERLAY` | 5000 | 半透明遮罩 | 抽屉/面板的灰色遮罩背景 |
| `Z_LAYERS.MODAL` | 10000 | 模态弹窗 | Dialog、Modal、Confirm 弹窗 |
| `Z_LAYERS.TOOLTIP` | 50000 | 提示框 | Tooltip、Popover |
| `Z_LAYERS.TOAST` | 100000 | Toast 通知 | 最高优先级，始终在最顶层 |

## 使用方式

```typescript
import { Z_LAYERS } from '@/constants/layers';

// ✅ 正确
<div style={{ zIndex: Z_LAYERS.MODAL }}>
<div style={{ zIndex: Z_LAYERS.TOOLTIP }}>
<div style={{ zIndex: Z_LAYERS.CAD_EDITOR }}>

// ❌ 错误 — 禁止裸数字
<div style={{ zIndex: 9999 }}>
<div style={{ zIndex: 999 }}>
<div style={{ zIndex: 1000 }}>
```

## 选择正确层级

| 你在实现... | 应该使用... |
|-----------|-----------|
| 弹窗/Dialog | `Z_LAYERS.MODAL` |
| 遮罩/背景灰色层 | `Z_LAYERS.OVERLAY` |
| 侧边栏 | `Z_LAYERS.SIDEBAR` |
| 提示信息 | `Z_LAYERS.TOOLTIP` |
| 通知/Toast | `Z_LAYERS.TOAST` |
| CAD 画布 | `Z_LAYERS.CAD_EDITOR` |
| 页面内容 | `Z_LAYERS.CONTENT` 或不设置 |

## 层级间隙

每层之间留有间隙，方便插入中间层。如果确实需要在现有层级之间插入新层（如 MODAL 和 TOOLTIP 之间），先在 `layers.ts` 中定义新常量，不要裸写数字。

## ADR 参考

详见 ADR 0004 — 前端 CSS Z-Index 层级体系：`docs/adr/0004-frontend-css-layer-system.md`
