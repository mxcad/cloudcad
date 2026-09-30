<script setup lang="ts">
/**
 * 编辑项目底部弹窗（对齐 PC ProjectModal 编辑模式：名称 + 描述）。
 *
 * 名称走 validateName 共享校验（A-24）；长度对齐后端 @Length(1,100)/@Length(0,500)。
 * 组件只管表单状态，确认后的 API 调用由页面接 useProjectActions.update。
 */
import { ref, watch, computed } from 'vue'
import { showFailToast } from 'vant'
import { t } from '@/languages'
import { validateName } from '@/utils/validateName'

const props = withDefaults(
  defineProps<{
    show: boolean
    initialName: string
    initialDescription?: string
  }>(),
  {
    initialDescription: '',
  }
)

const emit = defineEmits<{
  'update:show': [val: boolean]
  confirm: [payload: { name: string; description: string }]
}>()

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const name = ref('')
const description = ref('')

watch(
  () => props.show,
  (val) => {
    if (val) {
      name.value = props.initialName
      description.value = props.initialDescription
    }
  }
)

function onConfirm() {
  const trimmed = name.value.trim()
  const validation = validateName(trimmed)
  if (!validation.valid) {
    showFailToast(validation.error ?? t('名称无效'))
    return
  }
  emit('confirm', { name: trimmed, description: description.value.trim() })
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '45%' }">
    <div class="edit-panel">
      <div class="edit-header">
        <button class="edit-cancel" @click="show = false">{{ t('取消') }}</button>
        <span class="edit-title">{{ t('编辑项目') }}</span>
        <button class="edit-ok" @click="onConfirm">{{ t('确定') }}</button>
      </div>
      <div class="edit-fields">
        <van-field
          v-model="name"
          :placeholder="t('请输入项目名称')"
          maxlength="100"
          clearable
        />
        <van-field
          v-model="description"
          type="textarea"
          rows="3"
          autosize
          :placeholder="t('请输入项目描述')"
          maxlength="500"
          show-word-limit
        />
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.edit-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.edit-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.edit-cancel {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

.edit-ok {
  border: none;
  background: none;
  color: var(--accent, #00a99e);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px;
}

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 16px;
  flex: 1;
  overflow-y: auto;
}
</style>
