/**
 * 会员判定——跨端共享的纯计算。
 *
 * 历史上会员判定写了 4 份且口径不一：PC `useMembership.ts`（daysRemaining
 * 下限钳制 + 永久会员 Infinity）、PC `vipCommandGuard.ts`（原始 diff > 0）、
 * 移动端 `permissionService.canExportDownloadGate`（只看 tierLevel，漏判
 * expiresAt → 过期会员通过导出下载门控，真 bug）、移动端
 * `useMemberCenter` / `useProfileData`（无下限钳制 → 负剩余天数）。
 * 这里收敛为唯一实现：吃参数不读 localStorage，now 默认 Date.now() 便于
 * 测试。展示约定（永久会员显示 Infinity / null）由调用端自行适配。
 */

export interface MembershipStateInput {
  /** 会员档位等级；0 = 非会员 */
  tierLevel: number;
  /** 到期时间（ISO 字符串或时间戳）；null = 永久会员（无到期日） */
  expiresAt: string | number | null;
  /** 当前时间（默认 Date.now()，测试显式传入） */
  now?: number;
}

export interface MembershipState {
  tierLevel: number;
  /** tierLevel > 0 且无到期日（永久会员） */
  isPermanent: boolean;
  /** tierLevel > 0 且（永久 或 未到期） */
  isVip: boolean;
  /** 剩余天数：永久 = Infinity；已到期/无法解析 = 0；否则 ceil 后下限钳制 ≥0 */
  daysRemaining: number;
}

export function membershipState(input: MembershipStateInput): MembershipState {
  const { tierLevel, expiresAt, now = Date.now() } = input;
  const isPermanent = tierLevel > 0 && expiresAt == null;
  let daysRemaining = 0;
  if (!isPermanent && expiresAt != null) {
    const expire = new Date(expiresAt).getTime();
    if (!Number.isNaN(expire)) {
      daysRemaining = Math.max(0, Math.ceil((expire - now) / 86_400_000));
    }
  }
  return {
    tierLevel,
    isPermanent,
    isVip: tierLevel > 0 && (isPermanent || daysRemaining > 0),
    daysRemaining: isPermanent ? Number.POSITIVE_INFINITY : daysRemaining,
  };
}
