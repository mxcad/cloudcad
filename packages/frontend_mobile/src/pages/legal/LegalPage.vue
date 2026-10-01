<script setup lang="ts">
/**
 * 合规页（H-01）：隐私政策 / 用户协议。
 *
 * 公开页（免登录，对齐 PC /privacy /terms 公开路由）：登录页底部 + 注册页协议勾选
 * 均可进入，登录态与游客态都不弹跳。App.vue 按 route.path 条件渲染为全屏覆盖层
 * （与认证页同机制，不走 <router-view>）。
 *
 * 正文按当前语言懒加载（languages/legal，与 PC 同源各端一份），品牌占位符由
 * @cloudcad/platform 的 resolvePlaceholders 解析；语言切换 / 客服配置变化时重载。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVoerkaI18n } from '@voerkai18n/vue'
import { t } from '@/languages'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import {
  loadLegalText,
  LEGAL_COPYRIGHT_HOLDER,
  type LegalDoc,
} from '@/languages/legal'

const props = defineProps<{ doc: LegalDoc }>()

const router = useRouter()
const { config } = useRuntimeConfig()
const i18n = useVoerkaI18n()

const content = ref('')
const loading = ref(true)

const title = computed(() =>
  props.doc === 'privacy' ? t('隐私政策') : t('用户协议')
)

// 更新日期（对齐 PC LegalPage 的 updatedAt）
const updatedAt = '2026-08-06'

async function load() {
  loading.value = true
  try {
    content.value = await loadLegalText(props.doc, i18n.activeLanguage.value, config.value)
  } catch (e) {
    console.error(`Failed to load legal document ${props.doc}`, e)
    content.value = ''
  } finally {
    loading.value = false
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    void router.replace('/login')
  }
}

onMounted(load)
// activeLanguage 是 Ref：watch 源必须读 .value，否则监听的是 Ref 对象本身（恒不变）
watch(() => i18n.activeLanguage.value, load)
watch(() => props.doc, load)
</script>

<template>
  <div class="legal-page">
    <div class="legal-card">
      <van-nav-bar :title="title" left-arrow @click-left="goBack" />
      <p class="legal-updated">{{ t('更新日期：{date}', { date: updatedAt }) }}</p>
      <div v-if="loading" class="legal-loading">{{ t('加载中...') }}</div>
      <div v-else class="legal-content">{{ content }}</div>
      <footer class="legal-footer">{{ LEGAL_COPYRIGHT_HOLDER }} · {{ title }}</footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 与认证页同层（z-index 1000）的全屏覆盖层；正文长，卡片内部滚动 */
.legal-page {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.legal-card {
  width: 100%;
  max-width: 480px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  overflow-y: auto;
}

.legal-updated {
  margin: 0;
  font-size: var(--font-size-caption);
  color: var(--text-tertiary);
}

.legal-loading {
  padding: 24px 0;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.legal-content {
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.legal-footer {
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  font-size: var(--font-size-caption);
  color: var(--text-muted);
}
</style>
