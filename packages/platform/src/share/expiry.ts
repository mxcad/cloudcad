/**
 * 分享链接有效期——跨端共享的纯计算。
 *
 * 背景：PC `constants/share.ts`、移动端 `ShareManagePage.vue`、移动端
 * `ShareCurrentPopup.vue` 曾各写一份「预设值表 + 检测现有有效期 + 计算到期时间」，
 * 预设秒数与检测阈值三处必须一致（否则同一分享在两端显示/续期行为不同）。
 * 这里收敛为唯一实现；展示文案（「永不过期」等）仍留在各端语言文件。
 *
 * 后端契约：创建分享用 `expiresIn`（**秒**），修改有效期用 `expiresAt`（ISO 字符串，
 * null=永不过期）。两个方向的计算都从这里出。
 */

/** 有效期选项。`custom`=自定义天数，`immediate`=立即过期（改有效期时用）。 */
export type ShareExpirationOption =
  | 'immediate'
  | 'never'
  | '2h'
  | '6h'
  | '12h'
  | '1d'
  | '3d'
  | '7d'
  | 'custom';

/** 预设 → 秒数（纯数据，两端展示/计算共用）。 */
export const SHARE_EXPIRATION_VALUES: Record<
  Exclude<ShareExpirationOption, 'immediate' | 'never' | 'custom'>,
  number
> = {
  '2h': 7200,
  '6h': 21600,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '7d': 604800,
};

const SECOND = 1000;
const DAY_MS = 86400 * SECOND;

/**
 * 由现有 expiresAt 反推应选中的预设项（续期弹窗初始值）。
 * `now` 缺省取 Date.now()，测试可注入。
 */
export function detectShareExpiration(
  expiresAt: string | null,
  now: number = Date.now()
): { option: ShareExpirationOption; customDays: number } {
  if (!expiresAt) return { option: 'never', customDays: 1 };
  const diff = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(diff)) return { option: 'never', customDays: 1 };
  if (diff <= 0) return { option: 'immediate', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['2h'] * SECOND)
    return { option: '2h', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['6h'] * SECOND)
    return { option: '6h', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['12h'] * SECOND)
    return { option: '12h', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['1d'] * SECOND)
    return { option: '1d', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['3d'] * SECOND)
    return { option: '3d', customDays: 1 };
  if (diff <= SHARE_EXPIRATION_VALUES['7d'] * SECOND)
    return { option: '7d', customDays: 1 };
  return { option: 'custom', customDays: Math.ceil(diff / DAY_MS) };
}

/**
 * 计算修改有效期要提交的 `expiresAt`（ISO 字符串）。
 * never→null；immediate→now-1s（后端视为已过期）；custom→now+days。
 */
export function computeExpiresAtIso(
  option: ShareExpirationOption,
  customDays: number,
  now: number = Date.now()
): string | null {
  if (option === 'never') return null;
  if (option === 'immediate')
    return new Date(now - SECOND).toISOString();
  if (option === 'custom')
    return new Date(now + Math.max(1, customDays) * DAY_MS).toISOString();
  return new Date(now + SHARE_EXPIRATION_VALUES[option] * SECOND).toISOString();
}

/**
 * 计算创建分享要提交的 `expiresIn`（**秒**）。
 * never→undefined（不传该字段）；immediate 不适用于创建，按 1 秒处理。
 */
export function computeExpiresInSeconds(
  option: ShareExpirationOption,
  customDays: number
): number | undefined {
  if (option === 'never') return undefined;
  if (option === 'immediate') return 1;
  if (option === 'custom') return Math.max(1, customDays) * 86400;
  return SHARE_EXPIRATION_VALUES[option];
}

/** 是否已过期（null=永不过期，恒 false）。 */
export function isShareExpired(
  expiresAt: string | null,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return !Number.isNaN(t) && t <= now;
}
