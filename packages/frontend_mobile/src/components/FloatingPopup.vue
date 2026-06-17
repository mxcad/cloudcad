<template>
  <Teleport to="body">
    <template v-if="renderNow">
      <div
        v-show="innerShow"
        class="van-overlay"
        :class="overlayClass"
        :style="overlayStyleComputed"
        @click="onOverlayClick"
      />
      <div
        v-show="innerShow"
        ref="rootRef"
        class="van-floating-popup"
        :class="{
          'van-floating-popup--round': round,
          'van-safe-area-bottom': safeAreaInsetBottom,
        }"
        :style="popupStyle"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <div v-if="title || $slots.header || $slots.headerLeft || closeable" ref="headerRef" class="van-floating-popup__header">
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

        <div v-if="$slots.footer" ref="footerRef" class="van-floating-popup__footer" :class="{ 'van-floating-popup__footer--hidden': footerHidden }">
          <slot name="footer" />
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  show?: boolean
  title?: string
  headerLeftText?: string
  closeable?: boolean
  anchors?: number[]
  fixedHeight?: boolean
  duration?: number | string
  magnetic?: boolean
  draggable?: boolean
  contentDraggable?: boolean
  lazyRender?: boolean
  closeOnPopstate?: boolean
  closeOnClickOverlay?: boolean
  beforeClose?: (...args: any[]) => boolean | Promise<boolean> | void
  overlayClass?: string | Record<string, boolean>
  overlayStyle?: Record<string, any>
  round?: boolean
  domMagic?: boolean
  teleport?: string | Record<string, any>
  zIndex?: number | string
  safeAreaInsetBottom?: boolean
  overlay?: boolean
  lockScroll?: boolean
}>(), {
  show: false,
  closeable: true,
  anchors: () => [0.6, 0.9],
  fixedHeight: false,
  duration: 0.2,
  magnetic: true,
  draggable: true,
  contentDraggable: true,
  lazyRender: true,
  closeOnClickOverlay: true,
  round: true,
  domMagic: true,
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
  (e: 'position-change', pos: { y: number }): void
}>()

const innerShow = ref(false)
const rootRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const headerRef = ref<HTMLElement>()
const footerRef = ref<HTMLElement>()
const currentVisible = ref(0)
const dragging = ref(false)
const windowHeight = ref(window.innerHeight)
const footerHidden = ref(false)
const renderNow = ref(false)

let startY = 0
let maxScroll = -1
let touchStartY = 0
let touchDeltaY = 0

const realAnchors = computed(() =>
  props.anchors.map(a => (a <= 1 ? Math.round(windowHeight.value * a) : a))
)

const boundary = computed(() => ({
  min: realAnchors.value[0] ?? 100,
  max: realAnchors.value[realAnchors.value.length - 1] ?? Math.round(windowHeight.value * 0.9),
}))

const anchors = computed(() =>
  props.anchors.length >= 2 ? realAnchors.value : [boundary.value.min, boundary.value.max]
)

const DAMP = 0.2

function ease(value: number) {
  const { min, max } = boundary.value
  if (value > max) return max + (value - max) * DAMP
  if (value < min) return min - (min - value) * DAMP
  return value
}

function closest(arr: number[], target: number) {
  return arr.reduce((pre, cur) => Math.abs(pre - target) < Math.abs(cur - target) ? pre : cur)
}

const popupStyle = computed(() => {
  return {
    height: `${currentVisible.value}px`,
    transition: dragging.value
      ? 'none'
      : `height ${props.duration}s cubic-bezier(0.18, 0.89, 0.32, 1.28)`,
    zIndex: props.zIndex ?? 2005,
  }
})

const overlayStyleComputed = computed(() => ({
  ...(props.overlayStyle || {}),
  zIndex: props.zIndex ? Number(props.zIndex) - 1 : 2004,
  transition: 'opacity 0.3s',
}))

function onTouchStart(event: TouchEvent) {
  if (!props.draggable || props.fixedHeight) return
  const target = event.target as HTMLElement
  const header = headerRef.value
  const inHeader = header?.contains(target)
  const inBar = rootRef.value?.querySelector('.van-floating-popup__bar')?.contains(target)
  const inContent = contentRef.value?.contains(target)

  if (!inHeader && !inBar && !(props.contentDraggable && inContent)) {
    return
  }
  touchStartY = event.touches[0].clientY
  dragging.value = true
  startY = currentVisible.value
  maxScroll = -1
}

function onTouchMove(event: TouchEvent) {
  if (!props.draggable || props.fixedHeight || !dragging.value) return

  touchDeltaY = startY - (event.touches[0].clientY - touchStartY)

  const target = event.target as HTMLElement
  if (contentRef.value && (contentRef.value === target || contentRef.value.contains(target))) {
    const { scrollTop } = contentRef.value
    maxScroll = Math.max(maxScroll, scrollTop)
    if (!props.contentDraggable) return
    if (currentVisible.value < boundary.value.max) {
      event.preventDefault()
    } else if (!(scrollTop <= 0 && touchDeltaY > startY) || maxScroll > 0) {
      return
    }
  }

  currentVisible.value = ease(touchDeltaY)
}

function onTouchEnd() {
  maxScroll = -1
  if (!dragging.value) return
  dragging.value = false
  if (!props.draggable || props.fixedHeight) return
  if (props.magnetic) {
    currentVisible.value = closest(anchors.value, currentVisible.value)
  } else {
    const { min, max } = boundary.value
    currentVisible.value = Math.max(min, Math.min(max, currentVisible.value))
  }
  emit('position-change', { y: currentVisible.value })
}

async function handleClose() {
  if (props.beforeClose) {
    const result = await props.beforeClose()
    if (result === false) return
  }
  innerShow.value = false
  emit('update:show', false)
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

function handleVisualViewport() {
  if (!props.domMagic || !innerShow.value) return
  const current = window.visualViewport?.height ?? window.innerHeight
  const diff = window.innerHeight - current
  if (diff > 100) {
    footerHidden.value = true
  } else {
    footerHidden.value = false
  }
}

function handleFocusIn(e: FocusEvent) {
  if (!props.domMagic || !innerShow.value) return
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    footerHidden.value = true
  }
}

function handleFocusOut() {
  if (!props.domMagic) return
  footerHidden.value = false
}

function setAnchorHeight() {
  const h = anchors.value[0] ?? boundary.value.min
  currentVisible.value = Math.max(h, boundary.value.min)
}

function lockBodyScroll(lock: boolean) {
  if (!props.lockScroll) return
  if (lock) {
    document.body.classList.add('van-overflow-hidden')
  } else {
    document.body.classList.remove('van-overflow-hidden')
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleVisualViewport)
  }
  document.addEventListener('focusin', handleFocusIn)
  document.addEventListener('focusout', handleFocusOut)

  if (props.show) {
    renderNow.value = true
    nextTick(() => {
      innerShow.value = true
      setAnchorHeight()
      lockBodyScroll(true)
      emit('open')
      nextTick(() => emit('opened'))
    })
  } else if (!props.lazyRender) {
    renderNow.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', handleVisualViewport)
  }
  document.removeEventListener('focusin', handleFocusIn)
  document.removeEventListener('focusout', handleFocusOut)
  lockBodyScroll(false)
})

watch(() => props.show, (val) => {
  if (val) {
    if (!renderNow.value) {
      renderNow.value = true
      nextTick(() => {
        innerShow.value = true
        setAnchorHeight()
        lockBodyScroll(true)
        emit('open')
        nextTick(() => emit('opened'))
      })
    } else {
      innerShow.value = true
      setAnchorHeight()
      lockBodyScroll(true)
      emit('open')
      nextTick(() => emit('opened'))
    }
  } else {
    lockBodyScroll(false)
    emit('close')
    nextTick(() => emit('closed'))
    innerShow.value = false
  }
})
</script>

<style scoped lang="scss">
:deep(.van-overlay) {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
}

.van-floating-popup {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100vw;
  display: flex;
  flex-direction: column;
  touch-action: none;
  background: var(--van-floating-popup-background, #fff);

  &.van-floating-popup--round {
    border-top-left-radius: var(--van-floating-popup-border-radius, 16px);
    border-top-right-radius: var(--van-floating-popup-border-radius, 16px);
  }

  :deep(.van-floating-popup__header) {
    height: var(--van-floating-popup-header-height, 48px);
    line-height: var(--van-floating-popup-header-height, 48px);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
    padding: var(--van-floating-popup-header-action-padding, 0 16px);
    font-size: var(--van-floating-popup-header-font-size, 16px);
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
    flex-shrink: 0;
  }

  :deep(.van-floating-popup__content) {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
    background-color: var(--van-floating-popup-background, #fff);
  }

  :deep(.van-floating-popup__footer) {
    border-top: 1px solid #f5f5f5;
    padding: 12px 16px;
    flex-shrink: 0;
    background: var(--van-floating-popup-background, #fff);
    transition: transform 0.3s ease, opacity 0.3s ease;
  }

  :deep(.van-floating-popup__footer--hidden) {
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }
}
</style>
