<script setup lang="ts">
/**
 * 子页：会员中心（ADR-0068）—— 会员状态 + 权益 + 档位对比 + 订单 + 套餐支付。
 *
 * 完全替代原「管理会员 → 跳 PC 会员中心」的整页跳转，购买 / 续费 / 升级 /
 * 续付 / 退款全在移动端完成。后端 billing / vip 端点与 PC 同源，无移动端专属
 * 接口；编排见 composables/useMemberCenter.ts，数据契约与纯函数见 utils/billing.ts。
 *
 * 支付形态（按 UA 自动分流，用户无感）：
 *   系统浏览器 → NATIVE 二维码（后端返回 codeUrl，本页渲染成图）
 *   微信内置浏览器 → MWEB H5 支付（整页跳转，跳回后由 resumePending 恢复结果确认）
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showFailToast, showSuccessToast } from 'vant'
import { t } from '@/languages'
import { useMemberCenter } from '@/composables/useMemberCenter'
import { formatSize } from '@/composables/useNodeFormatter'
import {
  type BillingOrder,
  type DurationPricing,
  type RefundApplication,
  type VipTier,
  canApplyRefund,
  canRepay,
  centsToYuan,
  formatDate,
  formatDateTime,
  orderAmountCents,
  resolveQuotaValue,
  usagePercent,
} from '@/utils/billing'

const router = useRouter()

const {
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
} = useMemberCenter()

// ==================== 会员状态 ====================

const currentLevel = computed(() => membership.value.membershipTierLevel ?? 0)
const isVip = computed(() => !!membership.value.isVip && currentLevel.value > 0)

const tierName = computed(() => {
  if (!isVip.value) return t('免费用户')
  return membership.value.membershipTier ?? `VIP${currentLevel.value}`
})

const expiryText = computed(() => {
  if (!isVip.value) return t('开通会员解锁更多权益')
  const raw = membership.value.membershipExpiresAt
  if (!raw) return t('永久有效')
  return `${t('有效期至')} ${formatDate(raw)}`
})

const expiringSoon = computed(() => {
  const days = daysRemaining.value
  return isVip.value && days !== null && days > 0 && days <= 7
})

/** 到期预警文案用的剩余天数（expiringSoon 已保证非空） */
const expiringDays = computed(() => daysRemaining.value ?? 0)

// ==================== 权益 ====================

type QuotaUnit = 'mb' | 'count'

interface BenefitDef {
  key: string
  icon: string
  title: string
  unit: QuotaUnit
  /** 超出/用尽后的后果 */
  boundary: string
  example: string
}

const STATIC_BENEFITS: BenefitDef[] = [
  {
    key: 'quota.personal_storage_mb',
    icon: 'description',
    title: t('个人存储空间'),
    unit: 'mb',
    boundary: t('存储空间用尽后无法上传新图纸，系统提示「存储空间不足」。可升级会员获取更多空间，或删除不需要的文件释放空间。'),
    example: t('示例：免费用户 50MB 空间，已用 45MB，上传 10MB 图纸会被阻止。'),
  },
  {
    key: 'quota.max_projects',
    icon: 'bag-o',
    title: t('项目数量'),
    unit: 'count',
    boundary: t('项目数量达到上限后无法创建新项目，系统提示「项目数量已达上限」。可升级会员获取更多项目额度，或删除不需要的项目。'),
    example: t('示例：免费用户最多 5 个项目，已建 5 个，创建第 6 个时会被阻止。'),
  },
  {
    key: 'quota.project_size_mb',
    icon: 'photograph',
    title: t('单项目存储上限'),
    unit: 'mb',
    boundary: t('单项目达到上限后无法向该项目新增内容（上传图纸、复制文件、外部参照等）。可升级会员提高上限，或清理项目中的旧文件。'),
    example: t('示例：免费用户单项目上限 100MB，项目已有 90MB，再上传 20MB 超出上限会被阻止。'),
  },
]

const conversionHours = computed(() =>
  resolveQuotaValue(currentConfigs.value, 'quota.conversion_window_hours', registry.value) || 2,
)
const conversionCount = computed(() =>
  resolveQuotaValue(currentConfigs.value, 'quota.conversion_window_count', registry.value) || 0,
)

const conversionBenefit = computed<BenefitDef>(() => {
  const hours = conversionHours.value
  const count = conversionCount.value
  const windowText = t('每 {hours} 小时 {count} 次', {
    hours: String(hours),
    count: String(count),
  })
  return {
    key: 'quota.conversion_window_count',
    icon: 'clock-o',
    title: t('图纸转换频率'),
    unit: 'count',
    boundary: isVip.value
      ? t('窗口内转换次数（图纸打开 + 导出下载共用）用尽后系统提示「图纸转换过于频繁，请稍后再试」，{hours} 小时窗口结束后自动恢复。', { hours: String(hours) })
      : t('窗口内图纸打开转换次数用尽后系统提示「图纸转换过于频繁，请稍后再试」，{hours} 小时窗口结束后自动恢复。导出下载为会员专属功能。', { hours: String(hours) }),
    example: isVip.value
      ? t('当前等级 {text}（图纸打开 + 导出下载共用），更高档位的窗口次数更多。', { text: windowText })
      : t('当前等级每 {hours} 小时可打开转换图纸 {count} 次；导出下载（转 PDF/DWG/DXF）为会员专属功能。', { hours: String(hours), count: String(count) }),
  }
})

const benefits = computed<BenefitDef[]>(() => [...STATIC_BENEFITS, conversionBenefit.value])

const expandedBenefit = ref('')
function toggleBenefit(key: string): void {
  expandedBenefit.value = expandedBenefit.value === key ? '' : key
}

function currentValue(key: string): number {
  return resolveQuotaValue(currentConfigs.value, key, registry.value)
}

function formatQuota(value: number, unit: QuotaUnit): string {
  if (unit === 'count') return value > 0 ? `${value} 个` : t('不限')
  if (value >= 1024) {
    const gb = value / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`
  }
  return `${value}MB`
}

/** 档位对比表行（配额键 → 展示标题） */
const compareRows = computed(() => benefits.value.map((b) => ({ key: b.key, title: b.title, unit: b.unit })))

function tierCurrent(tier: VipTier): boolean {
  return isVip.value && tier.level === currentLevel.value
}

const storageUsed = computed(() => (quota.value ? formatSize(quota.value.used) : ''))
const storageTotal = computed(() => (quota.value ? formatSize(quota.value.total) : ''))
const storageRemaining = computed(() => (quota.value ? formatSize(quota.value.remaining) : ''))
const storagePercent = computed(() =>
  quota.value ? usagePercent(quota.value.used, quota.value.total) : 0,
)
const storageColor = computed(() =>
  storagePercent.value > 90
    ? 'var(--van-danger-color)'
    : storagePercent.value > 70
      ? 'var(--van-warning-color)'
      : 'var(--accent)',
)

// ==================== 套餐选择 ====================

const showPlan = ref(false)
const tierId = ref('')
const durationId = ref('')

const selectedTier = computed<VipTier | null>(
  () => tiers.value.find((t) => t.id === tierId.value) ?? null,
)
const selectedDuration = computed<DurationPricing | null>(
  () => durations.value.find((d) => d.id === durationId.value) ?? null,
)

/** 当前等级已包含，选更低档位会被后端拒绝（不能降级购买） */
function isDowngrade(tier: VipTier): boolean {
  return currentLevel.value > 0 && tier.level < currentLevel.value
}

/** 某档位按当前所选时长的合计金额（元） */
function tierTotalYuan(tier: VipTier): string {
  const duration = selectedDuration.value
  if (!duration) return '0.00'
  return centsToYuan(orderAmountCents(tier, duration))
}

const canPay = computed(
  () => !!selectedTier.value && !!selectedDuration.value && !isDowngrade(selectedTier.value!),
)
const totalYuan = computed(() => {
  const tier = selectedTier.value
  const duration = selectedDuration.value
  if (!tier || !duration) return '0.00'
  return centsToYuan(orderAmountCents(tier, duration))
})

/** 折扣文案：multiplier < 1 时显示「省 x%」 */
function discountText(d: DurationPricing): string {
  const pct = Math.round((1 - d.multiplier) * 100)
  return pct > 0 ? t('省 {pct}%', { pct: String(pct) }) : t('原价')
}

function openPlanSheet(): void {
  if (!tierId.value) {
    // 免费用户默认最低付费档；会员默认当前档（续费）
    const target = Math.max(currentLevel.value, 1)
    const pick =
      tiers.value.find((t) => t.level === target) ??
      tiers.value.find((t) => t.level >= currentLevel.value) ??
      tiers.value[0]
    if (pick) tierId.value = pick.id
  }
  if (!durationId.value) durationId.value = durations.value[0]?.id ?? ''
  showPlan.value = true
}

function selectTier(tier: VipTier): void {
  if (isDowngrade(tier)) return
  tierId.value = tier.id
}

// ==================== 支付 ====================

const showPay = ref(false)
const confirming = ref(false)
/** 本轮支付选中的套餐（供失败后重新下单） */
const pendingPlan = ref<{ tier: VipTier; duration: DurationPricing } | null>(null)

function paySummaryText(): string {
  const o = payOrder.value
  if (!o) return ''
  return `${o.vipTierName} · ${o.durationLabel}`
}

function payAmountText(): string {
  return centsToYuan(payOrder.value?.amount ?? 0)
}

async function onPay(): Promise<void> {
  const tier = selectedTier.value
  const duration = selectedDuration.value
  if (!tier || !duration || isDowngrade(tier)) return
  pendingPlan.value = { tier, duration }
  showPlan.value = false
  showPay.value = true
  await startPayment(tier, duration)
}

async function onRepay(order: BillingOrder): Promise<void> {
  pendingPlan.value = null
  showPay.value = true
  await repay(order)
}

async function onConfirmPaid(): Promise<void> {
  confirming.value = true
  try {
    await confirmPaid()
  } finally {
    confirming.value = false
  }
}

function onClosePay(): void {
  cancelPayment()
  showPay.value = false
  pendingPlan.value = null
}

async function onRetryPay(): Promise<void> {
  payPhase.value = 'idle'
  const plan = pendingPlan.value
  if (plan) await startPayment(plan.tier, plan.duration)
  else if (payOrder.value) await repay(payOrder.value)
}

// ==================== 订单 ====================

function latestRefund(order: BillingOrder): RefundApplication | null {
  const apps = order.refundApplications
  return Array.isArray(apps) && apps.length > 0 ? apps[0] : null
}

function statusText(order: BillingOrder): string {
  const refund = latestRefund(order)
  if (order.status === 'SUCCEEDED') {
    if (refund?.status === 'PENDING') return t('退款审核中')
    if (refund?.status === 'REJECTED') return t('退款被驳回')
    return t('已支付')
  }
  if (order.status === 'REFUNDED') return t('已退款')
  if (order.status === 'PENDING') return t('待支付')
  if (order.status === 'FAILED') return t('支付失败')
  if (order.status === 'CLOSED') return t('已关闭')
  if (order.status === 'TIMEOUT') return t('已超时')
  return order.status
}

function statusClass(order: BillingOrder): string {
  if (order.status === 'SUCCEEDED') {
    const refund = latestRefund(order)
    if (refund?.status === 'PENDING') return 'is-warn'
    if (refund?.status === 'REJECTED') return 'is-warn'
    return 'is-ok'
  }
  if (order.status === 'PENDING') return 'is-warn'
  return 'is-muted'
}

function refundNote(order: BillingOrder): string {
  const refund = latestRefund(order)
  if (!refund) return ''
  if (refund.status === 'PENDING') return t('退款申请审核中，请耐心等待')
  if (refund.status === 'REJECTED') {
    return refund.reviewNote ? `${t('驳回原因')}：${refund.reviewNote}` : t('退款申请被驳回，可重新申请')
  }
  return t('退款已处理')
}

function refundAction(order: BillingOrder): string {
  const refund = latestRefund(order)
  return refund?.status === 'REJECTED' ? t('重新申请退款') : t('申请退款')
}

/** 退款弹窗标题（首次申请 / 驳回后重申） */
const refundTitle = computed(() =>
  refundTarget.value && latestRefund(refundTarget.value)?.status === 'REJECTED'
    ? t('重新申请退款')
    : t('申请退款'),
)

// ==================== 退款 ====================

const showRefund = ref(false)
const refundTarget = ref<BillingOrder | null>(null)
const refundReason = ref('')
const refunding = ref(false)

function onRefund(order: BillingOrder): void {
  refundTarget.value = order
  refundReason.value = ''
  showRefund.value = true
}

async function onSubmitRefund(): Promise<void> {
  const target = refundTarget.value
  const reason = refundReason.value.trim()
  if (!target || !reason || refunding.value) return
  refunding.value = true
  try {
    const ok = await applyRefund(target, reason)
    if (ok) {
      showRefund.value = false
      showSuccessToast(t('退款申请已提交'))
    } else {
      showFailToast(t('退款申请提交失败，请重试'))
    }
  } finally {
    refunding.value = false
  }
}

// ==================== 页面操作 ====================

/** 首屏加载中：会员数据尚未返回 */
const initialLoading = computed(
  () => loading.value && Object.keys(membership.value).length === 0,
)
const fatal = computed(() => !!loadError.value && tiers.value.length === 0)

function onBack(): void {
  router.back()
}

async function onRefresh(): Promise<void> {
  await Promise.all([loadAll(), loadOrders(true)])
  showSuccessToast(t('已刷新'))
}

async function onLoadMore(): Promise<void> {
  await loadMoreOrders()
}

onMounted(async () => {
  resumePending()
  await Promise.all([loadAll(), loadOrders(true)])
})
</script>

<template>
  <div class="subpage member-page">
    <van-nav-bar :title="t('会员中心')" left-arrow @click-left="onBack" @click-right="onRefresh">
      <template #right>
        <van-icon name="replay" size="18" :class="{ 'is-spinning': loading }" />
      </template>
    </van-nav-bar>

    <div v-if="initialLoading" class="loading-state">
      <van-loading size="32" />
    </div>

    <div v-else-if="fatal" class="error-state">
      <p class="error-text">{{ loadError }}</p>
      <van-button size="small" @click="onRefresh">{{ t('重试') }}</van-button>
    </div>

    <div v-else class="member-scroll">
      <!-- ═══ 会员状态卡 ═══ -->
      <div class="vip-card">
        <div class="vip-card-top">
          <div class="vip-card-main">
            <van-icon name="vip-card" class="vip-card-icon" />
            <div class="vip-card-text">
              <div class="vip-card-title">{{ tierName }}</div>
              <div class="vip-card-sub">{{ expiryText }}</div>
            </div>
          </div>
          <div v-if="isVip" class="vip-badge">VIP{{ currentLevel }}</div>
        </div>

        <div v-if="expiringSoon" class="vip-warning">
          <van-icon name="warning-o" size="14" />
          <span>{{ t('会员即将到期，剩余 {days} 天，请及时续费', { days: String(expiringDays) }) }}</span>
        </div>

        <div class="vip-actions">
          <template v-if="!isVip">
            <van-button
              class="vip-btn primary"
              block
              :disabled="tiers.length === 0 || durations.length === 0"
              @click="openPlanSheet"
            >
              {{ t('立即开通会员') }}
            </van-button>
          </template>
          <template v-else>
            <van-button
              class="vip-btn"
              :disabled="tiers.length === 0 || durations.length === 0"
              @click="openPlanSheet"
            >
              {{ t('续费') }}
            </van-button>
            <van-button
              class="vip-btn primary"
              :disabled="tiers.length === 0 || durations.length === 0"
              @click="openPlanSheet"
            >
              {{ t('升级') }}
            </van-button>
          </template>
        </div>

        <p v-if="tiers.length === 0" class="vip-hint">{{ t('暂无可购买的会员档位，请联系管理员') }}</p>
      </div>

      <!-- ═══ 会员权益 ═══ -->
      <div class="section">
        <div class="section-title">{{ t('会员权益') }}</div>
        <div v-for="benefit in benefits" :key="benefit.key" class="benefit">
          <div class="benefit-head" @click="toggleBenefit(benefit.key)">
            <van-icon :name="benefit.icon" class="benefit-icon" />
            <span class="benefit-title">{{ benefit.title }}</span>
            <span class="benefit-value">{{ formatQuota(currentValue(benefit.key), benefit.unit) }}</span>
            <van-icon name="arrow-down" class="benefit-arrow" :class="{ 'is-open': expandedBenefit === benefit.key }" />
          </div>

          <div v-if="benefit.key === 'quota.personal_storage_mb' && quota" class="benefit-progress">
            <div class="storage-line">
              <span>{{ t('已用 {size}', { size: storageUsed }) }}</span>
              <span>{{ t('总计 {size}', { size: storageTotal }) }}</span>
            </div>
            <div class="storage-track">
              <div class="storage-fill" :style="{ width: storagePercent + '%', background: storageColor }" />
            </div>
            <div class="storage-line">
              <span>{{ t('剩余 {size}', { size: storageRemaining }) }}</span>
              <span>{{ t('使用率 {pct}%', { pct: storagePercent.toFixed(1) }) }}</span>
            </div>
          </div>

          <div v-if="expandedBenefit === benefit.key" class="benefit-detail">
            <p>{{ benefit.boundary }}</p>
            <p class="benefit-example">{{ benefit.example }}</p>
          </div>
        </div>
      </div>

      <!-- ═══ 档位对比 ═══ -->
      <div v-if="tiers.length > 0" class="section">
        <div class="section-title">{{ t('档位对比') }}</div>
        <div class="compare-wrap">
          <div class="compare-table" :style="{ gridTemplateColumns: `110px repeat(${tiers.length}, minmax(72px, 1fr))` }">
            <div class="compare-row head">
              <div class="compare-label" />
              <div
                v-for="tier in tiers"
                :key="tier.id"
                class="compare-cell"
                :class="{ 'is-current': tierCurrent(tier) }"
              >
                {{ tier.name }}
              </div>
            </div>
            <div v-for="row in compareRows" :key="row.key" class="compare-row">
              <div class="compare-label">{{ row.title }}</div>
              <div
                v-for="tier in tiers"
                :key="`${tier.id}-${row.key}`"
                class="compare-cell"
                :class="{ 'is-current': tierCurrent(tier) }"
              >
                {{ formatQuota(resolveQuotaValue(tier.configs, row.key, registry), row.unit) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ 订单记录 ═══ -->
      <div class="section">
        <div class="section-title">
          <span>{{ t('订单记录') }}</span>
          <span class="section-sub">{{ ordersTotal }}</span>
        </div>

        <div v-if="orders.length === 0 && !ordersLoading" class="empty-hint">
          {{ t('暂无订单记录') }}
        </div>

        <div v-for="order in orders" :key="order.id" class="order-item">
          <div class="order-main">
            <div class="order-title">{{ order.vipTierName }} · {{ order.durationLabel }}</div>
            <div class="order-meta">
              <span>{{ formatDateTime(order.createdAt) }}</span>
              <span>{{ order.orderNo }}</span>
            </div>
          </div>
          <div class="order-side">
            <div class="order-price">¥{{ centsToYuan(order.amount) }}</div>
            <span class="order-status" :class="statusClass(order)">{{ statusText(order) }}</span>
          </div>

          <p v-if="refundNote(order)" class="order-note">{{ refundNote(order) }}</p>

          <div v-if="canRepay(order) || canApplyRefund(order)" class="order-actions">
            <van-button
              v-if="canRepay(order)"
              size="small"
              type="primary"
              @click="onRepay(order)"
            >
              {{ t('去支付') }}
            </van-button>
            <van-button
              v-else-if="canApplyRefund(order)"
              size="small"
              plain
              @click="onRefund(order)"
            >
              {{ refundAction(order) }}
            </van-button>
          </div>
        </div>

        <button v-if="ordersHasMore" class="more-btn" :disabled="ordersLoading" @click="onLoadMore">
          {{ ordersLoading ? t('加载中...') : t('加载更多') }}
        </button>
      </div>
    </div>

    <!-- ═══ 套餐选择 ═══ -->
    <van-popup v-model:show="showPlan" position="bottom" round :style="{ height: '92%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showPlan = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('选择套餐') }}</span>
          <span class="panel-spacer" />
        </div>

        <div class="panel-body">
          <van-loading v-if="tiers.length === 0" size="28" />

          <template v-else>
            <div class="plan-block-title">{{ t('购买时长') }}</div>
            <div class="duration-row">
              <div
                v-for="d in durations"
                :key="d.id"
                class="duration-chip"
                :class="{ 'is-active': durationId === d.id }"
                @click="durationId = d.id"
              >
                <div class="duration-chip-label">{{ d.label }}</div>
                <div v-if="d.multiplier < 1" class="duration-chip-tag">{{ discountText(d) }}</div>
              </div>
            </div>

            <div class="plan-block-title">{{ t('会员档位') }}</div>
            <div
              v-for="tier in tiers"
              :key="tier.id"
              class="plan-card"
              :class="{ 'is-active': tierId === tier.id, 'is-disabled': isDowngrade(tier) }"
              @click="selectTier(tier)"
            >
              <div class="plan-card-main">
                <div class="plan-card-name">{{ tier.name }}</div>
                <div class="plan-card-price">
                  ¥{{ tier.baseMonthlyPriceYuan.toFixed(2) }}
                  <span class="plan-card-unit">{{ t('/月') }}</span>
                </div>
              </div>
              <div class="plan-card-total">¥{{ tierTotalYuan(tier) }}</div>
              <van-icon v-if="tierId === tier.id" name="passed" class="plan-card-check" />
              <p v-if="isDowngrade(tier)" class="plan-card-hint">{{ t('当前等级已包含，不可降级购买') }}</p>
            </div>

            <p v-if="durations.length === 0" class="plan-empty">{{ t('暂无可购买的时长选项，请联系管理员') }}</p>
          </template>
        </div>

        <div class="panel-footer">
          <div class="plan-total">
            <span>{{ t('应付金额') }}</span>
            <span class="plan-total-price">¥{{ totalYuan }}</span>
          </div>
          <van-button
            class="primary-btn"
            block
            :disabled="!canPay"
            :loading="payPhase === 'creating'"
            @click="onPay"
          >
            {{ t('去支付') }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- ═══ 支付 ═══ -->
    <van-popup
      v-model:show="showPay"
      position="bottom"
      round
      :style="{ height: '76%' }"
      :close-on-click-overlay="false"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="onClosePay">{{ t('关闭') }}</button>
          <span class="panel-title">{{ t('微信支付') }}</span>
          <span class="panel-spacer" />
        </div>

        <div class="panel-body pay-body">
          <div class="pay-summary">
            <div class="pay-summary-text">{{ paySummaryText() }}</div>
            <div class="pay-summary-price">¥{{ payAmountText() }}</div>
          </div>

          <div v-if="payPhase === 'creating'" class="pay-center">
            <van-loading size="32" />
            <p class="pay-hint">{{ t('正在创建订单...') }}</p>
          </div>

          <template v-else-if="payPhase === 'qr'">
            <div class="pay-qr-wrap">
              <img v-if="payQrDataUrl" :src="payQrDataUrl" class="pay-qr" :alt="t('支付二维码')" />
              <van-loading v-else size="28" />
            </div>
            <p class="pay-hint">{{ t('请使用微信扫一扫上方二维码完成支付') }}</p>
            <p v-if="!payQrDataUrl" class="pay-error-text">{{ t('二维码生成失败，请关闭后重试') }}</p>
          </template>

          <template v-else-if="payPhase === 'awaiting'">
            <div class="pay-center">
              <van-loading size="32" />
              <p class="pay-hint">{{ t('等待支付结果中，完成后会自动更新') }}</p>
              <p class="pay-hint">{{ t('如已完成支付，点击下方按钮立即查询') }}</p>
            </div>
            <van-button class="pay-confirm" block :loading="confirming" @click="onConfirmPaid">
              {{ t('我已支付') }}
            </van-button>
          </template>

          <template v-else-if="payPhase === 'success'">
            <div class="pay-center">
              <van-icon name="passed" class="pay-result-icon pay-result-ok" />
              <div class="pay-result-title">{{ t('支付成功') }}</div>
              <p class="pay-hint">{{ t('会员已开通，权益立即生效') }}</p>
            </div>
            <van-button class="primary-btn" block @click="showPay = false">{{ t('完成') }}</van-button>
          </template>

          <template v-else-if="payPhase === 'error'">
            <div class="pay-center">
              <van-icon name="warning-o" class="pay-result-icon pay-result-err" />
              <p class="pay-error-text">{{ payError }}</p>
            </div>
            <van-button class="primary-btn" block @click="onRetryPay">{{ t('重新下单') }}</van-button>
          </template>
        </div>
      </div>
    </van-popup>

    <!-- ═══ 申请退款 ═══ -->
    <van-popup v-model:show="showRefund" position="bottom" round :style="{ height: '46%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showRefund = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ refundTitle }}</span>
          <span class="panel-spacer" />
        </div>
        <div class="panel-body">
          <div v-if="refundTarget" class="refund-order">
            <span>{{ refundTarget.vipTierName }} · {{ refundTarget.durationLabel }}</span>
            <span class="refund-order-price">¥{{ centsToYuan(refundTarget.amount) }}</span>
          </div>
          <van-field
            v-model="refundReason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :label="t('退款原因')"
            :placeholder="t('请填写退款原因（必填，最多 500 字）')"
          />
          <p class="refund-tip">{{ t('退款申请需人工审核，审核通过后原路退回') }}</p>
        </div>
        <div class="panel-footer">
          <van-button
            class="primary-btn danger"
            block
            :loading="refunding"
            :disabled="!refundReason.trim()"
            @click="onSubmitRefund"
          >
            {{ t('提交申请') }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped lang="scss">
.subpage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* .subpage 自身 overflow:hidden 不滚动，须由内部容器提供滚动区（同 .profile-scroll） */
.member-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 24px;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.error-text {
  font-size: 13px;
  color: var(--danger);
}

.is-spinning {
  animation: member-spin 0.9s linear infinite;
}

@keyframes member-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 会员状态卡 ── */
.vip-card {
  margin: 12px;
  padding: 20px 16px 16px;
  border-radius: 12px;
  background: linear-gradient(150deg, var(--accent) 0%, var(--accent-dark) 100%);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 169, 158, 0.24);
}

.vip-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vip-card-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.vip-card-icon {
  font-size: 30px;
  flex-shrink: 0;
  opacity: 0.92;
}

.vip-card-text {
  min-width: 0;
}

.vip-card-title {
  font-size: 19px;
  font-weight: 600;
  line-height: 1.3;
}

.vip-card-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.8;
}

.vip-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.32);
  font-size: 12px;
  font-weight: 600;
}

.vip-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 12px;
}

.vip-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.vip-btn {
  flex: 1;
  border-radius: 8px;
  height: 40px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: #ffffff;
  font-size: 14px;

  &.primary {
    background: #ffffff;
    color: var(--accent);
    border-color: #ffffff;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.vip-hint {
  margin: 12px 0 0;
  font-size: 12px;
  opacity: 0.76;
  text-align: center;
}

/* ── 通用分区 ── */
.section {
  margin: 0 12px 12px;
  padding: 16px 14px;
  border-radius: 12px;
  background: var(--bg-secondary);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.section-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.empty-hint {
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ── 权益 ── */
.benefit {
  padding: 12px 0;
  border-top: 0.5px solid var(--divider);

  &:first-of-type {
    border-top: none;
    padding-top: 4px;
  }

  &:last-of-type {
    padding-bottom: 4px;
  }
}

.benefit-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.benefit-icon {
  font-size: 18px;
  color: var(--accent);
  flex-shrink: 0;
}

.benefit-title {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.benefit-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.benefit-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
  transition: transform 0.2s;

  &.is-open {
    transform: rotate(180deg);
  }
}

.benefit-detail {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);

  p {
    margin: 0;

    + p {
      margin-top: 6px;
    }
  }
}

.benefit-example {
  color: var(--text-tertiary);
}

.benefit-progress {
  margin-top: 10px;
}

.storage-line {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-tertiary);

  & + .storage-track {
    margin: 6px 0;
  }
}

.storage-track {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  overflow: hidden;
}

.storage-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}

/* ── 档位对比 ── */
.compare-wrap {
  overflow-x: auto;
}

.compare-table {
  display: grid;
  width: 100%;
  min-width: 320px;
  border-radius: 8px;
  overflow: hidden;
  border: 0.5px solid var(--divider);
}

.compare-row {
  display: contents;
}

.compare-label,
.compare-cell {
  padding: 10px 8px;
  text-align: center;
  font-size: 12px;
  border-bottom: 0.5px solid var(--divider);
}

.compare-label {
  text-align: left;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.compare-cell {
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.compare-row.head .compare-cell {
  color: var(--text-primary);
  font-weight: 600;
}

.compare-cell.is-current {
  color: var(--accent);
  background: rgba(0, 169, 158, 0.1);
}

.compare-row:last-child .compare-cell,
.compare-row:last-child .compare-label {
  border-bottom: none;
}

/* ── 订单 ── */
.order-item {
  padding: 12px 0;
  border-top: 0.5px solid var(--divider);

  &:first-of-type {
    border-top: none;
    padding-top: 4px;
  }
}

.order-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.order-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.order-price {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.order-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);

  &.is-ok {
    color: var(--accent);
    background: rgba(0, 169, 158, 0.12);
  }

  &.is-warn {
    color: var(--van-warning-color);
    background: rgba(255, 151, 106, 0.12);
  }
}

.order-meta {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.order-note {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  font-size: 12px;
  color: var(--text-secondary);
}

.order-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.more-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px 0;
  border: 0.5px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 13px;

  &:disabled {
    opacity: 0.5;
  }
}

/* ── 底部弹窗 ── */
.form-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.panel-header {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  border-bottom: 0.5px solid var(--divider);
  flex-shrink: 0;
}

.panel-cancel {
  border: none;
  background: none;
  color: var(--text-tertiary);
  font-size: 14px;
  padding: 6px 4px;
}

.panel-title {
  flex: 1;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 30px;
}

.panel-spacer {
  width: 30px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.panel-footer {
  flex-shrink: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 0.5px solid var(--divider);
}

.primary-btn {
  border-radius: 8px;
  height: 44px;
  font-size: 15px;

  &.danger {
    background: var(--van-danger-color);
    border-color: var(--van-danger-color);
    color: #ffffff;
  }
}

/* ── 套餐选择 ── */
.plan-block-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;

  + .duration-row {
    margin-bottom: 20px;
  }
}

.duration-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 8px;
}

.duration-chip {
  position: relative;
  padding: 10px 8px;
  border-radius: 8px;
  border: 0.5px solid var(--divider);
  background: var(--bg-tertiary);
  text-align: center;
  cursor: pointer;

  &.is-active {
    border-color: var(--accent);
    background: rgba(0, 169, 158, 0.1);
  }
}

.duration-chip-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.duration-chip-tag {
  margin-top: 2px;
  font-size: 11px;
  color: var(--accent);
}

.plan-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  margin-bottom: 10px;
  border-radius: 10px;
  border: 0.5px solid var(--divider);
  background: var(--bg-tertiary);
  cursor: pointer;

  &.is-active {
    border-color: var(--accent);
    background: rgba(0, 169, 158, 0.1);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.plan-card-main {
  flex: 1;
  min-width: 0;
}

.plan-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.plan-card-price {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
}

.plan-card-unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.plan-card-total {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}

.plan-card-check {
  font-size: 18px;
  color: var(--accent);
  flex-shrink: 0;
}

.plan-card-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  margin: 0;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.plan-empty {
  padding: 16px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.plan-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.plan-total-price {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}

/* ── 支付 ── */
.pay-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.pay-summary {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  text-align: center;
}

.pay-summary-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.pay-summary-price {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.pay-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
}

.pay-qr-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: 12px;
  background: #ffffff;
}

.pay-qr {
  display: block;
}

.pay-hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.pay-error-text {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 68, 68, 0.1);
  font-size: 13px;
  line-height: 1.6;
  color: var(--van-danger-color);
  word-break: break-word;
}

.pay-confirm {
  width: 100%;
  border-radius: 8px;
  height: 44px;
  font-size: 15px;
}

.pay-result-icon {
  font-size: 44px;
}

.pay-result-ok {
  color: var(--accent);
}

.pay-result-err {
  color: var(--van-danger-color);
}

.pay-result-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ── 退款 ── */
.refund-order {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  font-size: 13px;
  color: var(--text-secondary);
}

.refund-order-price {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.refund-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
