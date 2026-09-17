<script setup lang="ts">
/**
 * M8 壳级 6 态异常页
 *
 * 由 useAuthState 的 authState.kind 驱动显示。
 * 每个态有独立的图标/文案/操作按钮。
 *
 * 使用方式：
 *   <AuthStatePage v-if="authState.kind !== 'authenticated' && authState.kind !== 'guest'" />
 *
 * guest 态由子页自身处理（不阻断），authenticated 态正常渲染子页内容。
 */
import { computed } from 'vue'
import { t } from '@/languages'
import { useRouter } from 'vue-router'
import { useAuthState } from '@/composables/useAuthState'
import { navigateToLogin } from '@/utils/authNavigate'

const { authState, clearNetworkError, setGuest } = useAuthState()
const router = useRouter()

interface StateConfig {
  icon: string
  title: string
  desc: string
  actionText?: string
  showBack?: boolean
  showRetry?: boolean
}

const STATE_CONFIG: Record<string, StateConfig> = {
  token_expired: {
    icon: 'lock',
    title: t('登录已过期'),
    desc: t('您的登录已过期，请重新登录后继续使用'),
    actionText: t('重新登录'),
  },
  network_error: {
    icon: 'error-o',
    title: t('网络异常'),
    desc: t('网络连接不稳定，请检查网络后重试'),
    actionText: t('重试'),
    showRetry: true,
  },
  forbidden: {
    icon: 'warn-o',
    title: t('无权访问'),
    desc: t('您没有执行此操作的权限，请联系管理员申请'),
    actionText: t('返回首页'),
    showBack: true,
  },
  deactivated: {
    icon: 'warning-o',
    title: t('账号已禁用'),
    desc: t('您的账号已被禁用或注销，如需恢复请联系客服'),
    actionText: t('联系客服'),
  },
}

const config = computed((): StateConfig => {
  const c = STATE_CONFIG[authState.value.kind]
  return c || { icon: 'error-o', title: t('异常'), desc: t('未知状态') }
})

function handleAction() {
  switch (authState.value.kind) {
    case 'token_expired':
      navigateToLogin()
      break
    case 'network_error':
      clearNetworkError()
      router.replace(router.currentRoute.value.fullPath)
      break
    case 'forbidden':
      router.back()
      break
    case 'deactivated':
      setGuest()
      navigateToLogin()
      break
  }
}
</script>

<template>
  <div class="auth-state-page">
    <div class="auth-state-inner">
      <div class="auth-state-icon">
        <van-icon :name="config.icon" size="64" color="var(--primary)" />
      </div>
      <h2 class="auth-state-title">{{ config.title }}</h2>
      <p class="auth-state-desc">{{ config.desc }}</p>
      <van-button
        v-if="config.actionText"
        type="primary"
        block
        round
        size="large"
        @click="handleAction"
      >
        {{ config.actionText }}
      </van-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-state-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) var(--space-md);
  background: var(--bg-primary);
}

.auth-state-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
}

.auth-state-icon {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-lg);
}

.auth-state-title {
  margin: 0 0 var(--space-xs);
  font-size: var(--font-size-title-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.auth-state-desc {
  margin: 0 0 var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
}
</style>