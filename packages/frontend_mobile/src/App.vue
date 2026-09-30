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
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Shell from './pages/shell/index.vue';
import LoginPage from './pages/auth/LoginPage.vue';
import RegisterPage from './pages/auth/RegisterPage.vue';
import VerifyEmailPage from './pages/auth/VerifyEmailPage.vue';
import VerifyPhonePage from './pages/auth/VerifyPhonePage.vue';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.vue';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.vue';
import AuthBackButton from './pages/auth/AuthBackButton.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import NoticeDialog from './components/NoticeDialog.vue';
import { AUTH_PAGE_PATHS } from '@/utils/authSession';

/** 认证覆盖层路由单源见 authSession.AUTH_PAGE_PATHS（router 守卫共用），与下方 v-if 链保持一一对应 */
const isAuthPage = computed(() => AUTH_PAGE_PATHS.includes(route.path));

// 未在 router/index.ts 声明的路径（抄来的 PC 路径、手输错）matched 为空数组。
// 不给路由表加 path:'*'——RouteRecordRaw 必须有 component/redirect/children，
// 而本页不走 <router-view>（App.vue 恒渲染 <Shell /> 保活 WebGL）。
const router = useRouter();
// 初次导航未就绪时 matched 也是空的，不加这道闸会闪一下 404 覆盖层
const routerReady = ref(false);
void router.isReady().then(() => {
  routerReady.value = true;
});
const isNotFound = computed(() => routerReady.value && route.matched.length === 0);

const route = useRoute();
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
    <VerifyEmailPage v-else-if="route.path === '/verify-email'" />
    <VerifyPhonePage v-else-if="route.path === '/verify-phone'" />
    <ForgotPasswordPage v-else-if="route.path === '/forgot-password'" />
    <ResetPasswordPage v-else-if="route.path === '/reset-password'" />
    <!-- 兜底覆盖层：路由表里查不到的路径显示（见 isNotFound） -->
    <NotFoundPage v-else-if="isNotFound" />

    <!-- 认证覆盖层的统一「返回首页」出口，压在各覆盖层之上（z-index 1001 > 1000） -->
    <AuthBackButton v-if="isAuthPage" />

    <!-- 系统公告弹框：压在所有覆盖层之上，编辑中与登录页都会弹 -->
    <NoticeDialog />

    <van-number-keyboard safe-area-inset-bottom />
  </van-config-provider>
</template>
