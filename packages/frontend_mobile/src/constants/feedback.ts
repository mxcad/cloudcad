/**
 * 用户反馈模块前端常量（移动端）
 *
 * 与后端 feedback 模块契约对应（对齐 PC `src/constants/feedback.ts`）：
 * - 类型/状态/来源枚举值必须与 `packages/backend/src/feedback/feedback.enums.ts` 一致；
 * - 查询码/限流等常量与后端 `feedback.constants.ts` 对齐（前端仅做展示/本地校验，
 *   真正的限额在服务端强制执行）；
 * - 匿名令牌：前端 localStorage 生成一次性设备令牌，后端只存 HMAC（见后端
 *   `FeedbackService.hashAnonToken`），登录用户不需要该令牌。
 */

export const FEEDBACK_ANON_TOKEN_KEY = 'feedback_anon_token';

export const FEEDBACK_TYPE_OPTIONS = [
  { value: 'BUG', labelKey: '缺陷反馈' },
  { value: 'SUGGESTION', labelKey: '功能建议' },
  { value: 'COMPLAINT', labelKey: '投诉' },
  { value: 'OTHER', labelKey: '其他' },
] as const;

export const FEEDBACK_STATUS_OPTIONS = [
  { value: 'PENDING', labelKey: '待处理' },
  { value: 'REVIEWING', labelKey: '处理中' },
  { value: 'ADOPTED', labelKey: '已采纳' },
  { value: 'REJECTED', labelKey: '已驳回' },
  { value: 'CLOSED', labelKey: '已关闭' },
] as const;

export const REWARD_STATUS_OPTIONS = [
  { value: 'NONE', labelKey: '无奖励' },
  { value: 'PENDING', labelKey: '待发放' },
  { value: 'ISSUED', labelKey: '已发放' },
  { value: 'REVOKED', labelKey: '已撤销' },
] as const;

export const FEEDBACK_TYPE_MAP: Record<string, string> = Object.fromEntries(
  FEEDBACK_TYPE_OPTIONS.map((o) => [o.value, o.labelKey])
);
export const FEEDBACK_STATUS_MAP: Record<string, string> = Object.fromEntries(
  FEEDBACK_STATUS_OPTIONS.map((o) => [o.value, o.labelKey])
);
export const REWARD_STATUS_MAP: Record<string, string> = Object.fromEntries(
  REWARD_STATUS_OPTIONS.map((o) => [o.value, o.labelKey])
);

/** 状态徽标文字色（对齐 PC FeedbackQueryPanel statusPill 语义） */
export function statusColor(s: string): string {
  switch (s) {
    case 'PENDING':
      return '#b45309';
    case 'REVIEWING':
      return '#1d4ed8';
    case 'ADOPTED':
      return '#15803d';
    case 'REJECTED':
      return '#dc2626';
    default:
      return '#6b7280';
  }
}

/** 状态徽标底色（对齐 statusColor） */
export function statusBg(s: string): string {
  switch (s) {
    case 'PENDING':
      return 'rgba(180, 83, 9, 0.12)';
    case 'REVIEWING':
      return 'rgba(29, 78, 216, 0.12)';
    case 'ADOPTED':
      return 'rgba(21, 128, 61, 0.12)';
    case 'REJECTED':
      return 'rgba(220, 38, 38, 0.12)';
    default:
      return 'rgba(107, 114, 128, 0.12)';
  }
}

/** ISO 时间 → 本地化字符串（空/非法回落 '-'） */
export function formatTime(iso: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * 奖励规则披露文案（提交弹窗里的「如何获得奖励」说明）。
 * 核心原则：提交可以匿名，奖励不能匿名 —— 被采纳后须联系客服注册/绑定账号才能领取。
 */
export const FEEDBACK_REWARD_RULE = [
  '提交可以匿名，奖励不能匿名：匿名反馈被采纳后，须联系客服并凭查询码注册或绑定账号，才能领取会员奖励。',
  '只有被采纳的反馈才会触发奖励；驳回/关闭不会发放。',
  '登录用户提交的反馈，采纳后可直接发放到本人账号（仍需客服核实）。',
];

/** 匿名设备令牌：首次提交生成，后续提交复用（后端按 HMAC 去重/限流） */
export function getFeedbackAnonToken(): string {
  try {
    let token = localStorage.getItem(FEEDBACK_ANON_TOKEN_KEY);
    if (!token) {
      // 随机 32 字节 hex，仅作设备标识，不包含任何用户信息
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(FEEDBACK_ANON_TOKEN_KEY, token);
    }
    return token;
  } catch {
    // localStorage 不可用（隐私模式等）时退化为会话内随机值，仍可提交但跨会话无法跟踪
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
