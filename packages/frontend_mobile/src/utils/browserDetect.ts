/**
 * 浏览器环境检测工具
 */

/**
 * 检测是否为微信浏览器
 * 微信浏览器的 User-Agent 中包含 MicroMessenger
 */
export function isWechatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}
