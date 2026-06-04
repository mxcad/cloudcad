<script setup lang="ts">
import { reactive } from 'vue';
import Home from './pages/home/index.vue'
import ShareLanding from './pages/share/ShareLanding.vue'
import type { ConfigProviderThemeVars, ConfigProviderProps } from 'vant';

const themeVars: ConfigProviderThemeVars = reactive({});
const themeVarsDark: ConfigProviderProps["themeVarsDark"] = reactive({

});
const themeVarsLight: ConfigProviderProps["themeVarsLight"] = reactive({});

const isShareRoute = /^\/share\//.test(window.location.pathname);
</script>

<template>

  <van-config-provider :theme-vars="themeVars" :theme-vars-dark="themeVarsDark" :theme-vars-light="themeVarsLight"
    mode="light" safe-area-inset-top safe-area-inset-bottom>
   
    <ShareLanding v-if="isShareRoute" />
    <Home v-else />
    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>

</template>

<style lang="scss">

</style>