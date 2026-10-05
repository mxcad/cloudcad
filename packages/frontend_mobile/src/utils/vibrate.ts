/**
 * 触觉反馈（震动）的唯一出口（移动端）。
 *
 * `navigator.vibrate` 只在设备支持震动且页面有焦点时可用：桌面浏览器、所有
 * iOS Safari、以及部分 Android 浏览器一律整体缺失或恒返回 false。
 * 缺失时直接调用抛的是 TypeError，不是 SecurityError，故必须先特性检测。
 *
 * 特性检测只存在于本文件；调用侧禁止各自写 `if (navigator.vibrate)`。
 * 实例：该内联判定曾散在 3 个文件 4 个调用点。
 */

/** 触发震动；设备不支持时静默 no-op —— 震动是锦上添花，不能成为报错源 */
export function vibrate(pattern: number | number[] = 10): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}
