import { onUnmounted, ref } from 'vue'

/**
 * 长按手势状态机——唯一出口。
 *
 * 被动 touchstart（.passive）无法 preventDefault，touchend 后浏览器仍派发合成
 * click。长按判定成立后须抑制紧随的那次 click，否则「进多选/弹菜单」会被随后的
 * click 撤销（触摸设备无法进入多选）。各列表/卡片（文件项、项目卡、搜索行、分享行、
 * 库项）长按进多选或弹菜单共用此状态机；阈值、按下守卫、触发回调各异。
 *
 * 用法：模板 `@touchstart.passive="lp.start(item)"` `@touchend="lp.cancel"`
 * `@touchmove="lp.cancel"`，click/tap 处理函数开头 `if (lp.shouldSuppressTap()) return`。
 */
export function useLongPress<T>(options: {
  /** 长按判定毫秒数（默认 500；LibraryPanel 用 800 防误触） */
  threshold?: number
  /** 按下时守卫：返回 false 则不启动计时（如已在多选态、目标是文件夹） */
  onStart?: (item: T) => boolean
  /** 长按判定成立时回调（进多选 / 弹菜单 / 震动等，各端自带） */
  onTrigger: (item: T) => void
}) {
  const threshold = options.threshold ?? 500
  const triggered = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function start(item: T) {
    if (options.onStart && !options.onStart(item)) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    triggered.value = false
    timer = setTimeout(() => {
      triggered.value = true
      options.onTrigger(item)
    }, threshold)
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * tap 守卫：只抑制长按后紧随的那次合成 click（消费后复位）。
   * @returns true 表示本次 tap 应被抑制（调用方应 return）。
   */
  function shouldSuppressTap(): boolean {
    if (triggered.value) {
      triggered.value = false
      return true
    }
    return false
  }

  onUnmounted(cancel)

  return { start, cancel, shouldSuppressTap }
}
