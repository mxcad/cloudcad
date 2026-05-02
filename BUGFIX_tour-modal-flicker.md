# 引导弹框闪烁问题修复

## 问题描述

用户点击"跳过引导"按钮后，弹框会闪烁一下并重新显示，导致无法跳过引导。

## 问题根源

在 `TourContext.tsx` 中存在竞态条件：

1. **dismissStartModal 函数**（第546-549行）：
   - `setIsStartModalOpen(false)` - 关闭弹框
   - `saveDismissedState(true)` - 保存 dismissed 状态到 localStorage

2. **useEffect 监听器**（第213-253行）：
   - 依赖 `[isAuthenticated, location.pathname]`
   - 当用户登录后或路由变化时会重新运行
   - 从 localStorage 读取 dismissed 状态
   - 如果 dismissed 为 false，就调用 `setIsStartModalOpen(true)`

3. **竞态条件**：
   - 用户点击"跳过引导"
   - `setIsStartModalOpen(false)` 触发重渲染（异步）
   - 同时路由变化触发 useEffect 重新运行
   - useEffect 读取 localStorage（可能还是旧值，因为 setState 是异步的）
   - 发现 dismissed 为 false，又调用 `setIsStartModalOpen(true)`
   - 导致弹框闪烁：关闭 → 重新打开

## 修复方案

添加 `userDismissedRef` 标记，记录用户是否主动关闭了弹框：

### 修改 1：添加 ref 标记

```typescript
// 标记用户是否主动关闭了引导弹框（防止 useEffect 重新打开）
const userDismissedRef = useRef(false);
```

### 修改 2：在 useEffect 中检查标记

```typescript
initializedAfterLoginRef.current = true;

// 如果用户主动关闭了弹框，不再显示
if (userDismissedRef.current) {
  return;
}

// 从 localStorage 检查 dismissed 状态
const dismissed = loadDismissedState();
if (!dismissed) {
  setIsStartModalOpen(true);
}
```

### 修改 3：在 dismissStartModal 中设置标记

```typescript
const dismissStartModal = useCallback(() => {
  // 先设置标记，防止 useEffect 重新打开
  userDismissedRef.current = true;
  // 持久化 dismissed 状态
  saveDismissedState(true);
  // 再关闭弹框
  setIsStartModalOpen(false);
}, []);
```

## 修复效果

- ✅ 用户点击"跳过引导"后，弹框正常关闭
- ✅ 即使路由变化或状态更新，弹框也不会重新显示
- ✅ localStorage 状态正确保存，下次登录不会再次显示
- ✅ 不影响其他引导功能（启动引导、完成引导等）

## 修改文件

- `packages/frontend/src/contexts/TourContext.tsx`

## 测试建议

1. 登录后访问首页，应该显示欢迎弹框
2. 点击"稍后再说"，弹框应该关闭且不重新显示
3. 刷新页面，弹框不应该再次显示
4. 退出登录重新登录，弹框不应该再次显示
5. 点击"立即查看引导"，应该正常启动引导流程
