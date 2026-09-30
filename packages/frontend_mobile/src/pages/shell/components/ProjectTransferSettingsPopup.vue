<script setup lang="ts">
/**
 * 跨项目转移设置底部弹窗（对齐 PC ProjectModal「跨项目转移」区块：出向/入向 6 域 × 四态）。
 *
 * 选择即保存：点行弹 action-sheet 选模式，确认后整对象 PUT transfer-settings
 *（对齐 PC useTransferSettings 语义，无独立提交按钮）；失败回滚本地值。
 * 四态与 6 域文案对齐 PC：禁止/仅复制/仅移动/复制+移动。
 */
import { ref, watch, computed } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import { projectControllerUpdateTransferSettings } from '@cloudcad/api-sdk/sdk.gen'
import type { CrossProjectTransferModeEnum } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'

type SettingsKey =
  | 'transferOutToProject'
  | 'transferOutToPersonalSpace'
  | 'transferOutToLibrary'
  | 'transferInFromProject'
  | 'transferInFromPersonalSpace'
  | 'transferInFromLibrary'

type SettingsMap = Record<SettingsKey, CrossProjectTransferModeEnum>

const props = defineProps<{
  show: boolean
  projectId: string
  /** 当前值（ProjectDto 的 6 个转移字段；缺省按禁止处理） */
  settings: Partial<SettingsMap>
}>()

const emit = defineEmits<{
  'update:show': [val: boolean]
  /** 保存成功后回传最新 6 域值（页面据此更新 ProjectDto 本地缓存） */
  saved: [settings: SettingsMap]
}>()

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const DEFAULTS: SettingsMap = {
  transferOutToProject: 'NONE',
  transferOutToPersonalSpace: 'NONE',
  transferOutToLibrary: 'NONE',
  transferInFromProject: 'NONE',
  transferInFromPersonalSpace: 'NONE',
  transferInFromLibrary: 'NONE',
}

// 本地可编辑副本：打开时从 props 初始化（undefined 统一按禁止）
const values = ref<SettingsMap>({ ...DEFAULTS })

watch(
  () => props.show,
  (val) => {
    if (val) {
      values.value = {
        transferOutToProject: props.settings.transferOutToProject ?? 'NONE',
        transferOutToPersonalSpace: props.settings.transferOutToPersonalSpace ?? 'NONE',
        transferOutToLibrary: props.settings.transferOutToLibrary ?? 'NONE',
        transferInFromProject: props.settings.transferInFromProject ?? 'NONE',
        transferInFromPersonalSpace: props.settings.transferInFromPersonalSpace ?? 'NONE',
        transferInFromLibrary: props.settings.transferInFromLibrary ?? 'NONE',
      }
    }
  }
)

// 四态选项（action-sheet 用 name 展示，value 作跨语言稳定判别符）
const modeOptions = [
  { name: t('禁止'), value: 'NONE' as const },
  { name: t('仅复制'), value: 'COPY_ONLY' as const },
  { name: t('仅移动'), value: 'MOVE_ONLY' as const },
  { name: t('复制+移动'), value: 'ALL' as const },
]

const modeLabels: Record<CrossProjectTransferModeEnum, string> = {
  NONE: t('禁止'),
  COPY_ONLY: t('仅复制'),
  MOVE_ONLY: t('仅移动'),
  ALL: t('复制+移动'),
}

const outItems: Array<{ key: SettingsKey; label: string }> = [
  { key: 'transferOutToProject', label: t('移出到其他项目') },
  { key: 'transferOutToPersonalSpace', label: t('移出到个人空间') },
  { key: 'transferOutToLibrary', label: t('移出到公共库') },
]

const inItems: Array<{ key: SettingsKey; label: string }> = [
  { key: 'transferInFromProject', label: t('从其他项目移入') },
  { key: 'transferInFromPersonalSpace', label: t('从个人空间移入') },
  { key: 'transferInFromLibrary', label: t('从公共库移入') },
]

const targetKey = ref<SettingsKey | null>(null)
const showModeSheet = ref(false)

function openModeSheet(key: SettingsKey) {
  targetKey.value = key
  showModeSheet.value = true
}

async function onModeSelect(action: { name: string; value?: string }) {
  showModeSheet.value = false
  const key = targetKey.value
  targetKey.value = null
  if (!key) return
  const mode = action.value as CrossProjectTransferModeEnum | undefined
  if (!mode || mode === values.value[key]) return
  const prev = values.value[key]
  values.value[key] = mode
  try {
    const res = await projectControllerUpdateTransferSettings({
      path: { projectId: props.projectId },
      body: { ...values.value },
    })
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('保存成功'))
    emit('saved', { ...values.value })
  } catch (e) {
    // 失败回滚，保持 UI 与服务器一致
    values.value[key] = prev
    showFailToast(e instanceof Error ? e.message : t('保存失败'))
  }
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '60%' }">
    <div class="transfer-panel">
      <div class="panel-header">
        <button class="panel-cancel" @click="show = false">{{ t('取消') }}</button>
        <span class="panel-title">{{ t('跨项目转移') }}</span>
        <span></span>
      </div>
      <div class="transfer-body">
        <div class="transfer-group">
          <div class="transfer-group-title">{{ t('出向') }}</div>
          <div
            v-for="item in outItems"
            :key="item.key"
            class="transfer-row"
            @click="openModeSheet(item.key)"
          >
            <span class="transfer-label">{{ item.label }}</span>
            <span class="transfer-value">
              {{ modeLabels[values[item.key]] }}
              <van-icon name="arrow" size="12" />
            </span>
          </div>
        </div>
        <div class="transfer-group">
          <div class="transfer-group-title">{{ t('入向') }}</div>
          <div
            v-for="item in inItems"
            :key="item.key"
            class="transfer-row"
            @click="openModeSheet(item.key)"
          >
            <span class="transfer-label">{{ item.label }}</span>
            <span class="transfer-value">
              {{ modeLabels[values[item.key]] }}
              <van-icon name="arrow" size="12" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </van-popup>

  <!-- 四态选择（选择即保存） -->
  <van-action-sheet
    v-model:show="showModeSheet"
    :actions="modeOptions"
    @select="onModeSelect"
  />
</template>

<style scoped lang="scss">
.transfer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-cancel {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

.transfer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-group {
  border: 1px solid var(--divider);
  border-radius: 10px;
  overflow: hidden;
}

.transfer-group-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.transfer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);

  & + .transfer-row {
    border-top: 0.5px solid var(--divider);
  }

  &:active {
    opacity: 0.75;
  }
}

.transfer-label {
  font-size: 13px;
  color: var(--text-primary);
}

.transfer-value {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--accent, #00a99e);
}
</style>
