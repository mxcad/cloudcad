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

/**
 * 新建分享弹窗的默认选中档位（含「重置为默认」）。
 *
 * 与 `SHARE_CUSTOM_DAYS_DEFAULT` 同属「弹窗初值」契约：档位与天数是成对重置的
 * （两端的每个重置点都是「档位 + 天数」两行），各端各写一个字面量的话，
 * 改默认分享时长要跨两个端包各找一遍。
 *
 * 类型排除了 `immediate`——默认就立即过期是无效初值，且端侧选项列表本就不提供它。
 */
export const SHARE_EXPIRATION_DEFAULT: Exclude<
  ShareExpirationOption,
  'immediate'
> = '7d';

/**
 * 自定义天数的合法区间与默认值。
 *
 * 区间是这份契约的一部分，不是调用方的实现细节：`customDays` 以裸 `number`
 * 进出两个计算函数，若边界只在调用方记住，就会有入口漏钳制——此前 PC 创建分享
 * 与移动端两个创建入口都不设上限，同一份 500 天输入在不同入口算出不同到期时间。
 * 端侧输入框的 `min`/`max` 提示也引这两个常量，避免提示与钳制各写一份。
 */
export const SHARE_CUSTOM_DAYS_MIN = 1;
export const SHARE_CUSTOM_DAYS_MAX = 365;

/** 反推不出天数时续期弹窗输入框的初值，也是天数缺失（NaN）时的回落值；恰等于 MIN，故 0/空输入钳到 MIN 后与它同值。 */
export const SHARE_CUSTOM_DAYS_DEFAULT = SHARE_CUSTOM_DAYS_MIN;

/**
 * 反推结果。天数只在 `custom` 分支存在；其余分支不返回该字段，
 * 调用方用自己的默认值（`SHARE_CUSTOM_DAYS_DEFAULT`）填输入框。
 * 这样「非 custom 分支的天数无意义」变成结构事实，
 * 而不是藏在返回值里要求调用方知道的约定。
 */
export type ShareExpirationDetection =
  | { option: Exclude<ShareExpirationOption, 'custom'> }
  | { option: 'custom'; customDays: number };

const SECOND = 1000;
const SECONDS_PER_DAY = 86400;
const DAY_MS = SECONDS_PER_DAY * SECOND;

/**
 * 由现有 expiresAt 反推应选中的预设项（续期弹窗初始值）。
 * `now` 缺省取 Date.now()，测试可注入。
 *
 * 反推出的天数同样过钳制：输入框显示的天数必须等于提交后会保存的天数，
 * 否则会显示 500 而存成 365。仅存量越界分享（旧端不设上限时创建）会触发。
 */
export function detectShareExpiration(
  expiresAt: string | null,
  now: number = Date.now()
): ShareExpirationDetection {
  if (!expiresAt) return { option: 'never' };
  const diff = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(diff)) return { option: 'never' };
  if (diff <= 0) return { option: 'immediate' };
  if (diff <= SHARE_EXPIRATION_VALUES['2h'] * SECOND) return { option: '2h' };
  if (diff <= SHARE_EXPIRATION_VALUES['6h'] * SECOND) return { option: '6h' };
  if (diff <= SHARE_EXPIRATION_VALUES['12h'] * SECOND) return { option: '12h' };
  if (diff <= SHARE_EXPIRATION_VALUES['1d'] * SECOND) return { option: '1d' };
  if (diff <= SHARE_EXPIRATION_VALUES['3d'] * SECOND) return { option: '3d' };
  if (diff <= SHARE_EXPIRATION_VALUES['7d'] * SECOND) return { option: '7d' };
  return {
    option: 'custom',
    customDays: clampCustomDays(Math.ceil(diff / DAY_MS)),
  };
}

/**
 * 自定义天数的上下界钳制——创建/修改两条提交路径**和端侧输入框的实时显示**
 * 都必须走这一个口径，保证「输入框显示的天数 = 提交后会保存的天数」。
 *
 * 端侧输入框若只靠 HTML `min`/`max` 提示而不钳制用户键入值，就会出现「显示 500、
 * 存成 365」的跨端不一致（PC 每键钳制、移动端只靠提示时）。故导出为公开钳制，
 * 两端输入框的 `onChange` 都调它，而非各自手写 `Math.max(MIN, Math.min(MAX, …))`。
 *
 * 只有 NaN 回落到默认天数：`Math.max` 不拦 NaN，让它直通会让
 * `computeExpiresAtIso` 抛 `RangeError: Invalid time value`、
 * `computeExpiresInSeconds` 返回 NaN。±Infinity 是越界值而非缺失值，
 * 照钳制语义投到边界（+∞→MAX、-∞→MIN），保证结果对有限输入单调不减——
 * 若把 +∞ 也归入「缺失」，500 天会存成 365 而 ∞ 天反而存成 1，越界越大结果越小。
 */
export function clampCustomDays(days: number): number {
  if (Number.isNaN(days)) return SHARE_CUSTOM_DAYS_DEFAULT;
  return Math.max(SHARE_CUSTOM_DAYS_MIN, Math.min(SHARE_CUSTOM_DAYS_MAX, days));
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
  if (option === 'immediate') return new Date(now - SECOND).toISOString();
  if (option === 'custom')
    return new Date(now + clampCustomDays(customDays) * DAY_MS).toISOString();
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
  if (option === 'custom') return clampCustomDays(customDays) * SECONDS_PER_DAY;
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
