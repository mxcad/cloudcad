<script setup lang="ts">
/**
 * 认证页品牌区（logo + 产品名）。
 *
 * LoginPage / RegisterPage 字节相同的两行，抽成组件避免漂移；
 * 文案/图全部来自运行时品牌配置（`config/brandConfig.ts`），管理端可热改。
 * logo 加载失败（管理端填错路径）时隐藏图片，不留下碎图占位。
 */
import { ref } from 'vue'
import { useBrand } from '@/composables/useBrand'

const { brand } = useBrand()
const logoOk = ref(true)
</script>

<template>
  <div class="auth-brand">
    <img
      v-if="logoOk"
      class="auth-logo"
      :src="brand.logo"
      :alt="brand.title"
      @error="logoOk = false"
    />
    <div class="auth-brand-name">{{ brand.title }}</div>
  </div>
</template>
