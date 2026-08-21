<script setup lang="ts">
import Home from './pages/home/index.vue' 

</script>

<template>
  <van-config-provider
    theme="dark"
    theme-vars-scope="global"
    safe-area-inset-top
    safe-area-inset-bottom
  >

    <Home />
    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>
</template>