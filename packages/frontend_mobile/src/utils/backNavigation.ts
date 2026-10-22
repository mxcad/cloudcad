/**
 * 移动端子页「返回」的唯一出口。
 *
 * 六个子页（文件/项目详情/分享/我的/项目角色/会员中心）的 nav bar 左箭头都指向
 * 上一页。但当用户进入移动端的第一条历史记录本身就是某个子页时——最典型是 PC →
 * 移动端自动跳转，它用 `window.location.replace` 替换当前条目而不新增历史记录
 * （见 PC 端 `utils/mobileRedirect.ts` 的 performMobileRedirectIfNeeded）——
 * `router.back()` 是空操作：按钮在，点了没有任何反应。
 *
 * 这时「返回」的语义就是回到编辑器壳根，所以退不动时直接 replace 到 fallback。
 * 用 replace 而不是 push：不在历史里多留一条，手机物理返回键也不会退回到刚关掉的
 * 子页造成来回抖动。
 */
import type { Router } from 'vue-router'

export function backOrFallback(router: Router, fallbackPath: string): void {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.replace(fallbackPath)
}
