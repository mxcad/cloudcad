import { useEffect, useState } from 'react';

/** 列表轻量 cap：默认渲染条数上限，「加载更多」每次追加的条数 */
export const LIST_CAP = 50;

/**
 * 下载/上传列表轻量 cap（P2-9）：
 * - 进行中（active）任务恒可见，不受 cap 限制（用户必须能看到进行中的任务）
 * - 其余任务按原顺序保留前 visibleCount 条，超出部分隐藏
 * - 搜索关键字变化时重置 cap（匹配集变化，避免停留在过大的渲染窗口）
 *
 * 非全量虚拟化：仅限制初始渲染量 + 「加载更多」追加，DOM 行数有上界。
 */
export function useCappedList<T>(
  items: T[],
  search: string,
  isActive: (item: T) => boolean
) {
  const [visibleCount, setVisibleCount] = useState(LIST_CAP);

  useEffect(() => {
    setVisibleCount(LIST_CAP);
  }, [search]);

  const visible = items.filter((item, index) => isActive(item) || index < visibleCount);
  const hiddenCount = items.length - visible.length;

  const loadMore = () => setVisibleCount((count) => count + LIST_CAP);

  return { visible, hiddenCount, loadMore };
}
