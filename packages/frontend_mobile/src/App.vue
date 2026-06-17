<script setup lang="ts">
import { reactive } from 'vue';
import Home from './pages/home/index.vue'
import ShareLanding from './pages/share/ShareLanding.vue'

import { serverConfig } from './config/serverConfig'
import { isAndroidOrIOS } from './utils/isAndroidOrIOS'



const isShareRoute = /^\/share\//.test(window.location.pathname);

if (!isShareRoute && !isAndroidOrIOS() && serverConfig?.isAutomaticJumpToDesktopPage) {
  if (import.meta.env.DEV) {
    window.location.replace(
      'http://localhost:3000/cad-editor' + window.location.search
    )
  } else {
    const desktopUrl = serverConfig.desktopPageUrl || '/cad-editor'
    window.location.replace(desktopUrl + window.location.search)
  }
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