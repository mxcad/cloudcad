<script setup lang="ts">
/**
 * 重命名底部弹窗（A-04 / B-16）。
 *
 * keepExtension=true 时保留原扩展名（输入框只显示主名，扩展名静态展示），
 * 确认前走 validateName（A-24 共享校验）。
 */
import { ref, watch, computed } from 'vue'
import { showFailToast } from 'vant'
import { t } from '@/languages'
import { validateName } from '@/utils/validateName'

const props = withDefaults(
  defineProps<{
    show: boolean
    initialName: string
    keepExtension?: boolean
  }>(),
  {
    keepExtension: false,
  }
)

const emit = defineEmits<{
  'update:show': [val: boolean]
  confirm: [name: string]
}>()

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const name = ref('')

const ext = computed(() => {
  if (!props.keepExtension) return ''
  const dot = props.initialName.lastIndexOf('.')
  return dot > 0 ? props.initialName.slice(dot) : ''
})

const baseName = computed(() => {
  if (!props.keepExtension) return props.initialName
  const dot = props.initialName.lastIndexOf('.')
  return dot > 0 ? props.initialName.slice(0, dot) : props.initialName
})

watch(
  () => props.show,
  (val) => {
    if (val) name.value = baseName.value
  }
)

function onConfirm() {
  const finalName = name.value.trim() + ext.value
  const validation = validateName(finalName)
  if (!validation.valid) {
    showFailToast(validation.error ?? t('名称无效'))
    return
  }
  if (finalName === props.initialName) {
    show.value = false
    return
  }
  emit('confirm', finalName)
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '35%' }">
    <div class="rename-panel">
      <div class="rename-header">
        <button class="rename-cancel" @click="show = false">{{ t('取消') }}</button>
        <span class="rename-title">{{ t('重命名') }}</span>
        <button class="rename-ok" @click="onConfirm">{{ t('确定') }}</button>
      </div>
      <van-field
        v-model="name"
        :placeholder="t('请输入名称')"
        maxlength="255"
        clearable
        class="rename-field"
      >
        <template v-if="ext" #suffix>
          <span class="rename-ext">{{ ext }}</span>
        </template>
      </van-field>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.rename-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rename-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.rename-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.rename-cancel {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

.rename-ok {
  border: none;
  background: none;
  color: var(--accent, #00a99e);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px;
}

.rename-field {
  padding: 0 16px;
}

.rename-ext {
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
