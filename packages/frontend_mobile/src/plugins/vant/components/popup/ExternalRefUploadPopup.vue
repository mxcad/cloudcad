<script setup lang="ts">
import { ref, computed } from 'vue'
import { t } from '@/languages'
import { UploadFileInfo, UploadState } from './types'
import { publicFileControllerUploadExtReference } from '@/api-sdk'

const props = defineProps<{ files: UploadFileInfo[] }>()
const emit = defineEmits<{ close: [result: { data: boolean }] }>()

const show = ref(true)

const allUploaded = computed(() =>
  props.files.every((f) => f.uploadState === UploadState.success)
)

function iconStyle(state: UploadState) {
  const map: Record<UploadState, { name: string; color: string }> = {
    [UploadState.success]: { name: 'success', color: '#33CD2A' },
    [UploadState.fail]: { name: 'cross', color: '#ff0000' },
    [UploadState.notSelected]: { name: 'circle', color: '#c8c9cc' },
    [UploadState.uploading]: { name: 'loading', color: '#1989fa' },
  }
  return map[state]
}

function onClose() {
  show.value = false
  emit('close', { data: false })
}

function onComplete() {
  show.value = false
  emit('close', { data: true })
}

async function uploadFiles() {
  const el = document.createElement('input')
  el.type = 'file'
  el.accept = '.dwg,image/*'
  el.multiple = true
  el.style.display = 'none'
  el.setAttribute('capture', 'camera')
  document.body.appendChild(el)
  el.onchange = async () => {
    if (!el.files) return
    const sources = Array.from(el.files)
    for (const info of props.files) {
      const src = sources.find((f) => f.name === info.name)
      if (!src) continue
      info.source = src
      info.uploadState = UploadState.uploading
      try {
        const result = await publicFileControllerUploadExtReference({
          body: { file: src, srcFileHash: info.hash, extRefFile: info.name } as never,
        })
        info.uploadState = result.error ? UploadState.fail : UploadState.success
      } catch {
        info.uploadState = UploadState.fail
      }
    }
    el.remove()
  }
  el.oncancel = () => el.remove()
  setTimeout(() => el.click(), 100)
}
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    :style="{ height: '80vh', display: 'flex', flexDirection: 'column' }"
    :close-on-click-overlay="false"
    @close="onClose"
  >
    <van-nav-bar :title="t('上传外部参照')" left-arrow @click-left="onClose" />
    <div style="flex:1;overflow-y:auto;padding:12px">
      <van-cell-group>
        <van-cell v-for="file in files" :key="file.name">
          <template #title>
            <van-text-ellipsis :content="file.name" />
          </template>
          <template #value>
            <van-icon
              v-if="file.uploadState !== UploadState.uploading"
              :name="iconStyle(file.uploadState).name"
              :color="iconStyle(file.uploadState).color"
            />
            <van-icon v-else name="loading" color="#1989fa" />
          </template>
        </van-cell>
      </van-cell-group>
    </div>
    <div style="padding:12px;border-top:1px solid #eee;display:flex;gap:12px">
      <van-button type="primary" block style="flex:1" @click="uploadFiles">{{ t('上传文件') }}</van-button>
      <van-button v-if="allUploaded" type="success" style="flex:1" @click="onComplete">{{ t('完成') }}</van-button>
      <van-button v-else style="flex:1" @click="onClose">{{ t('跳过') }}</van-button>
    </div>
  </van-popup>
</template>
