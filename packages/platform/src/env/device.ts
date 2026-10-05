/**
 * 设备与浏览器环境判定。
 *
 * 全部吃参数，不读 navigator——App 端可传自己的 UA、Electron 可传 process.platform。
 *
 * 历史问题（收敛前的三份实现）：
 * - PC `utils/isMobile.ts`：/android|iphone|ipad|ipod|webos/i
 * - PC `WechatPayButton.tsx`：/Mobi|Android|iPhone|iPad|iPod/i（比上面多 Mobi）
 * - 移动端 `browserDetect.ts` 与 `utils/billing.ts`：各一份 /MicroMessenger/i
 *
 * 同一个「是不是移动端」判定跑出了两种正则，同一个「是不是微信」判定写了 3 份。
 */

/** 移动设备 UA 特征。补了 `mobi`：部分 Android WebView 只带 Mobi 不带完整机型名。 */
export const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|webos|mobi/i;

/** 微信内置浏览器 UA 特征。 */
export const WECHAT_UA_PATTERN = /micromessenger/i;

/**
 * 视口宽度超过该值视为「宽屏」，即使用户是移动设备也不自动降级到移动端 H5。
 *
 * 大屏 Android 平板 / iPad Pro 分屏的用户在用桌面 CAD 编辑器时，按 UA 自动跳走
 * 会毁掉工作流——他们用的是桌面姿态，只是设备碰巧是触屏。
 */
export const DESKTOP_WIDTH_THRESHOLD = 1024;

export interface DeviceEnv {
  /** 浏览器 User-Agent。SSR / Node 环境可传空串。 */
  ua: string;
  /** 视口宽度（window.innerWidth）。取不到时传 undefined，则只做 UA 判定。 */
  width?: number;
  /** navigator.maxTouchPoints，用于兜底判定触屏设备。 */
  maxTouchPoints?: number;
}

/** 纯 UA 判定：UA 里是否声明为移动设备。 */
export function isMobileByUA(ua: string): boolean {
  return MOBILE_UA_PATTERN.test(ua);
}

/** 纯 UA 判定：是否微信内置浏览器。 */
export function isWechatByUA(ua: string): boolean {
  return WECHAT_UA_PATTERN.test(ua);
}

/**
 * 触屏兜底判定：maxTouchPoints > 0 说明是可触摸设备。
 *
 * 只做兜底不做主判定——UA 会伪造，但 maxTouchPoints 是硬件能力，
 * 且部分 Linux / Windows 触屏 PC 也会 > 0。
 */
export function isTouchDevice(maxTouchPoints: number | undefined): boolean {
  return typeof maxTouchPoints === 'number' && maxTouchPoints > 0;
}

/**
 * 综合判定：当前姿态是否应使用移动端呈现（即是否该自动跳转到移动端 H5）。
 *
 * 比 `isMobileByUA` 多了宽屏豁免：UA 声明移动设备但视口 ≥ 1024px 时不自动跳，
 * 交由用户在逃生入口手动选择。
 */
export function shouldUseMobilePresentation(env: DeviceEnv): boolean {
  if (!isMobileByUA(env.ua)) return false;
  if (typeof env.width === 'number' && env.width >= DESKTOP_WIDTH_THRESHOLD) {
    return false;
  }
  return true;
}

/**
 * 薄适配：取当前浏览器 UA。唯一直接读端 API 的地方。
 *
 * 非浏览器环境（SSR、Node）返回空串，所有判定函数对空串一律返回 false，
 * 不会出现异常。
 */
export function currentUA(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent;
}
