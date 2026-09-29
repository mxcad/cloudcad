<script setup lang="ts">
/**
 * 项目操作历史（二期 b）—— 项目详情页 nav-bar「操作历史」打开的底部弹窗。
 *
 * 对齐 PC OperationHistoryModal 的移动端形态：搜索（资源名）+ 操作/成员筛选 +
 * 今天/昨天/更早三桶分组 + 逐条定位（文件→打开图纸，文件夹→跳父目录，由页面处理）。
 * 数据走 useProjectAuditLog（GET /api/v1/audit/project/:projectId，成员可查）。
 */
import { ref, watch, computed } from 'vue'
import { showToast } from 'vant'
import { t } from '@/languages'
import {
  useProjectAuditLog,
  actionLabel,
  isLocatable,
  type AuditLogItem,
} from '@/composables/useProjectAuditLog'

const props = defineProps<{
  show: boolean
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  /** 定位节点：文件由页面打开图纸，文件夹由页面跳父目录 */
  (e: 'locate', log: AuditLogItem): void
}>()

const visible = ref(props.show)
watch(
  () => props.show,
  (val) => {
    visible.value = val
    if (val) {
      // 每次打开重置筛选与列表
      audit.search.value = ''
      audit.actionFilter.value = ''
      audit.memberFilter.value = ''
      void audit.loadLogs(true)
      void audit.loadMembers()
    }
  },
)

const audit = useProjectAuditLog(() => props.projectId)

// 搜索防抖（对齐 PC useDeferredValue 语义）
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput(val: string) {
  audit.search.value = val
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void audit.loadLogs(true), 300)
}

// 操作类型选项（与 useProjectAuditLog 的 ACTION_LABELS 同源）
const ACTION_OPTIONS = [
  'FILE_CREATE', 'FILE_UPDATE', 'FILE_DELETE', 'FILE_SHARE', 'FOLDER_CREATE',
  'NODE_RENAME', 'NODE_MOVE', 'NODE_COPY', 'NODE_RESTORE',
  'ADD_MEMBER', 'UPDATE_MEMBER', 'REMOVE_MEMBER', 'TRANSFER_OWNERSHIP',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE', 'PROJECT_TRANSFER',
  'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE',
]

function onActionFilter(val: string) {
  audit.actionFilter.value = val
  void audit.loadLogs(true)
}

function onMemberFilter(val: string) {
  audit.memberFilter.value = val
  void audit.loadLogs(true)
}

function memberName(log: AuditLogItem): string {
  return log.user?.username || log.user?.email || t('未知')
}

// 成员筛选标题：选中时显示该成员名
const memberFilterTitle = computed(() => {
  if (!audit.memberFilter.value) return t('操作人')
  const m = audit.members.value.find((x) => x.id === audit.memberFilter.value)
  return m?.nickname || m?.username || t('全部成员')
})

function formatTime(createdAt: string): string {
  try {
    const d = new Date(createdAt)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return createdAt
  }
}

function onLocate(log: AuditLogItem) {
  if (!isLocatable(log)) {
    showToast(t('该记录对应的节点不存在'))
    return
  }
  emit('locate', log)
}

function onClose() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <van-popup v-model:show="visible" position="bottom" round :style="{ height: '80%' }" @close="onClose">
    <div class="audit-popup">
      <div class="ap-header">
        <span class="ap-title">{{ t('操作历史') }}</span>
        <van-icon name="cross" size="18" @click="onClose" />
      </div>

      <div class="ap-search">
        <van-search v-model="audit.search.value" :placeholder="t('搜索资源名称')" shape="round" @input="onSearchInput" />
      </div>

      <div class="ap-filters">
        <van-dropdown-menu active-color="var(--primary)">
          <van-dropdown-item
            v-model="audit.actionFilter.value"
            :title="audit.actionFilter.value ? actionLabel(audit.actionFilter.value) : t('操作类型')"
            @change="onActionFilter"
          >
            <van-radio-group v-model="audit.actionFilter.value" direction="vertical">
              <van-radio :name="''">{{ t('全部') }}</van-radio>
              <van-radio v-for="a in ACTION_OPTIONS" :key="a" :name="a">{{ actionLabel(a) }}</van-radio>
            </van-radio-group>
          </van-dropdown-item>
          <van-dropdown-item
            v-model="audit.memberFilter.value"
            :title="memberFilterTitle"
            @change="onMemberFilter"
          >
            <van-radio-group v-model="audit.memberFilter.value" direction="vertical">
              <van-radio :name="''">{{ t('全部成员') }}</van-radio>
              <van-radio v-for="m in audit.members.value" :key="m.id" :name="m.id">
                {{ m.nickname || m.username }}
              </van-radio>
            </van-radio-group>
          </van-dropdown-item>
        </van-dropdown-menu>
      </div>

      <div class="ap-body">
        <van-loading v-if="audit.loading.value && audit.logs.value.length === 0" class="ap-loading" />

        <div v-else-if="audit.error.value" class="ap-error">
          <span>{{ audit.error.value }}</span>
          <van-button size="small" @click="audit.loadLogs(true)">{{ t('重试') }}</van-button>
        </div>

        <van-empty v-else-if="audit.logs.value.length === 0" :description="t('暂无操作记录')" />

        <div v-else class="ap-list">
          <template v-for="section in audit.grouped.value" :key="section.group">
            <div class="ap-group-label">{{ section.label }}</div>
            <div
              v-for="log in section.items"
              :key="log.id"
              :class="['ap-item', { 'ap-item--disabled': !isLocatable(log) }]"
              @click="onLocate(log)"
            >
              <div class="ap-item-main">
                <span class="ap-item-action">{{ actionLabel(log.action) }}</span>
                <span class="ap-item-resource">{{ log.resourceName || t('未知资源') }}</span>
              </div>
              <div class="ap-item-meta">
                <span class="ap-item-user">{{ memberName(log) }}</span>
                <span class="ap-item-time">{{ formatTime(log.createdAt) }}</span>
              </div>
            </div>
          </template>

          <div v-if="audit.hasMore.value" class="ap-loadmore" @click="audit.loadMore()">
            <van-loading v-if="audit.loading.value" size="18" />
            <span v-else>{{ t('加载更多') }}</span>
          </div>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.audit-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.ap-title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}

.ap-search {
  padding: var(--space-sm) var(--space-lg);
}

.ap-filters {
  border-bottom: 1px solid var(--border-color);
}

.ap-body {
  flex: 1;
  overflow-y: auto;
}

.ap-loading {
  margin-top: 40px;
}

.ap-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px var(--space-lg);
  color: var(--text-tertiary);
}

.ap-group-label {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px var(--space-lg) 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
}

.ap-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px var(--space-lg);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;

  &:active {
    background: var(--active-color);
  }

  &--disabled {
    opacity: 0.55;
    cursor: default;
  }
}

.ap-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ap-item-action {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
}

.ap-item-resource {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-item-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.ap-loadmore {
  display: flex;
  justify-content: center;
  padding: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
