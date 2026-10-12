/**
 * 滚动触底判定（列表「上拉加载更多」的滚动阈值，单一事实源）。
 * 此前 4 处（ShareManagePage / UnifiedFileList / FileBrowserPage×2）各自内联
 * `scrollTop + clientHeight >= scrollHeight - 100`，阈值魔法数散落；收敛到此处，
 * 改阈值只动一处。纯函数：吃滚动元素几何量，不读 DOM，便于单测。
 */
export const SCROLL_LOAD_MORE_THRESHOLD = 100

export function isNearScrollBottom(
  el: { scrollTop: number; clientHeight: number; scrollHeight: number },
  threshold: number = SCROLL_LOAD_MORE_THRESHOLD,
): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
}
