///////////////////////////////////////////////////////////////////////////////
// 分享图纸框选区域（CAD 坐标包围盒）URL 编解码 —— 跨端共用（单一事实源）
//
// 分享二维码内容在普通分享链接上附加 `region` 查询参数（`x1,y1,x2,y2`，
// 框选区域的 CAD 世界坐标 minPt/maxPt）。扫码打开后，编辑器据此在图纸
// 加载完成时自动 zoom 到该区域。PC / 移动端共用本模块，勿两端手写。
///////////////////////////////////////////////////////////////////////////////

/** 分享图纸框选区域（CAD 世界坐标包围盒，minPt <= maxPt）。对齐 PC ThumbnailRegion。 */
export interface ShareRegion {
  minPt: { x: number; y: number };
  maxPt: { x: number; y: number };
}

/** 编码为 URL 查询参数值："x1,y1,x2,y2"（逗号分隔浮点）。无效/空返回 null。 */
export function encodeShareRegion(
  region: ShareRegion | null | undefined
): string | null {
  if (!region) return null;
  const pts = [
    region.minPt?.x,
    region.minPt?.y,
    region.maxPt?.x,
    region.maxPt?.y,
  ];
  if (pts.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return pts.map((v) => String(v)).join(',');
}

/** 解析 URL 查询参数值为区域。缺参/格式非法/非有限数返回 null（调用方按无区域处理）。 */
export function decodeShareRegion(
  value: string | null | undefined
): ShareRegion | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 4) return null;
  const nums = parts.map((s) => Number(s));
  if (nums.some((v) => !Number.isFinite(v))) return null;
  const [x1, y1, x2, y2] = nums as [number, number, number, number];
  return {
    minPt: { x: x1, y: y1 },
    maxPt: { x: x2, y: y2 },
  };
}

/**
 * 在分享链接 URL 上附加 region 查询参数（已有同参数则覆盖）。
 * 解析失败/无 region 时原样返回 url。
 */
export function appendShareRegionToUrl(
  url: string,
  region: ShareRegion | null | undefined,
  origin: string
): string {
  const encoded = encodeShareRegion(region);
  if (!encoded) return url;
  try {
    const u = new URL(url, origin);
    u.searchParams.set('region', encoded);
    return u.toString();
  } catch {
    return url;
  }
}
