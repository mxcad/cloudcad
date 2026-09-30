/**
 * @cloudcad/platform — 跨端公共层。
 *
 * 准入规则见包根 README.md：纯函数 / 纯数据、不绑框架、不绑端、重复已成立。
 */

// ── 环境探测 ──
export {
  MOBILE_UA_PATTERN,
  WECHAT_UA_PATTERN,
  DESKTOP_WIDTH_THRESHOLD,
  isMobileByUA,
  isWechatByUA,
  isTouchDevice,
  shouldUseMobilePresentation,
  currentUA,
} from './env/device';
export type { DeviceEnv } from './env/device';

// ── 跨端凭证搬运 ──
export {
  AUTH_TRANSFER_QUERY,
  buildAuthTransferQuery,
  parseAuthTransferQuery,
  authTransferParamNames,
} from './env/auth-transfer';
export type {
  AuthTransferParamKey,
  AuthTransferCredentials,
  BuildAuthTransferOptions,
  ParsedAuthTransfer,
  QuerySource,
} from './env/auth-transfer';

// ── 路由别名映射（跨端 URL 互通的单一事实源） ──
export {
  ROUTE_ALIASES,
  MOBILE_TO_PC_ALIASES,
  NON_MAPPABLE_PC_PREFIXES,
} from './routes/aliases';
export type { RouteAlias, MobileToPcAlias } from './routes/aliases';
export {
  compilePathPattern,
  splitPathname,
  matchPathPattern,
  renderPathPattern,
} from './routes/match';
export type { PathSegment } from './routes/match';
export {
  parseSearch,
  isMappableRoute,
  resolveMobileRoute,
  resolvePcPath,
} from './routes/resolve';
export type { ResolvedRoute } from './routes/resolve';
