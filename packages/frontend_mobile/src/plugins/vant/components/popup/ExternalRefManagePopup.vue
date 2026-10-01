<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  showToast,
  showLoadingToast,
  closeToast,
  showImagePreview,
} from 'vant'
import { t } from '@/languages'
import FloatingPopup from '@/components/FloatingPopup.vue'
import { openMxWeb } from '@/plugins/mxcad/openMxWeb'
import { useOpenGuard } from '@/composables/useOpenGuard'
import { handleApiError } from '@/utils/apiConfig'
import {
  fetchExtRefList,
  getExtRefImageUrl,
  getExtRefDrawingUrl,
  downloadExtRef,
  replaceExtRef,
} from '@/services/extRefManageService'
import type { ExtRefItem, ExtRefContext } from '@/services/extRefManageService'

const props = withDefaults(
  defineProps<{
    ctx: ExtRefContext
    /** 调用方预取的列表（自动打开流程传入，避免面板二次拉取）；缺省时面板自行拉取 */
    initialFiles?: ExtRefItem[]
    /** 是否可上传/替换（节点场景按 CAD_EXTERNAL_REFERENCE 权限；公开场景默认 true） */
    canManage?: boolean
  }>(),
  {
    initialFiles: undefined,
    canManage: true,
  }
)

const emit = defineEmits<{ close: [] }>()

const show = ref(true)
const loading = ref(!props.initialFiles)
const refreshing = ref(false)
const files = ref<ExtRefItem[]>(props.initialFiles ? [...props.initialFiles] : [])

const { guardBeforeOpen } = useOpenGuard()

const missingCount = computed(
  () => files.value.filter((f) => !f.exists && f.uploadState !== 'success').length
)

async function loadList() {
  loading.value = true
  refreshing.value = true
  try {
    files.value = await fetchExtRefList(props.ctx)
  } catch {
    files.value = []
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  if (!props.initialFiles) void loadList()
})

function statusColor(f: ExtRefItem): string {
  if (f.uploadState === 'success' || f.exists) return 'var(--success)'
  if (f.uploadState === 'fail') return 'var(--danger)'
  if (f.uploadState === 'uploading') return 'var(--primary)'
  return 'var(--warning)'
}

async function onRefresh() {
  await loadList()
}

/** 查看：图片走预览；图纸就地打开 mxweb（替换当前图纸，先过未保存守卫）。 */
async function onView(f: ExtRefItem) {
  if (f.type === 'img') {
    showLoadingToast({ message: t('正在加载...'), forbidClick: true })
    try {
      const url = await getExtRefImageUrl(props.ctx, f.name)
      closeToast()
      await showImagePreview([url])
    } catch (e) {
      closeToast()
      handleApiError(e, t('打开外部参照失败'))
    }
    return
  }
  const ok = await guardBeforeOpen()
  if (!ok) return
  const url = getExtRefDrawingUrl(props.ctx, f.name)
  const opened = await openMxWeb(url)
  if (!opened) handleApiError(new Error('open failed'), t('打开外部参照失败'))
}

async function onDownload(f: ExtRefItem) {
  showLoadingToast({ message: t('正在下载...'), forbidClick: true })
  try {
    await downloadExtRef(props.ctx, f)
    closeToast()
    showToast(t('下载成功'))
  } catch (e) {
    closeToast()
    handleApiError(e, t('外部参照下载失败'))
  }
}

/** 替换/上传：按类型单选本地文件，上传成功后刷新列表。 */
async function onReplace(f: ExtRefItem) {
  const file = await pickFile(f.type === 'img' ? 'image/*' : '.dwg,.dxf')
  if (!file) return
  f.source = file
  f.uploadState = 'uploading'
  f.progress = 10
  showLoadingToast({ message: t('正在上传外部参照...'), forbidClick: true })
  try {
    await replaceExtRef(props.ctx, f, file, (pct) => {
      f.progress = pct
    })
    closeToast()
    f.uploadState = 'success'
    f.exists = true
    f.progress = 100
    showToast(t('外部参照上传完成'))
    await loadList()
  } catch (e) {
    closeToast()
    f.uploadState = 'fail'
    f.progress = 0
    handleApiError(e, t('上传失败'))
  }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = accept
    el.style.display = 'none'
    document.body.appendChild(el)
    const cleanup = () => document.body.removeChild(el)
    el.onchange = () => {
      cleanup()
      resolve(el.files?.[0] || null)
    }
    el.oncancel = () => {
      cleanup()
      resolve(null)
    }
    el.click()
  })
}

function onClose() {
  show.value = false
  emit('close')
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    :title="t('管理外部参照')"
    :closeable="false"
    @close="onClose"
  >
    <div class="extref-manage">
      <!-- 头部统计 + 刷新 -->
      <div v-if="files.length > 0" class="extref-header">
        <span class="extref-count">
          {{ t('共 {count} 个文件', { count: files.length }) }}
          <span v-if="missingCount > 0" class="extref-missing">
            {{ t('，{count} 个缺失', { count: missingCount }) }}
          </span>
        </span>
        <van-button size="small" plain :loading="refreshing" @click="onRefresh">
          {{ t('刷新') }}
        </van-button>
      </div>

      <!-- 加载中 -->
      <div v-if="loading && files.length === 0" class="extref-state">
        <van-loading size="24" />
      </div>

      <!-- 空态 -->
      <div v-else-if="files.length === 0" class="extref-state">
        <p class="extref-empty">{{ t('暂无外部参照文件') }}</p>
      </div>

      <!-- 列表 -->
      <div v-else class="extref-list">
        <div v-for="f in files" :key="f.name" class="extref-item">
          <span class="extref-dot" :style="{ background: statusColor(f) }" />
          <div class="extref-info">
            <div class="extref-name-row">
              <span
                class="extref-tag"
                :class="f.type === 'img' ? 'extref-tag--img' : 'extref-tag--ref'"
              >
                {{ f.type === 'img' ? t('图片') : t('图纸') }}
              </span>
              <span class="extref-name">{{ f.name }}</span>
            </div>
            <div v-if="f.uploadState === 'uploading'" class="extref-progress">
              <van-progress
                :percentage="f.progress"
                :stroke-width="4"
                color="var(--primary)"
                :show-pivot="false"
              />
            </div>
          </div>
          <div class="extref-actions">
            <template v-if="!f.exists && f.uploadState !== 'success'">
              <van-button
                v-if="canManage"
                size="small"
                type="primary"
                :loading="f.uploadState === 'uploading'"
                @click="onReplace(f)"
              >
                {{ t('上传') }}
              </van-button>
            </template>
            <template v-else>
              <van-button size="small" plain @click="onView(f)">{{ t('查看') }}</van-button>
              <van-button v-if="canManage" size="small" plain @click="onReplace(f)">
                {{ t('替换') }}
              </van-button>
              <van-button size="small" plain @click="onDownload(f)">{{ t('下载') }}</van-button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="extref-footer">
        <span class="extref-status">
          {{
            missingCount > 0
              ? t('还有 {count} 个文件未处理', { count: missingCount })
              : files.length > 0
                ? t('所有文件已处理')
                : ''
          }}
        </span>
        <van-button size="small" @click="onClose">{{ t('关闭') }}</van-button>
      </div>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.extref-manage {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-md) var(--space-lg);
}

.extref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.extref-count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.extref-missing {
  color: var(--warning);
}

.extref-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.extref-empty {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.extref-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.extref-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
}

.extref-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.extref-info {
  flex: 1;
  min-width: 0;
}

.extref-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.extref-tag {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;

  &--img {
    background: var(--info, #1989fa);
  }

  &--ref {
    background: var(--primary);
  }
}

.extref-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extref-progress {
  margin-top: 4px;
}

.extref-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.extref-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.extref-status {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
