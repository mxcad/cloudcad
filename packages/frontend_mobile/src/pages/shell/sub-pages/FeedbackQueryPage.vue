<script setup lang="ts">
/**
 * 反馈进度查询页（公开路由，无需登录）。
 *
 * 凭提交时返回的查询码（+ 留了联系方式则需匹配）查询反馈处理进度与奖励状态。
 * 这是未登录用户唯一的进度入口；登录用户可在「我的反馈」查看全部。
 * 对齐 PC FeedbackQueryPage 同源同语义。
 */
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  feedbackControllerQueryByCode,
  feedbackControllerListMine,
} from '@cloudcad/api-sdk/sdk.gen'
import type {
  FeedbackQueryResultDto,
  FeedbackResponseDto,
} from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { errMsg, unwrap } from '@/utils/apiError'
import { backOrFallback } from '@/utils/backNavigation'
import { stripHtmlTags } from '@/utils/richtext'
import { useUser } from '@/composables/useUser'
import { getLocalFeedbackRecords, type FeedbackLocalRecord } from '@/utils/feedbackLocalRecords'
import {
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  statusColor,
  statusBg,
  formatTime,
} from '@/constants/feedback'
import FeedbackDetailSheet, {
  type FeedbackDetail,
} from '@/components/FeedbackDetailSheet.vue'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useUser()
// 支持 ?code= 预填（提交成功视图/本地记录点击跳转时带码直达）
const code = ref(typeof route.query.code === 'string' ? route.query.code.toUpperCase() : '')
const contact = ref('')
const querying = ref(false)
const error = ref('')
// 详情抽屉：点击记录/查询成功后弹出，替代「详情渲染页面底部需滚动」的旧交互
const detail = ref<FeedbackDetail | null>(null)
const detailShow = ref(false)

// ── 我的反馈记录（打开即展示，查询码非必填）──
// 本地记录：挂载时读取一次（提交后重新进入页面即可见）
const localRecords = ref<FeedbackLocalRecord[]>(getLocalFeedbackRecords())
// 云端记录：已登录时拉取
const cloudRecords = ref<FeedbackResponseDto[]>([])
const cloudLoading = ref(false)
const cloudError = ref('')

/** 云端列表项（FeedbackResponseDto）→ 抽屉详情形状 */
function toDetailFromDto(f: FeedbackResponseDto): FeedbackDetail {
  return {
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
}

/** 查询结果（FeedbackQueryResultDto）→ 抽屉详情形状 */
function toDetailFromQuery(r: FeedbackQueryResultDto): FeedbackDetail {
  return {
    title: r.title,
    type: r.type,
    status: r.status,
    rewardStatus: r.rewardStatus,
    content: r.content,
    attachments: r.attachments ?? [],
    adoptNote: r.adoptNote,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt,
    feedbackCode: r.feedbackCode,
    claimRequired: r.claimRequired,
  }
}

/** 本地记录 → 抽屉详情形状（无云端状态/奖励，仅本地内容） */
function toDetailFromLocal(r: FeedbackLocalRecord): FeedbackDetail {
  return {
    title: r.title,
    type: r.type,
    status: 'LOCAL',
    rewardStatus: '',
    content: r.contentHtml,
    attachments: [],
    createdAt: r.createdAt,
    feedbackCode: r.code,
    isLocal: true,
  }
}

const cloudCodes = computed(() => new Set(cloudRecords.value.map((f) => f.feedbackCode)))
// 不在已加载云列表中的本地记录（按查询码去重）：云端查不到的补充区
const localOnly = computed(() =>
  localRecords.value.filter((r) => !cloudCodes.value.has(r.code))
)
const hasRecords = computed(
  () =>
    cloudLoading.value ||
    cloudRecords.value.length > 0 ||
    localOnly.value.length > 0
)

async function loadCloudRecords() {
  if (!isAuthenticated.value) return
  cloudLoading.value = true
  cloudError.value = ''
  try {
    const res = await feedbackControllerListMine({ query: { page: 1, pageSize: 50 } })
    const d = unwrap<{ items?: FeedbackResponseDto[] }>(res)
    cloudRecords.value = d.items ?? []
  } catch (e) {
    cloudError.value = errMsg(e, t('加载失败'))
  } finally {
    cloudLoading.value = false
  }
}

onMounted(() => {
  void loadCloudRecords()
})

function openDetail(d: FeedbackDetail) {
  error.value = ''
  detail.value = d
  detailShow.value = true
}

async function onQuery() {
  const trimmedCode = code.value.trim().toUpperCase()
  if (!trimmedCode) {
    error.value = t('请输入查询码')
    return
  }
  error.value = ''
  querying.value = true
  try {
    const res = await feedbackControllerQueryByCode({
      throwOnError: true,
      path: { code: trimmedCode },
      query: { contact: contact.value.trim() || undefined },
    })
    openDetail(toDetailFromQuery(res.data as FeedbackQueryResultDto))
  } catch (e) {
    error.value = errMsg(e, t('查询失败'))
  } finally {
    querying.value = false
  }
}

/** 点击云端记录：列表数据已含状态/奖励，直接弹抽屉展示详情（无需再查询） */
function onSelectCloud(f: FeedbackResponseDto) {
  openDetail(toDetailFromDto(f))
}

/** 点击本地记录：直接弹抽屉展示本地内容（云端查不到的部分，无需后台查询） */
function onSelectLocal(r: FeedbackLocalRecord) {
  openDetail(toDetailFromLocal(r))
}

function onCodeInput() {
  code.value = code.value.toUpperCase()
}
</script>

<template>
  <div class="subpage">
    <van-nav-bar
      :title="t('反馈进度查询')"
      left-arrow
      @click-left="() => backOrFallback(router, '/shell')"
    />

    <div class="fb-query-body">
      <!-- 我的反馈记录（打开即展示，查询码非必填） -->
      <section v-if="hasRecords" class="fb-records">
        <div class="fb-records-title">{{ t('我的反馈') }}</div>
        <p v-if="cloudError" class="fb-query-error">{{ cloudError }}</p>
        <p v-if="cloudLoading" class="fb-records-hint">{{ t('加载中...') }}</p>
        <p
          v-if="!cloudLoading && cloudRecords.length === 0 && localOnly.length === 0"
          class="fb-records-hint"
        >
          {{ t('暂无反馈记录') }}
        </p>
        <div
          v-for="f in cloudRecords"
          :key="f.id"
          class="fb-record-item"
          @click="onSelectCloud(f)"
        >
          <div class="fb-record-head">
            <span class="fb-record-title">{{ f.title }}</span>
            <span
              class="fb-badge"
              :style="{ color: statusColor(f.status), background: statusBg(f.status) }"
            >
              {{ t(FEEDBACK_STATUS_MAP[f.status] ?? f.status) }}
            </span>
          </div>
          <div class="fb-record-meta">
            {{ t(FEEDBACK_TYPE_MAP[f.type] ?? f.type) }} · {{ formatTime(f.createdAt) }}
          </div>
          <p class="fb-record-content">{{ stripHtmlTags(f.content ?? '') }}</p>
        </div>
        <div
          v-for="r in localOnly"
          :key="r.code"
          class="fb-record-item"
          @click="onSelectLocal(r)"
        >
          <div class="fb-record-head">
            <span class="fb-record-title">{{ r.title }}</span>
            <span class="fb-badge fb-badge--local">{{ t('本地') }}</span>
          </div>
          <div class="fb-record-meta">
            {{ t(FEEDBACK_TYPE_MAP[r.type] ?? r.type) }} · {{ formatTime(r.createdAt) }}
          </div>
          <p class="fb-record-content">{{ stripHtmlTags(r.contentHtml) }}</p>
        </div>
      </section>

      <div class="fb-query-form">
        <div class="fb-field">
          <label class="fb-label">{{ t('查询码') }}</label>
          <input
            v-model="code"
            class="fb-input"
            :placeholder="t('请输入提交时获得的查询码')"
            :disabled="querying"
            @input="onCodeInput"
          />
        </div>

        <div class="fb-field">
          <label class="fb-label">{{ t('联系方式（选填）') }}</label>
          <input
            v-model="contact"
            class="fb-input"
            :placeholder="t('提交时填写过联系方式则需匹配')"
            maxlength="100"
            :disabled="querying"
          />
        </div>

        <p v-if="error" class="fb-query-error">{{ error }}</p>

        <button class="fb-query-btn" :disabled="querying" @click="onQuery">
          <van-loading v-if="querying" size="16" color="#fff" />
          <span v-else>{{ t('查询') }}</span>
        </button>
      </div>

      <!-- 详情抽屉：记录点击/查询成功弹出，替代「详情渲染页面底部需滚动」的旧交互 -->
      <FeedbackDetailSheet v-model:show="detailShow" :detail="detail" />
    </div>
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

.fb-query-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
}

.fb-query-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ═══ 我的反馈记录（打开即展示） ═══ */
.fb-records {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.fb-records-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.fb-records-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fb-record-item {
  padding: 12px;
  border: 1px solid var(--divider);
  border-radius: 10px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.fb-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fb-record-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-record-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

.fb-record-content {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fb-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 10px;
  flex-shrink: 0;
}

.fb-badge--local {
  color: var(--accent);
  background: rgba(0, 169, 158, 0.14);
}

.fb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fb-label {
  font-size: 13px;
  color: var(--text-primary);
}

.fb-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;

  &:disabled {
    opacity: 0.6;
  }
}

.fb-query-error {
  font-size: 13px;
  color: #ff4444;
}

.fb-query-btn {
  padding: 12px 0;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
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

  &:disabled {
    opacity: 0.6;
  }
}

/* ═══ 结果卡片 ═══ */
.fb-result {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fb-result-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.fb-result-label {
  font-size: 13px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.fb-result-value {
  font-size: 13px;
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}

.fb-result-title {
  max-width: 60%;
}

.fb-result-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fb-result-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
  text-align: left;
}

.fb-claim-warning {
  font-size: 12px;
  color: #b45309;
  line-height: 1.6;
}
</style>
