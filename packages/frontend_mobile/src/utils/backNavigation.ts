/**
 * 移动端子页「返回」的唯一出口。
 *
 * 六个子页（文件/项目详情/分享/我的/项目角色/会员中心）的 nav bar 左箭头都指向
 * 上一页。但两类场景下 `router.back()` 是空操作（按钮在，点了没有任何反应，
 * 用户永远停在当前页）：
 *
 * 1. PC → 移动端自动跳转用 `window.location.replace` 替换当前条目而不新增历史记录
 *    （见 PC 端 `utils/mobileRedirect.ts` 的 performMobileRedirectIfNeeded），
 *    进入移动端的第一条历史记录就是当前子页本身；
 * 2. 深链直开子页（如分享链接直接打开项目角色页）：vue-router 初始导航会
 *    `push()` 一条与当前 URL 相同的重复记录；未登录时守卫再 `push()` 登录页、
 *    登录成功 `replace()` 回原深链——历史里前一条记录与当前 URL 完全相同。
 *
 * 所以判定标准不是 history.length，而是「前一条记录是不是另一个页面」：
 * 前一条记录缺失（location.replace 流）或与当前 URL 相同（深链重复记录/登录
 * 中转）时，「返回」的语义就是回到编辑器壳根，直接 replace 到 fallback。
 * 用 replace 而不是 push：不在历史里多留一条，手机物理返回键也不会退回到刚关掉的
 * 子页造成来回抖动。
 */
import type { Router } from 'vue-router'

/** vue-router 写入 history.state 的形状（见 vue-router 源码 buildState） */
interface HistoryState {
  back: string | null
  current: string
  forward: string | null
  replaced: boolean
  position: number
}

export function backOrFallback(router: Router, fallbackPath: string): void {
  const state = window.history.state as HistoryState | null
  // 前一条记录缺失，或与当前 URL 相同（back() 视觉无反应）→ 落 fallback
  if (state == null || state.back == null || state.back === state.current) {
    void router.replace(fallbackPath)
    return
  }
  router.back()
}
