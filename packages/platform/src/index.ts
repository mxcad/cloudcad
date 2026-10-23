/**
 * @cloudcad/platform — 跨端公共层。
 *
 * 准入规则见包根 README.md：纯函数 / 纯数据、不绑框架、不绑端、重复已成立。
 *
 * 本 barrel 只导出**产品接口**：两端共同遵守的契约数据 + 消费端实际调用的函数。
 * `src/routes/match.ts` 的路径 pattern 编译/匹配是 `resolve.ts` 的内部机制，
 * 不从这里导出——需要它的测试直接按模块路径导入（内部接缝，非对外契约）。
 */

// ── 环境探测 ──
export {
  isMobileByUA,
  isWechatByUA,
  shouldUseMobilePresentation,
  currentUA,
} from './env/device';

// ── 跨端凭证搬运 ──
export {
  AUTH_TRANSFER_QUERY,
  buildAuthTransferQuery,
  parseAuthTransferQuery,
  authTransferParamNames,
} from './env/auth-transfer';

// ── 路由别名映射（跨端 URL 互通的单一事实源） ──
export {
  ROUTE_ALIASES,
  MOBILE_TO_PC_ALIASES,
  NON_MAPPABLE_PC_PREFIXES,
} from './routes/aliases';
export {
  isMappableRoute,
  resolveMobileRoute,
  resolvePcPath,
} from './routes/resolve';

// ── 分享有效期（纯计算，文案留端包） ──
export {
  SHARE_EXPIRATION_VALUES,
  SHARE_EXPIRATION_DEFAULT,
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MIN,
  SHARE_CUSTOM_DAYS_MAX,
  detectShareExpiration,
  computeExpiresAtIso,
  computeExpiresInSeconds,
  clampCustomDays,
  isShareExpired,
} from './share/expiry';
export type { ShareExpirationOption } from './share/expiry';

// ── 分享链接绝对化（纯计算，origin 由调用端传入） ──
export { toShareUrl } from './share/url';

// ── 会员计价与配额（纯计算） ──
export {
  orderAmountCents,
  originalAmountCents,
  centsToYuan,
} from './billing/price';
export { usagePercent, resolveQuotaValue } from './billing/quota';
export { membershipState } from './billing/membership';
export type { MembershipStateInput, MembershipState } from './billing/membership';

// ── 文件名规则（纯判定，文案留端包） ──
export {
  checkFileName,
  stripDrawingExtension,
  stripMxwebContainer,
} from './files/name-rules';

// ── 法务文本占位符（纯替换，品牌实体映射留端包） ──
export { resolvePlaceholders } from './legal/placeholder';

// ── 密码强度评分（纯计算 0-4，阈值取生效策略，标签/颜色留端包） ──
export { scorePasswordStrength } from './auth/password-strength';
export type { PasswordStrengthScore } from './auth/password-strength';

// ── 口令策略预检与要求清单（长度+复杂度纯判定，弱口令黑名单留后端兜底） ──
export {
  PASSWORD_POLICY,
  buildPasswordRequirements,
  countPasswordCategories,
  getPasswordClassFlags,
  validatePasswordPolicy,
} from './auth/password-policy';
export type {
  PasswordClassFlags,
  PasswordPolicyOptions,
  PasswordPolicyReason,
  PasswordPolicyResult,
  PasswordRequirement,
  PasswordRequirementKey,
} from './auth/password-policy';

// ── 角色权限判定（纯判定，会话存储读取留端包） ──
export { hasAnyPermission } from './auth/permissions';

// ── 相对时间（纯计算 tier/unit/value，文案留端包） ──
export { relativeTime } from './format/relative';

// ── 文件大小（纯计算 B~TB，单位符号为通用记号非 i18n） ──
export { formatBytes } from './format/bytes';

// ── 绝对日期/时间（纯计算，固定 ISO-like 格式，locale 无关） ──
export {
  formatDate,
  formatDateTime,
  formatDateTimeWithSeconds,
} from './format/date';

// ── 版本历史展示（倒序编号 + 提交说明提取，两端共用） ──
export {
  INITIAL_VERSION_REVISION,
  toVersionDisplayList,
  extractUserNote,
} from './version/history';
export type { VersionDisplayEntry } from './version/history';

// ── API 错误分类谓词（纯判定，并集更宽，文案留端包） ──
export {
  isAbortError,
  isPermissionError,
  isServerError,
} from './errors/classify';

// ── API 错误文案提取（纯提取，兜底文案与分隔符留端包） ──
export { extractApiError } from './errors/api-message';
export type { ApiErrorDetail } from './errors/api-message';

// ── 跨项目转移策略预判（纯判定，6 域矩阵 + 库-move，reason 枚举留端包映射） ──
export {
  evaluateCrossProjectTransfer,
  DEFAULT_TRANSFER_SETTINGS,
} from './transfer/policy';
export type {
  TransferDomain,
  TransferOperation,
  TransferMode,
  TransferRootRef,
  TransferSettings,
  TransferBlockReason,
  TransferVerdict,
} from './transfer/policy';

// ── 协同编辑域名白名单（纯判定；hostname 由调用方传入，不读 window） ──
export { isCollaborationAllowed } from './collaboration/domains';

// ── 协同 wire 协议（与第三方 cooperate SDK 互操作的线上协议，两端唯一实现） ──
export {
  COLLAB_WORKS_POLL_INTERVAL_MS,
  encodeUserData,
  encodeV3WorkData,
  parseWorkData,
  parseUserData,
  getWorkCreator,
  deduplicateWorkUsers,
} from './collaboration/wire';
export type {
  CollaborateWorkDataV1,
  CollaborateWorkDataV2,
  CollaborateWorkDataV3,
  CollaborateWorkData,
  CollaborateUserData,
  Work,
} from './collaboration/wire';

// ── 项目权限（跨端单一事实源：枚举 + 依赖图 + 补全/级联算法，label 分组留端包） ──
export {
  ProjectPermission,
  PROJECT_PERMISSION_DEPENDENCIES,
  PROJECT_ROLE_KEYS,
  completePermissionDependencies,
  getDependentPermissions,
} from './permissions/project';
export type {
  ProjectPermissionValue,
  ProjectRoleKey,
  PermissionDependencyGraph,
} from './permissions/project';

// ── 意图链（被前置阻塞的编辑器动作，跨登录中断可恢复；ADR-0081） ──
// 只做「定义 → 持久化 → 前置判定」。执行顺序 / 登录闸门 / 引擎命令 / 会话回填
// 是必绑端副作用，留在各端 adapter，不进这里。
export {
  PENDING_INTENT_KEY,
  isPreconditionSatisfied,
  firstBlockedPrecondition,
  startPendingIntent,
  readPendingIntent,
  clearPendingIntent,
  hasPendingIntent,
} from './intentChain/chain';
export type {
  IntentPrecondition,
  IntentResumeAnchor,
  IntentDef,
  IntentStorage,
} from './intentChain/chain';
