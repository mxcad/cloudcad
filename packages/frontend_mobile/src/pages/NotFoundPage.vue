<script setup lang="ts">
/**
 * 404 兜底页：移动端路由表里没有的路径落到这里。
 *
 * 此前 router/index.ts 没有 `path: '*'`，未匹配路径停在覆盖层/壳根且没有任何
 * 提示——用户不知道自己为什么打不开（典型场景：抄来的 PC 路径、手输错路径）。
 *
 * 与认证页同机制：App.vue 恒渲染 <Shell /> 保活 WebGL，本页按 route.name 条件
 * 渲染为全屏覆盖层，不走 <router-view>。
 */
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { t } from '@/languages'
import { buildPcUrlForPath } from '@/utils/pcTarget'

const route = useRoute()
const router = useRouter()

const attemptedPath = computed(() => route.path)
const pcUrl = computed(() => buildPcUrlForPath(route.path))

function goShell() {
  void router.replace('/shell')
}

function openOnPc() {
  window.open(pcUrl.value, '_blank', 'noopener')
}
</script>

<template>
  <div class="not-found-page">
    <div class="not-found-card">
      <van-empty :description="t('页面不存在')" />
      <p class="not-found-desc">{{ t('手机端没有这个页面，或地址有误') }}</p>
      <p class="not-found-path">{{ attemptedPath }}</p>
      <button type="button" class="primary-btn" @click="openOnPc">
        {{ t('用电脑端打开') }}
      </button>
      <button type="button" class="secondary-btn" @click="goShell">
        {{ t('返回首页') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 主按钮复用 auth-common 的 .primary-btn（含全局 reset 的特异性约定：
   必须写成 button.xxx 且自带 type="button"，否则按钮会被 reset 覆盖成空）。
   .secondary-btn 在这里就地定义，保持同特异性写法。 */
@use '@/pages/auth/auth-common.scss';

.not-found-page {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.not-found-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.not-found-desc {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.not-found-path {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-family: monospace;
  color: var(--text-secondary);
}

button.primary-btn,
button.secondary-btn {
  width: 100%;
  max-width: 280px;
  margin-top: 0;
}

button.secondary-btn {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
  font-weight: 600;
  cursor: pointer;
}
</style>
