<script setup lang="ts">
/**
 * 认证页「返回首页」入口。
 *
 * 登录 / 注册页均为 App.vue 条件渲染的全屏覆盖层，用户（尤其是被登出后跳转来的）
 * 此前无路可退。此处固定挂在覆盖层左上角，由 App.vue 统一渲染，避免各页各自复制一份。
 *
 * 用 replace 直接落到 /shell 而非 router.back()：从 /shell/file 等需登录子页被守卫弹回时，
 * 历史里上一跳就是那个子页，back 会再被守卫弹回登录页形成循环。
 */
import { useRouter } from 'vue-router'
import { t } from '@/languages'

const router = useRouter()

function goHome() {
  void router.replace({ path: '/shell' })
}
</script>

<template>
  <button
    type="button"
    class="auth-back"
    :title="t('返回首页')"
    :aria-label="t('返回首页')"
    @click="goHome"
  >
    <van-icon name="arrow-left" size="14" />
    <span>{{ t('返回首页') }}</span>
  </button>
</template>

<style scoped lang="scss">
/* 选择器写成 button.auth-back（特异性 0,2,1）：
   main.scss 的全局 reset 是 [type="button"]:not(.van-button)（0,2,0），
   若用单类 .auth-back 会与其打平并按源序落败，background/border/color 全被改写成
   none/none/inherit → 在黑底上变成黑字，按钮物理消失。 */
button.auth-back {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 1001; /* .auth-page 为 1000，须压在其上；vant 弹窗默认 2000 不受影响 */
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  touch-action: manipulation;

  &:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  &:active {
    background: var(--bg-tertiary);
  }
}
</style>
