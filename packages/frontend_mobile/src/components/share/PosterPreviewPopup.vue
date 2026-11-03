<script setup lang="ts">
/**
 * 分享图片预览抽屉（统一实现，ShareManagePage C-36 弹窗形态为基准）。
 *
 * ShareCurrentPopup（分享当前图纸）与 ShareManagePage（分享管理）共用本组件，
 * 两处不再各写一套海报预览——业务（出图/合成/下载）留在各自父组件，
 * 本组件只做 UI 壳：顶栏（关闭/标题/下载，固定不随滚动消失）+ 海报预览 +
 * 指定区域 + 海报选项（版式/底部名称/二维码大小）。
 *
 * 版式选择在组件内部弹层管理，确认后 emit('update:layout')，父组件据此重合成。
 * 输入框背景/文字用 app 主题变量（bg-elevated/text-primary，深浅色自适应），
 * 不再硬编码 var(--van-white) 背景——修复深色下「白底白字」。
 */
import { ref, computed } from 'vue'
import { SHARE_POSTER_DEFAULT_LAYOUT, type SharePosterLayout } from '@cloudcad/platform'
import { t } from '@/languages'

const props = defineProps<{
  show: boolean
  /** 已合成海报 dataURL（空串=生成失败占位） */
  dataUrl: string
  /** 文件名：下载命名 + 底部名称占位 */
  fileName: string
  /** 底部名称（v-model，清空即不显示） */
  footerName: string
  /** 二维码大小倍数（v-model） */
  qrScale: number
  /** 版式（v-model） */
  layout: SharePosterLayout
  /** 下载进行中（禁用下载按钮） */
  downloading?: boolean
  /** 出图/重合成进行中（禁用下载与指定区域） */
  generating?: boolean
  /** 指定区域框选进行中 */
  pickingRegion?: boolean
  /** 是否已按选定区域生成（显示「已按选定区域生成」+「重新指定区域」文案） */
  regionActive?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'update:footerName', v: string): void
  (e: 'update:qrScale', v: number): void
  (e: 'update:layout', v: SharePosterLayout): void
  (e: 'download'): void
  (e: 'pick-region'): void
}>()

// ── 版式（手机竖版/正方形/横版）：与 PC 一致三档，预览内调整（改动即重合成预览）──
const showLayoutPicker = ref(false)
const layoutColumns = computed(() => [
  { text: t('手机竖版'), value: 'phone' },
  { text: t('正方形'), value: 'square' },
  { text: t('横版'), value: 'landscape' },
])
const layoutLabel = computed(() => {
  const found = layoutColumns.value.find((c) => c.value === props.layout)
  return found?.text ?? t('手机竖版')
})
function onLayoutConfirm({
  selectedOptions,
}: {
  selectedOptions: Array<{ value: string }>
}) {
  const next = selectedOptions[0]?.value as SharePosterLayout | undefined
  if (next) emit('update:layout', next)
  showLayoutPicker.value = false
}

// v-model 桥接：值来自 props，变更 emit 回父组件（父更新自身 ref 并触发重合成）
const footerNameModel = computed({
  get: () => props.footerName,
  set: (v: string) => emit('update:footerName', v),
})
const qrScaleModel = computed({
  get: () => props.qrScale,
  set: (v: number) => emit('update:qrScale', v),
})
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="ppp-panel">
      <!-- 顶栏：关闭/标题/下载——固定，不随海报内容滚动消失 -->
      <div class="ppp-header">
        <button class="ppp-header-btn" @click="emit('update:show', false)">
          {{ t('关闭') }}
        </button>
        <span class="ppp-title">{{ t('分享图片') }}</span>
        <button
          class="ppp-header-btn ppp-header-btn--primary"
          :disabled="downloading || !dataUrl"
          @click="emit('download')"
        >
          {{ downloading ? t('下载中...') : t('下载') }}
        </button>
      </div>

      <div class="ppp-body">
        <img v-if="dataUrl" class="ppp-img" :src="dataUrl" :alt="t('分享图片预览')" />
        <div v-else class="ppp-fallback">{{ t('预览分享图片失败') }}</div>

        <div v-if="dataUrl" class="ppp-region-row">
          <button
            class="ppp-region-btn"
            :disabled="generating || pickingRegion"
            @click="emit('pick-region')"
          >
            <van-icon name="photograph" size="16" />
            <span>{{ regionActive ? t('重新指定区域') : t('指定区域') }}</span>
          </button>
          <span v-if="regionActive" class="ppp-region-hint">{{ t('已按选定区域生成') }}</span>
        </div>

        <div v-if="dataUrl" class="ppp-opts">
          <div class="ppp-opts-row">
            <span class="ppp-opts-label">{{ t('版式') }}</span>
            <button class="ppp-opts-layout" @click="showLayoutPicker = true">
              <span>{{ layoutLabel }}</span>
              <van-icon name="arrow-down" size="12" />
            </button>
          </div>
          <div class="ppp-opts-row">
            <span class="ppp-opts-label">{{ t('底部名称') }}</span>
            <input
              v-model="footerNameModel"
              class="ppp-opts-input"
              :placeholder="fileName"
              maxlength="60"
            />
          </div>
          <div class="ppp-opts-row">
            <span class="ppp-opts-label">{{ t('二维码大小') }}</span>
            <input
              v-model.number="qrScaleModel"
              type="range"
              class="ppp-opts-range"
              min="0.5"
              max="2"
              step="0.1"
            />
            <span class="ppp-opts-value">{{ Math.round(qrScale * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 版式选择（手机竖版/正方形/横版）底部弹层：改动即重合成预览 -->
    <van-popup v-model:show="showLayoutPicker" position="bottom" round>
      <van-picker
        :columns="layoutColumns"
        @confirm="onLayoutConfirm"
        @cancel="showLayoutPicker = false"
      />
    </van-popup>
  </van-popup>
</template>

<style scoped lang="scss">
.ppp-panel {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  /* 滚动交由 ppp-body；panel 自身不滚动，保证顶栏 sticky 有效 */
  overflow: hidden;
  box-sizing: border-box;
}

/* 顶栏：固定（body 滚动时关闭/下载始终可见） */
.ppp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 12px 16px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated, var(--van-popup-background, #fff));
  border-bottom: 1px solid var(--border-color, var(--van-border-color));
}

.ppp-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--van-text-color));
}

.ppp-header-btn {
  min-width: 48px;
  padding: 4px 0;
  font-size: 14px;
  color: var(--text-primary, var(--van-text-color));
  background: transparent;
  border: none;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.ppp-header-btn--primary {
  color: var(--accent);
  font-weight: 600;
  text-align: right;
}

.ppp-body {
  overflow-y: auto;
  padding: 0 16px 16px;
}

.ppp-img {
  display: block;
  width: 100%;
  max-height: 52vh;
  object-fit: contain;
  border-radius: 8px;
  background: #000;
  margin: 12px 0 8px;
}

.ppp-fallback {
  padding: 24px 0;
  font-size: 13px;
  color: var(--text-tertiary, var(--van-text-color-2));
}

.ppp-region-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 0 12px;
}

.ppp-region-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  line-height: 1.4;

  &:disabled {
    opacity: 0.6;
  }
}

.ppp-region-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}

.ppp-opts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-color, var(--van-border-color));
  border-radius: 8px;
  background: var(--bg-elevated, var(--van-background-2));
  box-sizing: border-box;
}

.ppp-opts-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ppp-opts-label {
  flex-shrink: 0;
  width: 96px;
  font-size: 14px;
  color: var(--text-primary, var(--van-text-color));
}

/* 输入框/版式按钮：主题自适应背景+文字（与页面其他输入框一致），
   不再硬编码 var(--van-white) 背景——修复深色下「白底白字」 */
.ppp-opts-input,
.ppp-opts-layout {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color, var(--van-border-color));
  border-radius: 6px;
  background: var(--bg-elevated, var(--van-popup-background, #fff));
  color: var(--text-primary, var(--van-text-color));
  font-size: 14px;
  box-sizing: border-box;
}

.ppp-opts-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: pointer;
}

.ppp-opts-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}

.ppp-opts-value {
  flex-shrink: 0;
  width: 46px;
  text-align: right;
  font-size: 13px;
  color: var(--text-tertiary, var(--van-text-color-2));
}
</style>
