import { isWechatByUA } from '@cloudcad/platform';

/**
 * 浏览器环境检测工具
 */

/**
 * 检测是否为微信浏览器
 * 判定收敛到 @cloudcad/platform 的 isWechatByUA（与 PC 共用）
 */
export function isWechatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isWechatByUA(navigator.userAgent);
}
