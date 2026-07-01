# 弹窗模式

## FloatingPopup 基础用法

所有弹窗必须继承 `FloatingPopup` 组件。

### 模板结构

```vue
<template>
  <FloatingPopup
    v-model:show="innerShow"
    title="弹窗标题"
  >
    <!-- 弹窗内容 -->
    <div class="popup-content">
      <!-- ... -->
    </div>

    <!-- 底部操作按钮（必须放在 footer slot） -->
    <template #footer>
      <van-button
        block
        round
        size="large"
        type="primary"
        @click="handleConfirm"
      >
        确认
      </van-button>
    </template>
  </FloatingPopup>
</template>
```

### 脚本模式

```typescript
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [val: boolean] }>();
const innerShow = ref(props.show);

// 同步父组件 show → innerShow
watch(() => props.show, (val) => { innerShow.value = val; });

// 同步 innerShow → 父组件 ref
watch(innerShow, (val) => { emit('update:show', val); });

function handleClose() {
  innerShow.value = false;
}
```

### 样式约定

```css
/* 底部按钮样式 */
footer .van-button {
  /* block round size="large" 已在模板中设置 */
}
```

### 已使用 FloatingPopup 的组件

- `SharePopup.vue` — 分享弹窗
- `CooperatePopup.vue` — 协同弹窗
- `VersionHistoryPopup.vue` — 版本历史
- `CollabShareModal.vue` — 协同分享
- `DwgOptionsPopup.vue` — DWG 选项
- `PdfOptionsPopup.vue` — PDF 选项
- `ExternalRefUploadPopup.vue` — 外部参照上传
- `SaveAsSheet` — 另存为

### 常见错误

```typescript
// ❌ 错误 — 只设置 innerShow，不 emit
function handleClose() {
  innerShow.value = false;
  // 父组件的 ref 不会更新！
}

// ✅ 正确 — watch 会自动同步
watch(innerShow, (val) => { emit('update:show', val); });
```
