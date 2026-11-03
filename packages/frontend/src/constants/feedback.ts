/**
 * 用户反馈模块前端常量（PC 端单一事实源）
 *
 * 与后端 feedback 模块契约对应：
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

export const FEEDBACK_SOURCE_OPTIONS = [
  { value: 'PC', labelKey: 'PC 端' },
  { value: 'MOBILE', labelKey: '移动端' },
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
export const FEEDBACK_SOURCE_MAP: Record<string, string> = Object.fromEntries(
  FEEDBACK_SOURCE_OPTIONS.map((o) => [o.value, o.labelKey])
);
export const REWARD_STATUS_MAP: Record<string, string> = Object.fromEntries(
  REWARD_STATUS_OPTIONS.map((o) => [o.value, o.labelKey])
);

/** 奖励会员等级选项（对应 VipTier.level 1-3），发放时在后台选择 */
export const FEEDBACK_TIER_OPTIONS = [
  { value: 1, labelKey: 'VIP1' },
  { value: 2, labelKey: 'VIP2' },
  { value: 3, labelKey: 'VIP3' },
] as const;

/** 奖励时长选项（天），仅允许 7/30/90，与后端 FEEDBACK_REWARD_DURATION_DAYS 一致 */
export const FEEDBACK_DURATION_OPTIONS = [
  { value: 7, labelKey: '7 天' },
  { value: 30, labelKey: '30 天' },
  { value: 90, labelKey: '90 天' },
] as const;

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
