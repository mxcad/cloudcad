<script setup lang="ts">
/**
 * 下载格式转换弹窗（A-06）—— 底部弹窗选格式 + DWG 版本 / PDF 纸张与色彩。
 *
 * 对齐 PC DownloadFormatModal 字段（dwg/dxf/pdf/mxweb + dwgVersion + PDF width/height/colorPolicy），
 * 移动端底部弹窗形态。确认后 emit confirm，由父页调 downloadControllerDownloadNodeWithFormat（blob）。
 */
import { ref, watch } from 'vue'
import { t } from '@/languages'

export type DownloadFormat = 'dwg' | 'dxf' | 'pdf' | 'mxweb'

export interface DownloadFormatPayload {
  format: DownloadFormat
  pdfOptions?: { width: string; height: string; colorPolicy: 'mono' | 'color' }
  dwgOptions?: { dwgVersion: number }
}

const props = defineProps<{ show: boolean; fileName: string }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [payload: DownloadFormatPayload]
}>()

const format = ref<DownloadFormat>('mxweb')
const dwgVersion = ref(23)
const pdfWidth = ref('2000')
const pdfHeight = ref('2000')
const pdfColor = ref<'mono' | 'color'>('mono')

const formatOptions: Array<{ key: DownloadFormat; label: string }> = [
  { key: 'mxweb', label: t('MXWEB（原格式）') },
  { key: 'dwg', label: t('DWG') },
  { key: 'dxf', label: t('DXF') },
  { key: 'pdf', label: t('PDF') },
]

const dwgVersionOptions = [
  { value: 23, label: t('CAD 2000（默认）') },
  { value: 25, label: t('CAD 2004') },
  { value: 27, label: t('CAD 2007') },
  { value: 29, label: t('CAD 2010') },
  { value: 33, label: t('CAD 2018') },
]

// 每次打开重置默认值（对齐 PC handleClose）
watch(
  () => props.show,
  (v) => {
    if (v) {
      format.value = 'mxweb'
      dwgVersion.value = 23
      pdfWidth.value = '2000'
      pdfHeight.value = '2000'
      pdfColor.value = 'mono'
    }
  }
)

function onConfirm() {
  if (format.value === 'pdf') {
    emit('confirm', {
      format: 'pdf',
      pdfOptions: { width: pdfWidth.value, height: pdfHeight.value, colorPolicy: pdfColor.value },
    })
  } else if (format.value === 'dwg' || format.value === 'dxf') {
    emit('confirm', { format: format.value, dwgOptions: { dwgVersion: dwgVersion.value } })
  } else {
    emit('confirm', { format: 'mxweb' })
  }
  emit('update:show', false)
}
</script>

<template>
  <van-popup v-model:show="props.show" position="bottom" round @update:show="emit('update:show', $event)">
    <div class="df-panel">
      <div class="panel-header">
        <span class="panel-title">{{ t('选择下载格式') }}</span>
        <button class="panel-close" @click="emit('update:show', false)">
          <van-icon name="cross" size="18" />
        </button>
      </div>

      <div class="df-file">
        <span class="df-file-label">{{ t('文件：') }}</span>
        <span class="df-file-name">{{ fileName }}</span>
      </div>

      <div class="df-section">
        <div class="df-section-title">{{ t('格式') }}</div>
        <div class="df-chips">
          <button
            v-for="opt in formatOptions"
            :key="opt.key"
            :class="['df-chip', { active: format === opt.key }]"
            @click="format = opt.key"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="format === 'dwg' || format === 'dxf'" class="df-section">
        <div class="df-section-title">{{ t('DWG 版本') }}</div>
        <div class="df-chips">
          <button
            v-for="opt in dwgVersionOptions"
            :key="opt.value"
            :class="['df-chip', { active: dwgVersion === opt.value }]"
            @click="dwgVersion = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="format === 'pdf'" class="df-section">
        <div class="df-section-title">{{ t('PDF 纸张（宽 × 高）') }}</div>
        <div class="df-pdf-size">
          <input v-model="pdfWidth" class="df-input" type="text" inputmode="numeric" :placeholder="t('宽')" />
          <span class="df-x">×</span>
          <input v-model="pdfHeight" class="df-input" type="text" inputmode="numeric" :placeholder="t('高')" />
        </div>
        <div class="df-section-title">{{ t('色彩') }}</div>
        <div class="df-chips">
          <button :class="['df-chip', { active: pdfColor === 'mono' }]" @click="pdfColor = 'mono'">
            {{ t('黑白') }}
          </button>
          <button :class="['df-chip', { active: pdfColor === 'color' }]" @click="pdfColor = 'color'">
            {{ t('彩色') }}
          </button>
        </div>
      </div>

      <button class="df-confirm" @click="onConfirm">
        <van-icon name="down" size="14" />
        {{ t('下载') }}
      </button>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.df-panel {
  padding: 16px;
  box-sizing: border-box;
  max-height: 80vh;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 12px;
  border-bottom: 0.5px solid var(--divider);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-close {
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
}

.df-file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-secondary);
  margin-bottom: 8px;
}

.df-file-label {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.df-file-name {
  font-size: 13px;
  color: var(--text-primary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.df-section {
  padding: 10px 0;
}

.df-section-title {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.df-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.df-chip {
  padding: 7px 14px;
  border: 1px solid var(--divider);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  &:active {
    opacity: 0.8;
  }
}

.df-pdf-size {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.df-input {
  width: 90px;
  padding: 8px 10px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}

.df-x {
  color: var(--text-tertiary);
  font-size: 14px;
}

.df-confirm {
  margin-top: 16px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;

  &:active {
    opacity: 0.85;
  }
}
</style>
