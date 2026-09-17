<script setup lang="ts">
/**
 * 移动端 App 入口
 *
 * 壳模式始终启用——进入 App 即为 App 壳（顶栏 + 编辑器根 + 子页导航）。
 * Home（编辑器根）恒由 Shell 组件挂载并保活；子页通过 Action Sheet 覆盖其上。
 */
import Shell from './pages/shell/index.vue'
</script>

<template>
  <van-config-provider
    theme="dark"
    theme-vars-scope="global"
    safe-area-inset-top
    safe-area-inset-bottom
  >
    <Shell />
    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>
</template>
