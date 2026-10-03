/**
 * 粘贴环防护（对齐 PC useFileBrowserActions doPaste 的 D2 防护）。
 *
 * 粘贴目标（当前文件夹）位于某剪贴板项的子树内时剔除该项——目标面包屑链上
 * 任一节点即该目标的祖先，故「剪贴板项 id ∈ 祖先链」等价于「目标是该项后代」。
 * 把项移动/复制到自身后代会成环，后端恒拒；客户端先剔除，避免批量请求被
 * 该项拖成部分失败（其余项本可成功）。
 *
 * 注：PC 的「父子去重」（剪贴板同含父目录与子节点只留父）不移植——移动端多选
 * 是单视图（全选=当前已加载页），剪贴板恒来自同一次选择，不可能同含父子节点。
 */
export function filterPasteCycleItems(itemIds: string[], ancestorIds: string[]): string[] {
  const ancestors = new Set(ancestorIds)
  return itemIds.filter((id) => !ancestors.has(id))
}
