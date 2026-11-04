///////////////////////////////////////////////////////////////////////////////
// 分享图纸框选区域「直角方形边框」检测 —— 跨端共用（单一事实源）
//
// 用户框选缩略图区域时，若刚好把图纸的矩形边框（图框/表格外框/房间轮廓等）
// 框进去，截图边缘天然是直角边，海报上再叠加圆角描边反而多余；其余情况保留
// 圆角描边。本模块只做纯计算（实体包围盒集合 → 是否四边都有边框），引擎无关，
// PC/移动端各自负责从引擎取实体包围盒后调用。勿两端手写判据。
//
// 注意：本判据只用于「用户框选的子区域」。默认整图框（未选区域、截取整图内容
// 包围盒）不走本判据——整图框天然不需要描边，由调用方直接判定，见各端
// detectRegionBorder 的调用处。
///////////////////////////////////////////////////////////////////////////////

/** 实体/盒子的包围盒（仅用 min/max 角点，引擎无关的最小形状）。 */
export interface RectBox {
  minPt: { x: number; y: number };
  maxPt: { x: number; y: number };
}

/**
 * 判断矩形区域是否被「直角方形边框」围住（纯计算，PC/移动端共用）。
 *
 * 判据：区域四条边的每条边附近（tol 容差内）都至少有一个盒子的边与该边共线、
 * 且该盒子沿边方向有可见长度（> tol，拒绝横跨边线的点状实体），即四条边都有
 * 「边框」。退化区域（宽/高 <= 0）或容差非正返回 false。
 *
 * @param region 框选区域（CAD 世界坐标包围盒，minPt/maxPt 可乱序，内部归一化）
 * @param boxes 实体包围盒集合（调用方从引擎遍历实体获得）
 * @param tol 共线容差（CAD 世界坐标长度；调用方把屏幕视觉误差如 5px 用
 *   mxcad 原生长度换算 `mxcad.mxdraw.viewCoordLong2Cad(5)`（长度转换，非坐标）
 *   换算成 CAD 长度传入，随视图缩放自适应）
 */
export function isRectSurroundedByBorder(
  region: { minPt: { x: number; y: number }; maxPt: { x: number; y: number } },
  boxes: RectBox[],
  tol: number
): boolean {
  const minX = Math.min(region.minPt.x, region.maxPt.x);
  const maxX = Math.max(region.minPt.x, region.maxPt.x);
  const minY = Math.min(region.minPt.y, region.maxPt.y);
  const maxY = Math.max(region.minPt.y, region.maxPt.y);
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) || !(h > 0)) return false;
  if (!(tol > 0)) return false;
  let left = false;
  let right = false;
  let top = false;
  let bottom = false;

  for (const box of boxes) {
    if (left && right && top && bottom) break;
    const exMin = box.minPt.x;
    const exMax = box.maxPt.x;
    const eyMin = box.minPt.y;
    const eyMax = box.maxPt.y;
    // 盒子沿区域边方向的重叠长度（> 容差才有「边框」意义）
    const overlapX = Math.min(exMax, maxX) - Math.max(exMin, minX);
    const overlapY = Math.min(eyMax, maxY) - Math.max(eyMin, minY);
    // 左/右边：盒子 x 边与区域 x 边共线，且沿 y 方向有可见长度
    if (
      !left &&
      Math.min(Math.abs(exMin - minX), Math.abs(exMax - minX)) <= tol &&
      overlapY > tol
    )
      left = true;
    if (
      !right &&
      Math.min(Math.abs(exMin - maxX), Math.abs(exMax - maxX)) <= tol &&
      overlapY > tol
    )
      right = true;
    // 下/上边：盒子 y 边与区域 y 边共线，且沿 x 方向有可见长度
    if (
      !bottom &&
      Math.min(Math.abs(eyMin - minY), Math.abs(eyMax - minY)) <= tol &&
      overlapX > tol
    )
      bottom = true;
    if (
      !top &&
      Math.min(Math.abs(eyMin - maxY), Math.abs(eyMax - maxY)) <= tol &&
      overlapX > tol
    )
      top = true;
  }
  return left && right && top && bottom;
}
