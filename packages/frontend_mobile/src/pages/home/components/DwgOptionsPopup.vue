<script setup lang="ts">
import { ref, computed } from 'vue'
import { t } from '@/languages'
import FloatingPopup from "../../../components/FloatingPopup.vue"

const props = defineProps<{
  format: 'dwg' | 'dxf'
}>()

const emit = defineEmits<{
  confirm: [dwgVersion: number]
  cancel: []
}>()

const show = ref(true)

const VERSIONS = [
  { label: 'CAD 2000', value: 23 },
  { label: 'CAD 2004', value: 25 },
  { label: 'CAD 2007', value: 27 },
  { label: 'CAD 2010', value: 29 },
  { label: 'CAD 2018', value: 33 },
]

const selectedVersion = ref(23)

const title = computed(() =>
  props.format === 'dwg' ? '导出 DWG' : '导出 DXF'
)

function onConfirm() {
  show.value = false
  emit('confirm', selectedVersion.value)
}


</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="title"
    @close="emit('cancel')"
  >
    <label class="input-label">AutoCAD 版本</label>
    <div class="version-list">
      <button
        v-for="v in VERSIONS"
        :key="v.value"
        :class="['version-item', { active: selectedVersion === v.value }]"
        @click="selectedVersion = v.value"
      >
        <span class="version-name">{{ v.label }}</span>
        <van-icon
          v-if="selectedVersion === v.value"
          name="success"
          color="var(--primary)"
        />
      </button>
    </div>
      <template #footer>
    <div class="container-footer">
      <van-button type="primary" size="large" @click="onConfirm">
        {{ t('确认') }}
      </van-button>
    </div>
  </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.input-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin-bottom: var(--space-md);
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 48px;
  padding: 0 var(--space-lg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  font-size: var(--font-size-body);
  color: var(--text-primary);
  transition: all 0.2s;

  &.active {
    border-color: var(--primary);
    background: var(--primary-light);
    color: var(--primary);
    font-weight: 600;
  }
}

.version-name {
  font-size: var(--font-size-body);
}
</style>
