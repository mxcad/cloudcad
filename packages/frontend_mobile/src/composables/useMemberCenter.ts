/**
 * 会员中心 / 支付编排（ADR-0068）。
 *
 * 数据与支付流程复用后端 billing / vip 端点（与 PC 同源，无移动端专属接口）：
 *   档位 /vip/tiers · 时长 /vip/durations · 配置项 /vip/tiers/registry
 *   会员状态 /users/profile/me · 存储配额 /file-system/quota
 *   下单 POST /billing/orders · 续付 POST /billing/orders/:orderNo/repay
 *   查单 POST /billing/orders/:orderNo/query · 退款 POST /billing/orders/:orderNo/refund-apply
 *
 * 支付两态：
 *   NATIVE（系统浏览器）→ 后端返回 codeUrl，前端渲染二维码 + 5s 轮询查单
 *   MWEB（微信内置浏览器）→ 后端返回 redirectUrl，整页跳微信支付页；跳回后经
 *   localStorage 恢复待支付上下文并继续轮询（PC 端 paymentReturn 参数未实现，
 *   此处改为可恢复的持久化，避免跳回后丢失支付结果）
 *
 * 支付成功后：清待支付标记 → 重拉会员/配额/订单 → 同步 localStorage.user 的
 * 会员字段（编辑器 VIP 门控读该字段，不刷新会出现「已开通仍被拦截」）。
 */
import { computed, onUnmounted, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import {
  billingControllerApplyRefund,
  billingControllerCreateOrder,
  billingControllerGetOrders,
  billingControllerQueryOrder,
  billingControllerRepayOrder,
  projectControllerGetStorageQuota,
  usersControllerGetProfile,
  vipControllerGetActiveDurations,
  vipControllerGetActiveTiers,
  vipControllerGetRegistry,
} from '@cloudcad/api-sdk/sdk.gen'
import { useUser } from './useUser'
import { t } from '@/languages'
import {
  type BillingOrder,
  type ConfigRegistryEntry,
  type DurationPricing,
  type MembershipLike,
  type MobileTradeType,
  type OrdersPage,
  type QuotaInfo,
  type VipTier,
  clearPendingPayment,
  loadPendingPayment,
  pickTradeType,
  savePendingPayment,
  sortDurations,
  sortTiers,
} from '@/utils/billing'

/** 查单轮询间隔与上限（5s × 120 = 10 分钟，与 PC WechatPayButton 一致） */
const POLL_INTERVAL_MS = 5000
const POLL_MAX_ATTEMPTS = 120
const ORDERS_PAGE_SIZE = 20
/** 支付二维码渲染边长（rem 化前的 px，postcss 不处理 canvas 尺寸） */
const QR_SIZE_PX = 200

/** 支付流程阶段：idle 未开始 / creating 下单中 / qr 扫码等待 /
 *  awaiting MWEB 跳回后等待结果 / success 已支付 / error 失败 */
export type PayPhase = 'idle' | 'creating' | 'qr' | 'awaiting' | 'success' | 'error'

/** 把 SDK 的 error 字段统一成带后端 message 的 Error */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  const raw = err as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return new Error(raw.message)
  return new Error(String(err))
}

function unwrap<T>(res: { error?: unknown; data?: unknown }): T {
  if (res.error) throw toError(res.error)
  return (res.data ?? {}) as T
}

/** 后端随 Accept-Language 返回 i18n 文案，直接透传 */
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  const raw = e as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return raw.message
  return fallback
}

/** 支付成功后同步会员字段到 localStorage.user（VIP 门控的数据源） */
function syncMembershipToLocalUser(profile: MembershipLike): void {
  let base: Record<string, unknown> = {}
  try {
    const raw = localStorage.getItem('user')
    if (raw) base = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return
  }
  if (!Object.keys(base).length) return
  for (const key of [
    'membershipTierLevel',
    'membershipTier',
    'membershipExpiresAt',
    'isVip',
  ] as const) {
    if (key in profile) base[key] = profile[key]
  }
  try {
    localStorage.setItem('user', JSON.stringify(base))
  } catch {
    return
  }
  useUser().refresh()
}

/** 生成支付二维码 dataURL；失败返回空串（页面据此提示下单失败） */
async function toQrDataUrl(codeUrl: string): Promise<string> {
  try {
    return await QRCode.toDataURL(codeUrl, {
      width: QR_SIZE_PX,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  } catch {
    return ''
  }
}

export function useMemberCenter() {
  const loading = ref(false)
  const loadError = ref('')
  const membership = ref<MembershipLike>({})
  const tiers = ref<VipTier[]>([])
  const durations = ref<DurationPricing[]>([])
  const quota = ref<QuotaInfo | null>(null)
  const registry = shallowRef<Map<string, ConfigRegistryEntry>>(new Map())
  const orders = ref<BillingOrder[]>([])
  const ordersLoading = ref(false)
  const ordersTotal = ref(0)
  const ordersHasMore = ref(false)
  const ordersPage = ref(1)

  const payPhase = ref<PayPhase>('idle')
  const payOrder = ref<BillingOrder | null>(null)
  const payError = ref('')
  const payQrDataUrl = ref('')

  /** 当前会员等级对应的配额配置（权益页展示当前值） */
  const currentConfigs = computed<Record<string, unknown>>(() => {
    const level = membership.value.membershipTierLevel ?? 0
    return tiers.value.find((t) => t.level === level)?.configs ?? {}
  })

  /** 剩余天数：永久会员返回 null（页面显示「永久有效」） */
  const daysRemaining = computed<number | null>(() => {
    const raw = membership.value.membershipExpiresAt
    if (!membership.value.isVip || !raw) return null
    const expire = new Date(raw).getTime()
    if (Number.isNaN(expire)) return null
    return Math.ceil((expire - Date.now()) / 86400000)
  })

  /** 调用 SDK 并解包；失败返回 null，各区块独立降级不互相牵连 */
  async function fetchOne<T>(fn: () => Promise<{ error?: unknown; data?: unknown }>): Promise<T | null> {
    try {
      return unwrap<T>(await fn())
    } catch {
      return null
    }
  }

  async function loadAll(): Promise<void> {
    loading.value = true
    loadError.value = ''
    const [profile, tierList, durationList, regEntries, quotaInfo] = await Promise.all([
      fetchOne<MembershipLike>(() => usersControllerGetProfile()),
      fetchOne<VipTier[]>(() => vipControllerGetActiveTiers()),
      fetchOne<DurationPricing[]>(() => vipControllerGetActiveDurations()),
      fetchOne<ConfigRegistryEntry[]>(() => vipControllerGetRegistry()),
      fetchOne<QuotaInfo>(() => projectControllerGetStorageQuota()),
    ])
    if (profile) {
      membership.value = profile
    } else {
      loadError.value = t('加载失败，请重试')
    }
    if (tierList) tiers.value = sortTiers(tierList)
    if (durationList) durations.value = sortDurations(durationList)
    if (regEntries) registry.value = new Map(regEntries.map((e) => [e.key, e]))
    if (quotaInfo) quota.value = quotaInfo
    loading.value = false
  }

  async function loadOrders(reset = true): Promise<void> {
    ordersLoading.value = true
    if (reset) ordersPage.value = 1
    try {
      const page = unwrap<OrdersPage>(
        await billingControllerGetOrders({
          query: { page: ordersPage.value, limit: ORDERS_PAGE_SIZE },
        }),
      )
      orders.value = reset ? page.items : [...orders.value, ...page.items]
      ordersTotal.value = page.total
      ordersHasMore.value = orders.value.length < page.total
    } catch {
      // 订单加载失败不阻塞会员状态展示
    } finally {
      ordersLoading.value = false
    }
  }

  async function loadMoreOrders(): Promise<void> {
    if (!ordersHasMore.value || ordersLoading.value) return
    ordersPage.value += 1
    await loadOrders(false)
  }

  // ==================== 支付 ====================

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollCount = 0

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startPolling(orderNo: string): void {
    stopPolling()
    pollCount = 0
    pollTimer = setInterval(async () => {
      pollCount += 1
      if (pollCount > POLL_MAX_ATTEMPTS) {
        stopPolling()
        return
      }
      try {
        const order = unwrap<BillingOrder>(
          await billingControllerQueryOrder({ path: { orderNo } }),
        )
        if (order.status === 'SUCCEEDED') await handlePaid(order)
      } catch {
        // 单次失败继续轮询
      }
    }, POLL_INTERVAL_MS)
  }

  async function handlePaid(order: BillingOrder): Promise<void> {
    stopPolling()
    clearPendingPayment()
    payOrder.value = order
    payPhase.value = 'success'
    payError.value = ''
    await Promise.allSettled([loadAll(), loadOrders(true)])
    syncMembershipToLocalUser(membership.value)
  }

  /** 下单并进入支付态；MWEB 返回后整页跳走，跳回由 resumePending 恢复 */
  async function startPayment(tier: VipTier, duration: DurationPricing): Promise<void> {
    if (payPhase.value === 'creating') return
    payPhase.value = 'creating'
    payError.value = ''
    payQrDataUrl.value = ''
    const tradeType = pickTradeType()
    try {
      const order = unwrap<BillingOrder>(
        await billingControllerCreateOrder({
          body: {
            vipTierId: tier.id,
            durationPricingId: duration.id,
            tradeType,
            redirectUrl: mwebReturnUrl(),
          },
        }),
      )
      await applyOrder(order, tradeType)
    } catch (e) {
      payPhase.value = 'error'
      payError.value = errMsg(e, '下单失败，请重试')
    }
  }

  /** 续付待支付订单（后端 2 小时 PENDING 复用逻辑） */
  async function repay(order: BillingOrder): Promise<void> {
    if (payPhase.value === 'creating') return
    payPhase.value = 'creating'
    payError.value = ''
    payQrDataUrl.value = ''
    const tradeType = pickTradeType()
    try {
      const result = unwrap<BillingOrder>(
        await billingControllerRepayOrder({
          path: { orderNo: order.orderNo },
          body: { tradeType, redirectUrl: mwebReturnUrl() },
        }),
      )
      await applyOrder(result, tradeType)
    } catch (e) {
      payPhase.value = 'error'
      payError.value = errMsg(e, '续付失败，请重试')
    }
  }

  /** 统一处理下单/续付响应，分流二维码、MWEB 跳转与终态 */
  async function applyOrder(order: BillingOrder, tradeType: MobileTradeType): Promise<void> {
    payOrder.value = order
    // 后端查单对账后可能直接返回终态（微信侧已支付但回调丢失）
    if (order.status === 'SUCCEEDED') {
      await handlePaid(order)
      return
    }
    if (order.status !== 'PENDING') {
      payPhase.value = 'error'
      payError.value = '订单状态已变更，请重新下单'
      return
    }
    savePendingPayment({
      orderNo: order.orderNo,
      vipTierName: order.vipTierName,
      durationLabel: order.durationLabel,
      priceYuan: order.priceYuan,
      tradeType,
    })
    if (order.redirectUrl && !order.codeUrl) {
      // MWEB：先把待支付上下文落盘再跳走，跳回后据此恢复
      startPolling(order.orderNo)
      payPhase.value = 'awaiting'
      window.location.href = order.redirectUrl
      return
    }
    payPhase.value = 'qr'
    payQrDataUrl.value = order.codeUrl ? await toQrDataUrl(order.codeUrl) : ''
    startPolling(order.orderNo)
  }

  /** MWEB 跳回后恢复待支付上下文（页面 onMounted 调用） */
  function resumePending(): boolean {
    const pending = loadPendingPayment()
    if (!pending) return false
    payOrder.value = {
      id: pending.orderNo,
      orderNo: pending.orderNo,
      vipTierId: null,
      months: null,
      amount: Math.round(pending.priceYuan * 100),
      status: 'PENDING',
      gateway: '',
      gatewayOrderId: null,
      vipTierName: pending.vipTierName,
      durationLabel: pending.durationLabel,
      priceYuan: pending.priceYuan,
      createdAt: '',
    }
    payPhase.value = 'awaiting'
    startPolling(pending.orderNo)
    return true
  }

  /** MWEB 回跳地址：移动端当前页面（hash 路由下含完整路由） */
  function mwebReturnUrl(): string {
    return typeof window === 'undefined' ? '' : window.location.href
  }

  /** 用户点「我已支付」：主动查单确认结果 */
  async function confirmPaid(): Promise<void> {
    const order = payOrder.value
    if (!order) return
    try {
      const latest = unwrap<BillingOrder>(
        await billingControllerQueryOrder({ path: { orderNo: order.orderNo } }),
      )
      if (latest.status === 'SUCCEEDED') {
        await handlePaid(latest)
        return
      }
      if (latest.status === 'PENDING') {
        payPhase.value = 'awaiting'
        startPolling(latest.orderNo)
        return
      }
      clearPendingPayment()
      payPhase.value = 'error'
      payError.value = '订单已关闭或超时，请重新下单'
    } catch (e) {
      payPhase.value = 'error'
      payError.value = errMsg(e, '查询支付结果失败，请重试')
    }
  }

  /** 取消当前支付（不关单，2 小时内可续付） */
  function cancelPayment(): void {
    stopPolling()
    payPhase.value = 'idle'
    payOrder.value = null
    payError.value = ''
    payQrDataUrl.value = ''
  }

  /** 申请退款（含被驳回后重申，后端按订单号新建申请）；失败返回 false */
  async function applyRefund(order: BillingOrder, reason: string): Promise<boolean> {
    try {
      await billingControllerApplyRefund({
        path: { orderNo: order.orderNo },
        body: { reason },
      })
      await loadOrders(true)
      return true
    } catch {
      return false
    }
  }

  onUnmounted(stopPolling)

  return {
    loading,
    loadError,
    membership,
    tiers,
    durations,
    quota,
    registry,
    orders,
    ordersLoading,
    ordersTotal,
    ordersHasMore,
    currentConfigs,
    daysRemaining,
    payPhase,
    payOrder,
    payError,
    payQrDataUrl,
    loadAll,
    loadOrders,
    loadMoreOrders,
    startPayment,
    repay,
    resumePending,
    confirmPaid,
    cancelPayment,
    applyRefund,
  }
}
