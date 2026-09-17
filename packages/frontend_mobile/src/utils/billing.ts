/**
 * 会员中心数据契约与纯函数（ADR-0068 移动端会员中心 / 支付）。
 *
 * 移动端复用后端 billing / vip 全部端点，无移动端专属接口；SDK 对
 * GET /billing/orders、GET /billing/membership、POST /billing/orders/:orderNo/query、
 * GET /vip/tiers、GET /vip/durations 的响应类型均为 unknown，故在此声明前端消费
 * 形状，字段与后端 BillingService.getUserOrders、VipTierService.toResponse、
 * DurationPricingService.toResponse、OrderResponseDto 对齐。
 *
 * 金额全链路单位为「分」（baseMonthlyPrice / amount），展示统一除以 100。
 * 计价公式与后端 BillingService.createOrder 一致：
 *   amount = round(baseMonthlyPrice * multiplierBps * months / 10000)
 */

/** 订单状态（后端 OrderStatus 枚举，Prisma 同名） */
export type OrderStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CLOSED'
  | 'TIMEOUT'

/** 退款申请状态（后端 RefundApplicationStatus 枚举） */
export type RefundStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/**
 * 移动 H5 可用的交易类型。
 * 微信内置浏览器走 MWEB（微信 H5 支付跳转）；系统浏览器走 NATIVE（返回二维码
 * codeUrl，由前端渲染成图让用户扫码）。JSAPI 需 openid，后端未把微信登录的
 * openid 打通到 billing，移动端不使用。
 */
export type MobileTradeType = 'MWEB' | 'NATIVE'

/** VIP 档位（GET /api/v1/vip/tiers） */
export interface VipTier {
  id: string
  level: number
  name: string
  /** 月费（元） */
  baseMonthlyPriceYuan: number
  /** 月费（分） */
  baseMonthlyPrice: number
  isActive: boolean
  configs: Record<string, unknown>
}

/** 时长定价（GET /api/v1/vip/durations） */
export interface DurationPricing {
  id: string
  months: number
  /** 折扣系数 = multiplierBps / 10000 */
  multiplier: number
  multiplierBps: number
  label: string
  isActive: boolean
  sortOrder: number
}

/** 配置项元数据（GET /api/v1/vip/tiers/registry） */
export interface ConfigRegistryEntry {
  id: string
  key: string
  type: string
  label: string | null
  defaultValue: unknown
  description: string | null
  sortOrder: number
}

export interface RefundApplication {
  id: string
  status: RefundStatus
  reason: string
  createdAt: string
  reviewNote?: string | null
  reviewedAt?: string | null
}

/** 订单：创建/续付响应（OrderResponseDto）与列表项（getUserOrders）的并集 */
export interface BillingOrder {
  id: string
  orderNo: string
  vipTierId: string | null
  months: number | null
  /** 订单金额（分） */
  amount: number
  status: OrderStatus
  /** mock | wechat_pay */
  gateway: string
  gatewayOrderId: string | null
  /** NATIVE 支付二维码链接 */
  codeUrl?: string | null
  /** JSAPI 支付参数（移动端不使用） */
  payParams?: Record<string, unknown> | null
  /** MWEB 跳转链接 */
  redirectUrl?: string | null
  vipTierName: string
  durationLabel: string
  /** 订单金额（元） */
  priceYuan: number
  createdAt: string
  paidAt?: string | null
  description?: string
  /** 列表项携带最近一条退款申请 */
  refundApplications?: RefundApplication[]
}

export interface OrdersPage {
  items: BillingOrder[]
  total: number
  page: number
  limit: number
}

/** 会员字段子集（GET /api/v1/users/profile/me 的 UserProfileResponseDto） */
export interface MembershipLike {
  membershipTierLevel?: number
  membershipTier?: string
  membershipExpiresAt?: string | null
  isVip?: boolean
}

/** 个人空间配额（StorageInfoDto，单位字节） */
export interface QuotaInfo {
  used: number
  total: number
  remaining: number
  usagePercent: number
}

/** MWEB 跳回后需要恢复的待支付上下文（不含任何凭据） */
export interface PendingPayment {
  orderNo: string
  vipTierName: string
  durationLabel: string
  priceYuan: number
  tradeType: MobileTradeType
}

const WECHAT_RE = /MicroMessenger/i

/** 运行在微信内置浏览器时返回 true（决定用 MWEB 还是 NATIVE） */
export function isWechatBrowser(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  return WECHAT_RE.test(ua)
}

/** 移动端下单交易类型：微信内 → MWEB，系统浏览器 → NATIVE */
export function pickTradeType(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): MobileTradeType {
  return isWechatBrowser(ua) ? 'MWEB' : 'NATIVE'
}

/** 订单金额（分），与后端计价公式一致 */
export function orderAmountCents(
  tier: Pick<VipTier, 'baseMonthlyPrice'>,
  duration: Pick<DurationPricing, 'multiplierBps' | 'months'>,
): number {
  return Math.round(
    (tier.baseMonthlyPrice * duration.multiplierBps * duration.months) / 10000,
  )
}

/** 分 → 元，固定两位小数（1990 → '19.90'） */
export function centsToYuan(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00'
  return (cents / 100).toFixed(2)
}

/** 时长按 sortOrder 升序，同序时按 months 升序兜底 */
export function sortDurations(list: DurationPricing[]): DurationPricing[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.months - b.months)
}

/** 档位按 level 升序 */
export function sortTiers(list: VipTier[]): VipTier[] {
  return [...list].sort((a, b) => a.level - b.level)
}

/**
 * 解析某档位的配额值：档位配置优先，缺键回落 registry 默认值（与后端
 * MembershipService 的回落语义一致，ADR-0043）。非数字一律归零。
 */
export function resolveQuotaValue(
  configs: Record<string, unknown> | undefined,
  key: string,
  registry?: Map<string, ConfigRegistryEntry>,
): number {
  const direct = toNumber(configs?.[key])
  if (direct !== null) return direct
  return toNumber(registry?.get(key)?.defaultValue) ?? 0
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** 用量百分比（total 非正时返回 0，封顶 100） */
export function usagePercent(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(used) || used < 0) return 0
  return Math.min(100, (used / total) * 100)
}

/** 订单当前审核中的退款申请，无则 null */
export function activeRefund(order: BillingOrder): RefundApplication | null {
  const apps = order.refundApplications
  return Array.isArray(apps) && apps.length > 0 && apps[0].status === 'PENDING'
    ? apps[0]
    : null
}

/** 是否可申请退款：已支付且无审核中的退款 */
export function canApplyRefund(order: BillingOrder): boolean {
  return order.status === 'SUCCEEDED' && !activeRefund(order)
}

/** 是否可续付（2 小时窗口内的待支付单） */
export function canRepay(order: BillingOrder): boolean {
  return order.status === 'PENDING'
}

/** '2026-09-15 14:30'；非法/空返回空串 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 日期 '2026-09-15'；非法/空返回空串 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * MWEB（微信 H5 支付）会整页跳到微信支付页，跳回后需恢复待支付上下文。
 * 用 localStorage：跳回是同 URL 重载，刷新/切后台杀进程后再进也能续上；
 * 只存展示字段，凭据不入 URL、不入存储。
 */
const PENDING_PAYMENT_KEY = 'pendingPayment'

export function savePendingPayment(p: PendingPayment): void {
  try {
    localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(p))
  } catch {
    // 存储不可用时轮询仍可用，跳回后用户可手动确认
  }
}

export function loadPendingPayment(): PendingPayment | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PENDING_PAYMENT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<PendingPayment>
    if (typeof p.orderNo !== 'string' || !p.orderNo) return null
    return {
      orderNo: p.orderNo,
      vipTierName: typeof p.vipTierName === 'string' ? p.vipTierName : '',
      durationLabel: typeof p.durationLabel === 'string' ? p.durationLabel : '',
      priceYuan: typeof p.priceYuan === 'number' ? p.priceYuan : 0,
      tradeType: p.tradeType === 'MWEB' ? 'MWEB' : 'NATIVE',
    }
  } catch {
    return null
  }
}

export function clearPendingPayment(): void {
  try {
    localStorage.removeItem(PENDING_PAYMENT_KEY)
  } catch {
    // 忽略
  }
}
