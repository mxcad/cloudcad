export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|webos/i.test(ua);
}
