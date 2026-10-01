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

// ── 分享有效期（纯计算，文案留端包） ──
export {
  SHARE_EXPIRATION_VALUES,
  detectShareExpiration,
  computeExpiresAtIso,
  computeExpiresInSeconds,
  isShareExpired,
} from './share/expiry';
export type { ShareExpirationOption } from './share/expiry';

// ── 会员计价与配额（纯计算） ──
export {
  orderAmountCents,
  originalAmountCents,
  centsToYuan,
} from './billing/price';
export { usagePercent, resolveQuotaValue } from './billing/quota';

// ── 文件名规则（纯判定，文案留端包） ──
export { checkFileName } from './files/name-rules';
export type { FileNameCheckResult, FileNameReason } from './files/name-rules';

// ── 法务文本占位符（纯替换，品牌实体映射留端包） ──
export { resolvePlaceholders } from './legal/placeholder';

// ── 密码强度评分（纯计算 0-4，标签/颜色留端包） ──
export { scorePasswordStrength } from './auth/password-strength';

// ── 相对时间（纯计算 tier/unit/value，文案留端包） ──
export { relativeTime } from './format/relative';
export type {
  RelativeTimeResult,
  RelativeTimeUnit,
} from './format/relative';

// ── 文件大小（纯计算 B~TB，单位符号为通用记号非 i18n） ──
export { formatBytes } from './format/bytes';

// ── 绝对日期/时间（纯计算，固定 ISO-like 格式，locale 无关） ──
export {
  formatDate,
  formatDateTime,
  formatDateTimeWithSeconds,
} from './format/date';

// ── API 错误分类谓词（纯判定，并集更宽，文案留端包） ──
export {
  isAbortError,
  isPermissionError,
  isServerError,
} from './errors/classify';

// ── 跨项目转移策略预判（纯判定，6 域矩阵 + 库-move，reason 枚举留端包映射） ──
export { evaluateCrossProjectTransfer } from './transfer/policy';
export type {
  TransferDomain,
  TransferOperation,
  TransferMode,
  TransferRootRef,
  TransferSettings,
  TransferBlockReason,
  TransferVerdict,
} from './transfer/policy';
