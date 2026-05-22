<script setup lang="ts">
import { t } from "@/languages";
import $api from "../../../axios"
import { UploadFileInfo, UploadState } from "./types";
import { getHostUrl, getUploadFileConfig } from "@/config/serverConfig";



const { files } = defineProps<{
  files: UploadFileInfo[]
}>()

const getUploadStateIcon = (state: UploadState) => {

  if (state === UploadState.success) return "success"
  if (state === UploadState.fail) return "cross"
  if (state === UploadState.notSelected) return "circle"
}
const getUploadStateColor = (state: UploadState) => {
  if (state === UploadState.success) return "#33CD2A"
  if (state === UploadState.fail) return "#ff0000"
}
const upload = () => {
  let {
    baseUrl = "",
  } = getUploadFileConfig() || {};

  if (baseUrl.substring(0, 16) == "http://localhost") {
    baseUrl = getHostUrl() + baseUrl.substring(16);
  }

  const el = document.createElement("input")
  el.setAttribute("type", "file")
  el.setAttribute("accept", ".dwg,image/*")
  el.style.display = "none"
  el.setAttribute("multiple", "multiple")
  el.setAttribute("capture", "camera")
  document.body.appendChild(el)
  el.onchange = () => {
    if (!el.files) return
    if (el.files.length < 1) return
    const fileSources = Array.from(el.files)
    files.filter((fileInfo) => {
      return fileSources.some((file) => {
        if (file.name === fileInfo.name) {
          fileInfo.source = file
          return true
        }
      })
    }).forEach(async (fileInfo) => {
      const { type, name, source, hash } = fileInfo
      fileInfo.uploadState = UploadState.uploading
      const data = new FormData()
      if (source) data.append("file", source)
      data.append("src_dwgfile_hash", hash)
      data.append("ext_ref_file", name)
      $api({
        url: baseUrl + (type === "img" ? "/mxcad/up_ext_reference_image" : "/mxcad/up_ext_reference_dwg"),
        method: 'post',
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        data,
        onUploadProgress(e) {
          if (!e.total) return
          fileInfo.progress = e.loaded / e.total * 100
          console.log(fileInfo.progress)
        }
      })
        .then((res) => {
          if (res.data.code === 0) {
            fileInfo.uploadState = UploadState.success
            el.remove()
          } else {
            fileInfo.uploadState = UploadState.fail
            el.remove()
          }
        }, () => {
          fileInfo.uploadState = UploadState.fail
          el.remove()
        })

    })
  }
  setTimeout(() => {
    el.click()
  }, 100);
}
</script>

<template>
  <div>
    <van-button size="large" type="primary" @click="upload">{{ t('上传文件') }}</van-button>

    <van-cell-group style="max-height: 60vh">
      <van-cell>
        <template #title>
          {{ t('文件名') }}
        </template>
        <template #value>
          {{ t("状态") }}
        </template>
      </van-cell>
      <van-cell v-for="(file, index) in files">
        <template #title>
          <van-text-ellipsis :content="file.name" />
        </template>
        <template #value>
          <van-icon v-if="file.uploadState !== UploadState.uploading" :name="getUploadStateIcon(file.uploadState)"
            :color="getUploadStateColor(file.uploadState)"></van-icon>
          <van-circle v-else v-model:current-rate="file.progress" size="32" :speed="100"
            :text="file.progress.toFixed(0)" />
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<style scoped lang='scss'>
:root:root {
  --van-button-primary-background: red;
}

.border_box {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgb(var(--v-theme-inverse));
  box-sizing: border-box;
}

.no-border {
  border: unset;
}
</style>