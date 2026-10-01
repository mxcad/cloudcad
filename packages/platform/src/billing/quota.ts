/**
 * 配额/用量——跨端共享的纯计算。
 *
 * 过去用量百分比在 PC `MemberCenter.tsx`、移动端 `useProfileData.ts`、
 * 移动端 `utils/billing.ts` 三处内联，阈值与兜底不一致；档位配额值解析
 * 两端语义也不同（移动端有 registry 默认值回落，PC 直接 `Number(v)||0`），
 * 同一档位在两端可能显示不同配额。这里收敛为唯一实现。
 */

/**
 * 用量百分比：total 非正 → 0；used 为负/非有限 → 0；封顶 100。
 */
export function usagePercent(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(used) || used < 0) return 0;
  return Math.min(100, (used / total) * 100);
}

/**
 * 解析某档位的配额值：档位配置优先，缺键回落 registry 默认值（与后端
 * MembershipService 的回落语义一致，ADR-0043）。非数字一律归零。
 */
export function resolveQuotaValue(
  configs: Record<string, unknown> | undefined,
  key: string,
  registry?: Map<string, { defaultValue: unknown }>
): number {
  const direct = toQuotaNumber(configs?.[key]);
  if (direct !== null) return direct;
  return toQuotaNumber(registry?.get(key)?.defaultValue) ?? 0;
}

function toQuotaNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
