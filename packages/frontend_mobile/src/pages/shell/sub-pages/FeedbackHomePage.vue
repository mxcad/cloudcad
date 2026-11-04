<script setup lang="ts">
/**
 * 反馈中心（移动端主页面，公开路由）。
 *
 * 未登录：展示「提交反馈」+「查询进度」两个主入口 + 匿名奖励规则提示
 * （匿名可提交，但奖励须联系客服认领）。
 * 已登录：Tabs「我的反馈 / 我的奖励」+ 提交 FAB + 查询进度入口。
 *
 * 数据源：feedbackControllerListMine（分页）/ feedbackControllerListMineRewards（全量）。
 * 对齐 PC FeedbackMinePage + FeedbackSubmitModal 同源同语义。
 */
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  feedbackControllerListMine,
  feedbackControllerListMineRewards,
} from '@cloudcad/api-sdk/sdk.gen'
import type {
  FeedbackResponseDto,
  FeedbackRewardResponseDto,
} from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { fillTemplate } from '@/utils/i18nFill'
import { errMsg, unwrap } from '@/utils/apiError'
import { copyText } from '@/utils/clipboard'
import { stripHtmlTags } from '@/utils/richtext'
import { getLocalFeedbackRecords } from '@/utils/feedbackLocalRecords'
import { backOrFallback } from '@/utils/backNavigation'
import { isNearScrollBottom } from '@/utils/scroll'
import { useUser } from '@/composables/useUser'
import { usePagedState, type PagedItems } from '@/composables/usePagedState'
import FeedbackSubmitSheet from '@/components/FeedbackSubmitSheet.vue'
import FeedbackAttachmentDisplay from '@/components/FeedbackAttachmentDisplay.vue'
import FeedbackDetailSheet, {
  type FeedbackDetail,
} from '@/components/FeedbackDetailSheet.vue'
import {
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  REWARD_STATUS_MAP,
  statusColor,
  statusBg,
  formatTime,
} from '@/constants/feedback'

const router = useRouter()
const { isAuthenticated } = useUser()

const tab = ref<'feedback' | 'reward'>('feedback')
const showSubmit = ref(false)

// ── 我的反馈（分页）──
const FEEDBACK_PAGE_SIZE = 20
const feedbackPaged = usePagedState<FeedbackResponseDto>({
  onError: () => t('加载失败'),
})
const { items: feedbackItems, loading, error, hasMore, loadMoreFailed } = feedbackPaged
const listError = computed(() => (feedbackPaged.page.value === 1 ? error.value : ''))

async function fetchFeedbackPage(pageNo: number): Promise<PagedItems<FeedbackResponseDto>> {
  const res = await feedbackControllerListMine({
    query: { page: pageNo, pageSize: FEEDBACK_PAGE_SIZE },
  })
  unwrap(res)
  const d = (res.data ?? {}) as { items?: FeedbackResponseDto[]; total?: number }
  const items = d.items ?? []
  const total = d.total ?? 0
  return { items, total, totalPages: Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE)) }
}

async function loadFeedback() {
  feedbackPaged.resetToFirstPage()
  await feedbackPaged.load(fetchFeedbackPage)
}

function loadMoreFeedback() {
  feedbackPaged.loadMore(fetchFeedbackPage)
}

function retryLoadMore() {
  feedbackPaged.retryLoadMore(fetchFeedbackPage)
}

function onListScroll(e: Event) {
  const el = e.target as HTMLElement
  if (isNearScrollBottom(el)) loadMoreFeedback()
}

// ── 本地反馈记录（localStorage；未登录仅本地，已登录与云列表按 code 去重）──
const localRecords = ref(getLocalFeedbackRecords())
const cloudCodes = computed(() => new Set(feedbackItems.value.map((f) => f.feedbackCode)))
const localOnlyRecords = computed(() =>
  localRecords.value.filter((r) => !cloudCodes.value.has(r.code))
)

// ── 我的奖励（全量）──
const rewards = ref<FeedbackRewardResponseDto[]>([])
const rewardsLoading = ref(false)
const rewardsError = ref('')

async function loadRewards() {
  rewardsLoading.value = true
  rewardsError.value = ''
  try {
    const res = await feedbackControllerListMineRewards()
    unwrap(res)
    const d = (res.data ?? {}) as { items?: FeedbackRewardResponseDto[] }
    rewards.value = d.items ?? []
  } catch (e) {
    rewardsError.value = errMsg(e, t('加载失败'))
  } finally {
    rewardsLoading.value = false
  }
}

// 切 tab 或登录态变化时加载
watch(tab, (v) => {
  if (v === 'feedback') void loadFeedback()
  else void loadRewards()
})
watch(isAuthenticated, (authed) => {
  if (authed) void loadFeedback()
})

// 已登录直接导航进反馈中心时，两个 watch 都不触发（tab 无变化 / isAuthenticated 已为 true），
// 须补一次初始加载，否则云端列表恒空（对齐 PC FeedbackMinePage 挂载即加载语义）。
onMounted(() => {
  if (!isAuthenticated.value) return
  if (tab.value === 'feedback') void loadFeedback()
  else void loadRewards()
})

// ── 查询码复制 ──
const copiedKey = ref('')
async function onCopyCode(code: string) {
  const r = await copyText(code)
  if (r === 'failed') {
    showToast(t('复制失败'))
    return
  }
  copiedKey.value = code
  showToast(t('查询码已复制'))
}

function goQuery() {
  router.push('/shell/feedback/query')
}

/** 本地记录点击 → 跳查询页并预填查询码 */
function goQueryWithCode(code: string) {
  router.push({ path: '/shell/feedback/query', query: { code } })
}

function onSubmitted() {
  // 提交成功后刷新本地记录（sheet 已写入 localStorage）
  localRecords.value = getLocalFeedbackRecords()
  // 已登录提交后刷新云列表
  if (isAuthenticated.value && tab.value === 'feedback') void loadFeedback()
}

/** 点击云端记录 → 弹详情抽屉（替代无反应；本地记录仍跳查询页预填查询码） */
function openCloudDetail(f: FeedbackResponseDto) {
  detail.value = {
    title: f.title,
    type: f.type,
    status: f.status,
    rewardStatus: f.rewardStatus,
    content: f.content,
    attachments: f.attachments ?? [],
    adoptNote: f.adoptNote,
    rejectReason: f.rejectReason,
    createdAt: f.createdAt,
    feedbackCode: f.feedbackCode,
    claimRequired: f.claimRequired,
  }
  detailShow.value = true
}

const detail = ref<FeedbackDetail | null>(null)
const detailShow = ref(false)
</script>

<template>
  <div class="subpage">
    <FeedbackSubmitSheet v-model:show="showSubmit" @submitted="onSubmitted" />
    <FeedbackDetailSheet v-model:show="detailShow" :detail="detail" />

    <van-nav-bar
      :title="t('反馈中心')"
      left-arrow
      @click-left="() => backOrFallback(router, '/shell')"
    />

    <!-- 未登录：提交/查询双入口 + 匿名规则提示（+ 本地记录） -->
    <div v-if="!isAuthenticated" class="fb-guest">
      <div :class="['fb-hero', { 'fb-hero--static': localRecords.length > 0 }]">
        <van-icon name="comment-o" size="56" color="var(--accent)" />
        <p class="fb-hero-title">{{ t('提交反馈') }}</p>
        <p class="fb-hero-desc">
          {{ t('提交可以匿名，奖励不能匿名：匿名反馈被采纳后，须联系客服并凭查询码注册或绑定账号，才能领取会员奖励。') }}
        </p>
        <button class="fb-hero-btn fb-hero-btn--primary" @click="showSubmit = true">
          <van-icon name="edit" size="16" />
          {{ t('提交反馈') }}
        </button>
        <button class="fb-hero-btn" @click="goQuery">
          <van-icon name="search" size="16" />
          {{ t('查询进度') }}
        </button>
      </div>

      <!-- 本地记录（仅本设备）：点击跳查询页预填查询码 -->
      <section v-if="localRecords.length" class="fb-local fb-local--guest">
        <div class="fb-local-title">{{ t('本地记录') }}</div>
        <div
          v-for="r in localRecords"
          :key="r.code"
          class="fb-local-item"
          @click="goQueryWithCode(r.code)"
        >
          <div class="fb-item-head">
            <span class="fb-item-title">{{ r.title }}</span>
            <span class="fb-badge fb-badge--local">{{ t('本地') }}</span>
          </div>
          <div class="fb-item-meta">
            {{ t(FEEDBACK_TYPE_MAP[r.type] ?? r.type) }} · {{ formatTime(r.createdAt) }}
          </div>
          <p class="fb-item-content">{{ stripHtmlTags(r.contentHtml) }}</p>
          <div class="fb-item-foot">
            <span class="fb-item-meta">{{ r.code }}</span>
            <button class="fb-copy-link" @click.stop="onCopyCode(r.code)">
              {{ copiedKey === r.code ? t('已复制') : t('查询码') }}
            </button>
          </div>
        </div>
        <p class="fb-local-hint">{{ t('本地记录仅保存在本设备，登录后可查看云端完整记录') }}</p>
      </section>
    </div>

    <!-- 已登录：Tabs + 列表 -->
    <template v-else>
      <div class="fb-tabs">
        <button
          :class="['fb-tab', { active: tab === 'feedback' }]"
          @click="tab = 'feedback'"
        >
          {{ t('我的反馈') }}
        </button>
        <button
          :class="['fb-tab', { active: tab === 'reward' }]"
          @click="tab = 'reward'"
        >
          {{ t('我的奖励') }}
        </button>
        <button class="fb-tab fb-tab--query" @click="goQuery">
          {{ t('查询进度') }}
        </button>
      </div>

      <!-- 我的反馈列表 -->
      <div v-if="tab === 'feedback'" class="fb-list" @scroll.passive="onListScroll">
        <!-- 本地记录（不在已加载云页中的，按 code 去重） -->
        <section v-if="localOnlyRecords.length" class="fb-local">
          <div class="fb-local-title">{{ t('本地记录') }}</div>
          <div
            v-for="r in localOnlyRecords"
            :key="r.code"
            class="fb-local-item"
            @click="goQueryWithCode(r.code)"
          >
            <div class="fb-item-head">
              <span class="fb-item-title">{{ r.title }}</span>
              <span class="fb-badge fb-badge--local">{{ t('本地') }}</span>
            </div>
            <div class="fb-item-meta">
              {{ t(FEEDBACK_TYPE_MAP[r.type] ?? r.type) }} · {{ formatTime(r.createdAt) }}
            </div>
            <p class="fb-item-content">{{ stripHtmlTags(r.contentHtml) }}</p>
            <div class="fb-item-foot">
              <span class="fb-item-meta">{{ r.code }}</span>
              <button class="fb-copy-link" @click.stop="onCopyCode(r.code)">
                {{ copiedKey === r.code ? t('已复制') : t('查询码') }}
              </button>
            </div>
          </div>
        </section>
        <div v-if="loading && feedbackItems.length === 0" class="fb-state">
          <van-loading size="24" />
          <span class="fb-state-text">{{ t('加载中...') }}</span>
        </div>
        <div v-else-if="listError" class="fb-state">
          <span class="fb-state-text">{{ listError }}</span>
          <button class="fb-retry" @click="loadFeedback">{{ t('重试') }}</button>
        </div>
        <div v-else-if="feedbackItems.length === 0" class="fb-state">
          <van-icon name="comment-o" size="48" color="var(--text-tertiary)" />
          <span class="fb-state-text">{{ t('暂无反馈记录') }}</span>
        </div>
        <div v-else>
          <div v-for="f in feedbackItems" :key="f.id" class="fb-item" @click="openCloudDetail(f)">
            <div class="fb-item-head">
              <span class="fb-item-title">{{ f.title }}</span>
              <span
                class="fb-badge"
                :style="{ color: statusColor(f.status), background: statusBg(f.status) }"
              >
                {{ t(FEEDBACK_STATUS_MAP[f.status] ?? f.status) }}
              </span>
            </div>
            <div class="fb-item-meta">
              {{ t(FEEDBACK_TYPE_MAP[f.type] ?? f.type) }} · {{ formatTime(f.createdAt) }}
            </div>
            <p class="fb-item-content">{{ stripHtmlTags(f.content) }}</p>
            <FeedbackAttachmentDisplay v-if="f.attachments?.length" :attachments="f.attachments" />
            <p v-if="f.adoptNote" class="fb-item-note">
              {{ t('采纳说明') }}：{{ f.adoptNote }}
            </p>
            <p v-if="f.rejectReason" class="fb-item-note fb-item-note--danger">
              {{ t('驳回原因') }}：{{ f.rejectReason }}
            </p>
            <div class="fb-item-foot">
              <span class="fb-badge" :style="{ color: '#6b7280', background: 'rgba(107,114,128,0.1)' }">
                {{ t(REWARD_STATUS_MAP[f.rewardStatus] ?? f.rewardStatus) }}
              </span>
              <button class="fb-copy-link" @click.stop="onCopyCode(f.feedbackCode)">
                {{ copiedKey === f.feedbackCode ? t('已复制') : t('查询码') }}
              </button>
            </div>
          </div>
          <div class="fb-list-footer">
            <van-loading v-if="loading" size="20" />
            <button
              v-else-if="loadMoreFailed"
              class="fb-retry"
              @click="retryLoadMore"
            >
              {{ t('加载失败，点击重试') }}
            </button>
            <span v-else-if="!hasMore" class="fb-state-text">{{ t('没有更多了') }}</span>
          </div>
        </div>
      </div>

      <!-- 我的奖励列表 -->
      <div v-else class="fb-list">
        <div v-if="rewardsLoading" class="fb-state">
          <van-loading size="24" />
          <span class="fb-state-text">{{ t('加载中...') }}</span>
        </div>
        <div v-else-if="rewardsError" class="fb-state">
          <span class="fb-state-text">{{ rewardsError }}</span>
          <button class="fb-retry" @click="loadRewards">{{ t('重试') }}</button>
        </div>
        <div v-else-if="rewards.length === 0" class="fb-state">
          <van-icon name="gift-o" size="48" color="var(--text-tertiary)" />
          <span class="fb-state-text">{{ t('暂无奖励记录') }}</span>
        </div>
        <div v-else>
          <div v-for="r in rewards" :key="r.id" class="fb-item">
            <div class="fb-item-head">
              <span class="fb-item-title">
                {{ fillTemplate('VIP{level} 会员 {days} 天', { level: r.vipTierLevel, days: r.durationDays }) }}
              </span>
              <span
                class="fb-badge"
                :style="{
                  color: r.status === 'ISSUED' ? '#15803d' : r.status === 'PENDING' ? '#b45309' : '#6b7280',
                  background: r.status === 'ISSUED' ? 'rgba(21,128,61,0.12)' : r.status === 'PENDING' ? 'rgba(180,83,9,0.12)' : 'rgba(107,114,128,0.12)',
                }"
              >
                {{ t(REWARD_STATUS_MAP[r.status] ?? r.status) }}
              </span>
            </div>
            <div class="fb-item-meta">
              {{ formatTime(r.createdAt) }}
              <template v-if="r.issuedAt"> · {{ t('发放于') }} {{ formatTime(r.issuedAt) }}</template>
            </div>
            <p v-if="r.feedbackTitle" class="fb-item-content">
              {{ t('关联反馈') }}：{{ r.feedbackTitle }}<template v-if="r.feedbackCode">（{{ r.feedbackCode }}）</template>
            </p>
            <p v-if="r.remark" class="fb-item-content">{{ r.remark }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- 提交 FAB -->
    <button class="fb-fab" :aria-label="t('提交反馈')" @click="showSubmit = true">
      <van-icon name="edit" />
    </button>
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

/* ═══ 未登录 Hero ═══ */
.fb-guest {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.fb-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px 24px;
  text-align: center;
}

/* 有本地记录时 hero 不再撑满，让位给下方列表 */
.fb-hero--static {
  flex: none;
  padding: 24px 24px 8px;
}

/* ═══ 本地记录 ═══ */
.fb-local {
  flex: none;
  padding: 4px 0 8px;
}

.fb-local--guest {
  padding: 0 24px 16px;
}

.fb-local-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 0 0;
}

.fb-local-item {
  padding: 12px 0;
  border-bottom: 0.5px solid var(--divider);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}

.fb-badge--local {
  color: var(--accent);
  background: rgba(0, 169, 158, 0.14);
}

.fb-local-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  padding-top: 10px;
}

.fb-hero-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.fb-hero-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.7;
  max-width: 320px;
}

.fb-hero-btn {
  width: 220px;
  padding: 12px 0;
  border: 1px solid var(--divider);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:active {
    opacity: 0.85;
  }
}

.fb-hero-btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* ═══ Tabs ═══ */
.fb-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 14px 4px;
  flex: none;
}

.fb-tab {
  padding: 6px 14px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 13px;
  flex-shrink: 0;

  &.active {
    background: rgba(0, 169, 158, 0.14);
    color: var(--accent);
  }
}

.fb-tab--query {
  margin-left: auto;
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--accent);
}

/* ═══ 列表 ═══ */
.fb-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
}

.fb-list-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 16px;
}

.fb-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
}

.fb-state-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.fb-retry {
  padding: 6px 16px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.fb-item {
  padding: 14px 0;
  border-bottom: 0.5px solid var(--divider);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.fb-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fb-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-item-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

.fb-item-content {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fb-item-note {
  font-size: 12px;
  color: #15803d;
  line-height: 1.6;
}

.fb-item-note--danger {
  color: #dc2626;
}

.fb-item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.fb-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 10px;
  flex-shrink: 0;
}

.fb-copy-link {
  border: none;
  background: none;
  font-size: 12px;
  color: var(--accent);
  padding: 2px 4px;
  cursor: pointer;

  &:active {
    opacity: 0.7;
  }
}

/* ═══ FAB ═══ */
.fb-fab {
  position: fixed;
  right: 16px;
  bottom: 60px;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 169, 158, 0.4);
  z-index: 100;

  &:active {
    opacity: 0.85;
  }
}
</style>
