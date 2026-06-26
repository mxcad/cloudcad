<script setup lang="ts">
import { ref, computed } from 'vue'
import { t } from '@/languages'
import { UploadFileInfo, UploadState } from './types'
import { publicFileControllerUploadExtReference } from '@/api-sdk'
import { classifyApiError } from '@/utils/errorHandler'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { showToast } from 'vant'
import FloatingPopup from "../../../../components/FloatingPopup.vue"
const props = defineProps<{ files: UploadFileInfo[] }>()
const emit = defineEmits<{ close: [result: { data: boolean }] }>()

const show = ref(true)
const isUploading = ref(false)

const allUploaded = computed(() =>
  props.files.every((f) => f.uploadState === UploadState.success)
)

const successCount = computed(() =>
  props.files.filter((f) => f.uploadState === UploadState.success).length
)

const failCount = computed(() =>
  props.files.filter((f) => f.uploadState === UploadState.fail).length
)

const overallProgress = computed(() => {
  if (props.files.length === 0) return 0
  const total = props.files.reduce((sum, f) => sum + (f.progress || 0), 0)
  return Math.round(total / props.files.length)
})

function iconStyle(state: UploadState) {
  const map: Record<UploadState, { name: string; color: string }> = {
    [UploadState.success]: { name: 'success', color: 'var(--success)' },
    [UploadState.fail]: { name: 'cross', color: 'var(--danger)' },
    [UploadState.notSelected]: { name: 'circle', color: '#c8c9cc' },
    [UploadState.uploading]: { name: 'loading', color: 'var(--primary)' },
  }
  return map[state]
}

function onClose(reason: 'skip' | 'complete') {
  show.value = false
  emit('close', { data: reason === 'complete' })
}

async function uploadSingleFile(info: UploadFileInfo, file: File): Promise<void> {
  info.uploadState = UploadState.uploading
  info.progress = 10
  const safeName = sanitizeFileName(info.name)

  try {
    const chunkSize = 1 * 1024 * 1024
    const totalChunks = Math.ceil(file.size / chunkSize)
    const totalBytes = file.size
    let uploadedBytes = 0

    if (file.size <= chunkSize) {
      info.progress = 30
      const result = await publicFileControllerUploadExtReference({
        body: { file, srcFileHash: info.hash, extRefFile: safeName } as never,
      })
      if (result.error) {
        info.uploadState = UploadState.fail
        info.progress = 0
        showToast(classifyApiError(result.error).message)
        return
      }
      info.progress = 100
      info.uploadState = UploadState.success
      return
    }

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize
      const end = Math.min(start + chunkSize, totalBytes)
      const chunk = file.slice(start, end)

      const result = await publicFileControllerUploadExtReference({
        body: {
          file: chunk,
          srcFileHash: info.hash,
          extRefFile: safeName,
          chunk: chunkIndex,
          chunks: totalChunks,
        } as never,
      })

      if (result.error) {
        info.uploadState = UploadState.fail
        info.progress = 0
        showToast(classifyApiError(result.error).message)
        return
      }

      uploadedBytes += chunk.size
      info.progress = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
    }

    info.progress = 100
    info.uploadState = UploadState.success
  } catch (e) {
    info.uploadState = UploadState.fail
    info.progress = 0
    showToast(classifyApiError(e).message)
  }
}

async function uploadFiles() {
  const el = document.createElement('input')
  el.type = 'file'
  el.accept = '.dwg,image/*'
  el.multiple = true
  el.style.display = 'none'
  document.body.appendChild(el)

  el.onchange = async () => {
    if (!el.files) return
    isUploading.value = true
    const sources = Array.from(el.files)

    for (const info of props.files) {
      if (info.uploadState === UploadState.success) continue
      const src = sources.find((f) => f.name === info.name)
      if (!src) continue
      info.source = src
      await uploadSingleFile(info, src)
    }

    isUploading.value = false
    el.remove()
  }

  el.oncancel = () => el.remove()
  setTimeout(() => el.click(), 100)
}
</script>

<template>
  <FloatingPopup
    v-model:show="show"
    title="上传外部参照"
    :closeable="false"
    @close="onClose('skip')"
  >
    <!-- Overall Progress -->
    <div v-if="isUploading || allUploaded" class="progress-bar">
      <div class="progress-info">
        <span>总体进度</span>
        <span>{{ successCount }}/{{ files.length }}{{ failCount > 0 ? `，${failCount} 个失败` : '' }}</span>
      </div>
      <van-progress
        :percentage="overallProgress"
        :stroke-width="8"
        :color="allUploaded && failCount === 0 ? 'var(--success)' : 'var(--primary)'"
        :pivot-text="`${overallProgress}%`"
      />
    </div>

    <div class="file-list">
      <van-cell-group>
        <van-cell v-for="file in files" :key="file.name">
          <template #title>
            <div class="file-cell-title">
              <van-text-ellipsis :content="file.name" />
              <van-progress
                v-if="file.uploadState === UploadState.uploading"
                :percentage="file.progress"
                :stroke-width="4"
                color="var(--primary)"
                :show-pivot="false"
              />
            </div>
          </template>
          <template #value>
            <van-icon
              :name="iconStyle(file.uploadState).name"
              :color="iconStyle(file.uploadState).color"
            />
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <template #footer>
      <div class="upload-footer">
        <van-button
          type="primary"
          block
          :loading="isUploading"
          :disabled="isUploading || allUploaded"
          @click="uploadFiles"
        >
          {{ t('上传文件') }}
        </van-button>
        <van-button
          v-if="allUploaded"
          type="success"
          block
          @click="onClose('complete')"
        >
          {{ t('完成') }}
        </van-button>
        <van-button
          v-else
          block
          :disabled="isUploading"
          @click="onClose('skip')"
        >
          {{ t('跳过') }}
        </van-button>
      </div>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.progress-bar {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-light);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.file-list {
  flex: 1;
  overflow-y: auto;
}

.file-cell-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-footer {
  display: flex;
  gap: var(--space-md);
  width: 100%;
}
</style>
