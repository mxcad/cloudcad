<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { showToast } from 'vant'
import FloatingPopup from './FloatingPopup.vue'
import { copyText } from '@/utils/clipboard'
import { t } from '@/languages'

const props = defineProps<{
  show: boolean
  url: string
  title?: string
}>()

const emit = defineEmits<{ 'update:show': [val: boolean] }>()

const innerShow = ref(props.show)
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.show, (val) => {
  innerShow.value = val
})
watch(innerShow, (val) => {
  emit('update:show', val)
})

function selectAll() {
  const input = inputRef.value
  if (!input) return
  input.focus()
  input.select()
}

watch(innerShow, (val) => {
  if (val) nextTick(selectAll)
})

async function handleCopy() {
  const result = await copyText(props.url)
  if (result === 'failed') {
    nextTick(selectAll)
    showToast(t('复制失败，请手动选中链接复制'))
    return
  }
  showToast(t('已复制链接'))
  innerShow.value = false
}
</script>

<template>
  <FloatingPopup
    v-model:show="innerShow"
    :title="title || t('分享链接')"
    :anchors="[300]"
    :draggable="false"
    :magnetic="false"
    :lazy-render="false"
  >
    <input
      ref="inputRef"
      class="link-input"
      :value="url"
      readonly
      :aria-label="t('分享链接')"
    />
    <p class="hint">{{ t('若按钮复制不可用，请手动选中上方链接复制') }}</p>

    <template #footer>
      <van-button type="primary" block round @click="handleCopy">
        {{ t('复制') }}
      </van-button>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.link-input {
  width: 100%;
  box-sizing: border-box;
  height: 40px;
  padding: 0 10px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
