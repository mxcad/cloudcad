<script setup lang="ts">
import { reactive } from 'vue';
import Home from './pages/home/index.vue'
import type { ConfigProviderThemeVars, ConfigProviderProps } from 'vant';
// ‍  主题配置
// ‍ Theme configuration

const themeVars: ConfigProviderThemeVars = reactive({});
const themeVarsDark: ConfigProviderProps["themeVarsDark"] = reactive({

});
const themeVarsLight: ConfigProviderProps["themeVarsLight"] = reactive({});
</script>

<template>

  <van-config-provider :theme-vars="themeVars" :theme-vars-dark="themeVarsDark" :theme-vars-light="themeVarsLight"
    mode="light" safe-area-inset-top safe-area-inset-bottom>
   
    <!-- <router-view v-slot="{ Component }">
      <transition name="fade" mode="in-out">
        <keep-alive v-if="$route.meta.keepAlive">
          <component :is="Component" />
        </keep-alive>
        <component :is="Component" v-else-if="!$route.meta.keepAlive" />
      </transition>
    </router-view> -->

    <Home />
    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>

</template>

<style lang="scss">

</style>