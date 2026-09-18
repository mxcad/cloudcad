/**
 * 桌面端 EXE 来源标记的唯一事实源。
 *
 * EXE 是独立项目，通过系统浏览器打开 Web URL（见 docs/adr/0042 与
 * docs/archive/handoff/desktop-client-handoff.md）。桌面端打开的会话里，
 * 登录成功后不应自动弹 Web 端的新手引导弹框（TourStartModal）。
 *
 * 桌面端入口 URL 共 4 类（参数名与各入口页面解析处保持一致）：
 * - /logo?redirect_uri=...   EXE OAuth 登录回调（Login/index.tsx）
 * - /device?user_code=...    EXE 设备码授权（DeviceAuthorize.tsx）
 * - /session-transfer        EXE 会话转移（SessionTransfer/index.tsx）
 * - /member-center?auto=1    EXE 自动下单（MemberCenter.tsx）
 *
 * 标记存 sessionStorage：跨整页跳转存活（桌面端流程登录完成后会整页跳回
 * 普通页面），关标签自动清除。标记在整页加载时由 index.tsx 写入。
 */
const DESKTOP_ORIGIN_KEY = 'cloudcad_desktop_origin';

/** 判断 URL 是否为桌面端 EXE 打开的入口 */
export function isDesktopOriginUrl(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search);
  if (pathname === '/logo' && params.get('redirect_uri')) return true;
  if (pathname === '/device' && params.get('user_code')) return true;
  if (pathname === '/session-transfer') return true;
  if (pathname === '/member-center' && params.get('auto') === '1') return true;
  return false;
}

/** 当前 URL 命中桌面端入口时写入标记（整页加载时调用，幂等） */
export function markDesktopOrigin(): void {
  try {
    if (isDesktopOriginUrl(window.location.pathname, window.location.search)) {
      sessionStorage.setItem(DESKTOP_ORIGIN_KEY, '1');
    }
  } catch {
    // 忽略存储错误（如隐私模式）
  }
}

/** 本标签页会话是否由桌面端 EXE 打开 */
export function isDesktopOrigin(): boolean {
  try {
    return sessionStorage.getItem(DESKTOP_ORIGIN_KEY) === '1';
  } catch {
    return false;
  }
}
