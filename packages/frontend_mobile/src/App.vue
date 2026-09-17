<script setup lang="ts">
/**
 * 移动端 App 入口
 *
 * 壳模式始终启用——进入 App 即为 App 壳（顶栏 + 编辑器根 + 子页导航）。
 * Home（编辑器根）恒由 Shell 组件挂载并保活；子页通过 Action Sheet 覆盖其上。
 *
 * 认证页（/login、/register）不走 <router-view>（App.vue 直接渲染 <Shell /> 以保持 CAD 编辑器 WebGL 存活），
 * 而是按 route.path 条件渲染为全屏覆盖层。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Shell from './pages/shell/index.vue'
import LoginPage from './pages/auth/LoginPage.vue'
import RegisterPage from './pages/auth/RegisterPage.vue'
import AuthBackButton from './pages/auth/AuthBackButton.vue'

/** 认证覆盖层路由，与下方 v-if 链保持一一对应 */
const AUTH_ROUTE_PATHS = [
  '/login',
  '/register',
]

/** 任一认证覆盖层打开时，都提供「返回首页」出口 */
const isAuthPage = computed(() => AUTH_ROUTE_PATHS.includes(route.path))

const route = useRoute()
</script>

<template>
  <van-config-provider
    theme="dark"
    theme-vars-scope="global"
    safe-area-inset-top
    safe-area-inset-bottom
  >
    <Shell />
    <LoginPage v-if="route.path === '/login'" />
    <RegisterPage v-else-if="route.path === '/register'" />

    <!-- 认证覆盖层的统一「返回首页」出口，压在各覆盖层之上（z-index 1001 > 1000） -->
    <AuthBackButton v-if="isAuthPage" />

    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>
</template>
