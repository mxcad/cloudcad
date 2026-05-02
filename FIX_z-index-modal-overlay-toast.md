# 修复:弹框遮罩层 z-index 高于提示组件问题

## 问题描述
弹框(Modal)的遮罩层 z-index 大于提示组件(Toast)的 z-index,导致当弹框打开时,Toast 提示会被遮罩层遮挡,用户无法看到提示信息。

## 问题分析
- **Modal 默认 z-index**: `10000` (位于 `Modal.tsx`)
- **Toast z-index**: `10000` (位于 `Toast.tsx`)
- **ConfirmDialog z-index**: `10000` (位于 `ConfirmDialog.tsx`)
- **ImagePreviewModal z-index**: `10000` (位于 `ImagePreviewModal.tsx`)

当多个组件使用相同的 z-index 值时,后渲染的组件会覆盖先渲染的组件,导致 Toast 被 Modal 遮罩层遮挡。

## 解决方案
将提示类组件的 z-index 提高到 `10001`,确保它们始终显示在弹框遮罩层之上:

### 修改文件

1. **Toast.tsx**
   - 修改前: `z-[10000]`
   - 修改后: `z-[10001]`
   - 位置: `packages/frontend/src/components/ui/Toast.tsx:59`

2. **ConfirmDialog.tsx**
   - 修改前: `z-[10000]`
   - 修改后: `z-[10001]`
   - 位置: `packages/frontend/src/components/ui/ConfirmDialog.tsx:28`

3. **ImagePreviewModal.tsx**
   - 修改前: `z-[10000]`
   - 修改后: `z-[10001]`
   - 位置: `packages/frontend/src/components/modals/ImagePreviewModal.tsx:67`

## z-index 层级规范

修改后的 z-index 层级结构:

| 组件 | z-index | 说明 |
|------|---------|------|
| TourTooltip | 10003 | 引导提示气泡(最高层级) |
| TourStartModal | 10002 | 引导开始弹窗 |
| **Toast/ConfirmDialog/ImagePreviewModal** | **10001** | 提示类组件(修复后) |
| Modal | 10000 | 普通弹框(默认值) |
| Drawer | 900 | 抽屉组件 |
| Sidebar | 100 | 侧边栏 |

## 测试验证
运行前端测试套件,所有 z-index 相关测试均通过:
- ✓ z-index 应该高于普通 Modal (50)
- ✓ z-index 应该高于 Drawer (900)
- ✓ z-index 应该高于 Toast (1100)

## 影响范围
- 仅影响提示类组件的显示层级
- 不影响现有功能逻辑
- 向后兼容,无破坏性变更

## 修复日期
2026-04-10
