# 弹窗组件约定

## 弹窗方案选择

| 方案 | 适用场景 | 组件 |
|------|----------|------|
| `FloatingPopup` | 底部抽屉式弹窗，适合列表/复杂表单 | `src/components/FloatingPopup.vue` |
| `DialogBase` | 居中弹窗，适合确认/简单表单 | `src/components/DialogBase.vue` |

**禁止新组件直接使用裸 `van-dialog`** — 必须通过 `FloatingPopup` 或 `DialogBase`。

## 使用约定

- 所有弹窗统一使用 `usePopup()` composable 管理打开/关闭状态：
  ```ts
  const { show, open, close } = usePopup();
  ```
- 弹窗组件通过 `@close` emit 通知父组件关闭。

## 现有弹窗列表

| 组件 | 方案 | 文件 |
|------|------|------|
| CooperatePopup | FloatingPopup | `src/pages/home/components/CooperatePopup.vue` |
| CollabShareModal | FloatingPopup | `src/components/CollabShareModal.vue` |
| VersionHistoryPopup | FloatingPopup | `src/pages/home/components/VersionHistoryPopup.vue` |
| LoginPromptPopup | DialogBase | `src/pages/home/components/LoginPromptPopup.vue` |
