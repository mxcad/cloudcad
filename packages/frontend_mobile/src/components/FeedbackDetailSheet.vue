<script lang="ts">
/**
 * 反馈详情抽屉（移动端只读）——我的反馈 / 反馈中心 / 查询页共用。
 *
 * 点击列表项时弹出，替代「详情渲染在页面底部、需滚动才能看到」的旧交互。
 * 展示：标题 + 状态徽标、类型 · 时间、内容（云端富文本水合 / 本地纯文本）、
 * 附件、采纳说明/驳回原因、奖励状态、查询码复制、匿名认领提示。
 *
 * 数据形状统一为 FeedbackDetail（云端 FeedbackResponseDto / 查询结果
 * FeedbackQueryResultDto / 本地记录 FeedbackLocalRecord 归一化，见 toDetail 各页）。
 */
export interface FeedbackDetail {
  title: string;
  /** 反馈类型（BUG/SUGGESTION/COMPLAINT/OTHER） */
  type: string;
  /** 云端状态；本地记录恒 'LOCAL'（不显示状态徽标） */
  status: string;
  /** 云端奖励状态；本地记录恒 '' */
  rewardStatus: string;
  /** 富文本 HTML（本地记录为 contentHtml，抽屉内纯文本预览） */
  content: string;
  attachments: import('@cloudcad/api-sdk/types.gen').FeedbackAttachmentDto[];
  adoptNote?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  feedbackCode: string;
  /** 匿名被采纳后需联系客服认领（仅云端） */
  claimRequired?: boolean;
  /** 本地记录标记（仅本设备，无云端状态/奖励） */
  isLocal?: boolean;
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { showToast } from 'vant'
import { t } from '@/languages'
import { copyText } from '@/utils/clipboard'
import { stripHtmlTags } from '@/utils/richtext'
import RichContentView from '@/components/richtext/RichContentView.vue'
import FeedbackAttachmentDisplay from '@/components/FeedbackAttachmentDisplay.vue'
import {
  FEEDBACK_TYPE_MAP,
  FEEDBACK_STATUS_MAP,
  REWARD_STATUS_MAP,
  statusColor,
  statusBg,
  formatTime,
} from '@/constants/feedback'

const props = defineProps<{
  show: boolean
  detail: FeedbackDetail | null
}>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const attachmentsById = computed(() =>
  Object.fromEntries((props.detail?.attachments ?? []).map((a) => [a.id, a]))
)

async function onCopyCode() {
  const code = props.detail?.feedbackCode
  if (!code) return
  const r = await copyText(code)
  if (r === 'failed') {
    showToast(t('复制失败'))
    return
  }
  showToast(t('查询码已复制'))
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    teleport="body"
    class="fb-detail-popup"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="detail" class="fb-detail">
      <div class="fb-detail-head">
        <span class="fb-detail-title">{{ detail.title }}</span>
        <span
          v-if="!detail.isLocal"
          class="fb-badge"
          :style="{ color: statusColor(detail.status), background: statusBg(detail.status) }"
        >
          {{ t(FEEDBACK_STATUS_MAP[detail.status] ?? detail.status) }}
        </span>
        <span v-else class="fb-badge fb-badge--local">{{ t('本地') }}</span>
      </div>
      <div class="fb-detail-meta">
        {{ t(FEEDBACK_TYPE_MAP[detail.type] ?? detail.type) }} · {{ formatTime(detail.createdAt) }}
      </div>

      <div class="fb-detail-content">
        <RichContentView
          v-if="!detail.isLocal"
          :html="detail.content"
          :attachments-by-id="attachmentsById"
        />
        <p v-else>{{ stripHtmlTags(detail.content) }}</p>
      </div>

      <FeedbackAttachmentDisplay
        v-if="detail.attachments?.length"
        :attachments="detail.attachments"
      />

      <p v-if="detail.adoptNote" class="fb-detail-note">
        {{ t('采纳说明') }}：{{ detail.adoptNote }}
      </p>
      <p v-if="detail.rejectReason" class="fb-detail-note fb-detail-note--danger">
        {{ t('驳回原因') }}：{{ detail.rejectReason }}
      </p>

      <p v-if="detail.claimRequired" class="fb-detail-claim">
        {{ t('奖励已就绪但不能匿名领取：请凭查询码联系客服注册或绑定账号后发放。') }}
      </p>

      <div class="fb-detail-foot">
        <span
          v-if="!detail.isLocal"
          class="fb-badge"
          :style="{ color: '#6b7280', background: 'rgba(107,114,128,0.1)' }"
        >
          {{ t(REWARD_STATUS_MAP[detail.rewardStatus] ?? detail.rewardStatus) }}
        </span>
        <span v-else class="fb-detail-hint">
          {{ t('本地记录仅保存在本设备，登录后可查看云端完整记录') }}
        </span>
        <button class="fb-copy-link" @click="onCopyCode">
          {{ t('查询码') }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.fb-detail-popup {
  max-height: 80vh;
}

.fb-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
  overflow-y: auto;
  max-height: 80vh;
  box-sizing: border-box;
  background: var(--bg-primary);
}

.fb-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.fb-detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.4;
}

.fb-detail-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fb-detail-content {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
  word-break: break-word;
}

.fb-detail-note {
  font-size: 13px;
  color: #15803d;
  line-height: 1.6;
}

.fb-detail-note--danger {
  color: #dc2626;
}

.fb-detail-claim {
  font-size: 12px;
  color: #b45309;
  line-height: 1.6;
}

.fb-detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 0.5px solid var(--divider);
}

.fb-detail-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
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
</style>
