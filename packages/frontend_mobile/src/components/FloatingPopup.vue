<template>
  <van-popup
    v-model:show="innerShow"
    position="bottom"
    :round="round"
    :overlay="overlay"
    :overlay-class="overlayClass"
    :overlay-style="overlayStyle"
    :close-on-click-overlay="false"
    :lock-scroll="lockScroll"
    :lazy-render="lazyRender"
    :teleport="teleport"
    :duration="duration"
    :z-index="zIndex"
    :close-on-popstate="closeOnPopstate"
    :safe-area-inset-bottom="false"
    class="van-floating-popup"
    @open="$emit('open')"
    @close="$emit('close')"
    @opened="$emit('opened')"
    @closed="$emit('closed')"
    @click-overlay="onOverlayClick"
  >
    <div
      ref="rootRef"
      class="van-floating-popup__body"
      :class="{ 'van-safe-area-bottom': safeAreaInsetBottom }"
      :style="bodyStyle"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <div v-if="title || $slots.header || $slots.headerLeft || closeable" class="van-floating-popup__header">
        <div class="van-floating-popup__header-left van-haptics-feedback" @click="$emit('click-header-left')">
          <slot name="header-left">
            <span v-if="headerLeftText">{{ headerLeftText }}</span>
          </slot>
        </div>
        <div class="van-floating-popup__header-title">
          <slot name="title">{{ title }}</slot>
        </div>
        <div class="van-floating-popup__header-action">
          <slot name="header">
            <i
              v-if="closeable"
              class="van-badge__wrapper van-icon van-icon-cross van-floating-popup__header-close van-haptics-feedback"
              @click="handleClose"
            />
          </slot>
        </div>
      </div>

      <slot name="header-after" />

      <div ref="contentRef" class="van-floating-popup__content">
        <slot />
      </div>

      <div v-if="$slots.footer" class="van-floating-popup__footer">
        <slot name="footer" />
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  show?: boolean
  title?: string
  headerLeftText?: string
  closeable?: boolean
  anchors?: number[]
  duration?: number | string
  magnetic?: boolean
  draggable?: boolean
  contentDraggable?: boolean
  lazyRender?: boolean
  closeOnPopstate?: boolean
  closeOnClickOverlay?: boolean
  beforeClose?: (...args: any[]) => boolean | Promise<boolean> | void
  overlayClass?: unknown
  overlayStyle?: Record<string, any>
  round?: boolean
  teleport?: string | Record<string, any>
  zIndex?: number | string
  safeAreaInsetBottom?: boolean
  overlay?: boolean
  lockScroll?: boolean
}>(), {
  show: false,
  closeable: true,
  anchors: () => [],
  duration: 0.3,
  magnetic: true,
  draggable: true,
  contentDraggable: true,
  lazyRender: true,
  closeOnClickOverlay: true,
  round: true,
  safeAreaInsetBottom: true,
  overlay: true,
  lockScroll: true,
  closeOnPopstate: false,
})

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'click-header-left'): void
  (e: 'click-overlay', ev: MouseEvent): void
  (e: 'open'): void
  (e: 'close'): void
  (e: 'opened'): void
  (e: 'closed'): void
}>()

const innerShow = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const rootRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const currentHeight = ref(0)
const dragging = ref(false)
const windowHeight = ref(window.innerHeight)

let startY = 0
let maxScroll = -1
let touchStartY = 0
let touchDeltaY = 0

const realAnchors = computed(() =>
  props.anchors.map(a => (a <= 1 ? Math.round(windowHeight.value * a) : a))
)

const boundary = computed(() => ({
  min: realAnchors.value[0] ?? 100,
  max: realAnchors.value[realAnchors.value.length - 1] ?? Math.round(windowHeight.value * 0.6),
}))

const anchors = computed(() =>
  props.anchors.length >= 2 ? realAnchors.value : [boundary.value.min, boundary.value.max]
)

const DAMP = 0.2

function ease(moveY: number) {
  const abs = Math.abs(moveY)
  const { min, max } = boundary.value
  if (abs > max) return -(max + (abs - max) * DAMP)
  if (abs < min) return -(min - (min - abs) * DAMP)
  return moveY
}

function closest(arr: number[], target: number) {
  return arr.reduce((pre, cur) => Math.abs(pre - target) < Math.abs(cur - target) ? pre : cur)
}

const bodyStyle = computed(() => ({
  height: `${boundary.value.max}px`,
  transform: `translateY(calc(100% - ${currentHeight.value}px))`,
  transition: dragging.value
    ? 'none'
    : `transform ${props.duration}s cubic-bezier(0.18, 0.89, 0.32, 1.28)`,
}))

function resetTouch() {
  touchStartY = 0
  touchDeltaY = 0
}

function onTouchStart(event: TouchEvent) {
  if (!props.draggable) return
  resetTouch()
  touchStartY = event.touches[0].clientY
  dragging.value = true
  startY = -currentHeight.value
  maxScroll = -1
}

function onTouchMove(event: TouchEvent) {
  if (!props.draggable) return

  touchDeltaY = event.touches[0].clientY - touchStartY

  const target = event.target as HTMLElement
  if (contentRef.value && (contentRef.value === target || contentRef.value.contains(target))) {
    const { scrollTop } = contentRef.value
    maxScroll = Math.max(maxScroll, scrollTop)
    if (!props.contentDraggable) return
    if (-startY < boundary.value.max) {
      event.preventDefault()
    } else if (!(scrollTop <= 0 && touchDeltaY > 0) || maxScroll > 0) {
      return
    }
  }

  const moveY = touchDeltaY + startY
  currentHeight.value = -ease(moveY)
}

function onTouchEnd() {
  maxScroll = -1
  if (!dragging.value) return
  dragging.value = false
  if (!props.draggable) return
  if (props.magnetic) {
    currentHeight.value = closest(anchors.value, currentHeight.value)
  } else {
    const { min, max } = boundary.value
    currentHeight.value = Math.max(min, Math.min(max, currentHeight.value))
  }
}

async function handleClose() {
  if (props.beforeClose) {
    const result = await props.beforeClose()
    if (result === false) return
  }
  innerShow.value = false
}

async function onOverlayClick(event: MouseEvent) {
  emit('click-overlay', event)
  if (props.closeOnClickOverlay) {
    await handleClose()
  }
}

function handleResize() {
  windowHeight.value = window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  const el = rootRef.value
  if (el) {
    el.addEventListener('touchmove', onTouchMove, { passive: false })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  const el = rootRef.value
  if (el) {
    el.removeEventListener('touchmove', onTouchMove as any)
  }
})

watch(() => props.show, (val) => {
  if (val) {
    currentHeight.value = anchors.value[0] ?? boundary.value.min
  }
})
</script>

<style scoped lang="scss">
.van-floating-popup__body {
  display: flex;
  flex-direction: column;
  will-change: transform;
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
  background: var(--van-floating-popup-background, #fff);
  overflow: hidden;

  :deep(.van-floating-popup__header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--van-floating-popup-header-height, 48px);
    padding: var(--van-floating-popup-header-action-padding, 0 16px);
    font-size: var(--van-floating-popup-header-font-size, 16px);
    color: var(--van-floating-popup-header-color, #969799);
    flex-shrink: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  :deep(.van-floating-popup__header-left) {
    flex-shrink: 0;
    min-width: 48px;
    font-size: var(--van-floating-popup-header-left-font-size, 14px);
    color: var(--van-floating-popup-header-left-color, #1989fa);
  }

  :deep(.van-floating-popup__header-title) {
    flex: 1;
    text-align: center;
    font-weight: bold;
    font-size: var(--van-floating-popup-header-text-font-size, 16px);
    color: #323233;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.van-floating-popup__header-action) {
    flex-shrink: 0;
    min-width: 48px;
    display: flex;
    justify-content: flex-end;
  }

  :deep(.van-floating-popup__header-close) {
    font-size: var(--van-floating-popup-header-close-icon-size, 22px);
    color: var(--van-floating-popup-header-close-icon-color, #c8c9cc);
    cursor: pointer;
  }

  :deep(.van-floating-popup__content) {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
  }

  :deep(.van-floating-popup__footer) {
    border-top: 1px solid #f5f5f5;
    padding: 12px 16px;
    flex-shrink: 0;
    background: var(--van-floating-popup-background, #fff);
  }
}
</style>

<style>
.van-floating-popup.van-popup--bottom {
  overflow: hidden;
}
</style>
