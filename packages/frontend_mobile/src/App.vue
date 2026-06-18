<script setup lang="ts">
import { reactive } from 'vue';
import Home from './pages/home/index.vue'
import ShareLanding from './pages/share/ShareLanding.vue'

import { serverConfig } from './config/serverConfig'
import { isAndroidOrIOS } from './utils/isAndroidOrIOS'



const isShareRoute = /^\/share\//.test(window.location.pathname);

if (!isShareRoute && !isAndroidOrIOS() && serverConfig?.isAutomaticJumpToDesktopPage) {
  const params = new URLSearchParams(window.location.search)
  const fileId = params.get('fileId')
  let targetPath = import.meta.env.DEV
    ? 'http://localhost:3000/cad-editor'
    : (serverConfig.desktopPageUrl || '/cad-editor')
  if (fileId) {
    params.delete('fileId')
    targetPath += '/' + fileId
  }
  const queryString = params.toString()
  window.location.replace(queryString ? targetPath + '?' + queryString : targetPath)
}
</script>

<template>

  <van-config-provider
    mode="dark" safe-area-inset-top safe-area-inset-bottom>
   
    <ShareLanding v-if="isShareRoute" />
    <Home v-else />
    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>

</template>

<style lang="scss">

</style>