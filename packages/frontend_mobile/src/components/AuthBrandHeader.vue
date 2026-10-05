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

<style scoped lang="scss">
/* 品牌区样式必须随组件走：父页面（Login/Register）的 scoped 选择器带 data-v 属性，
   匹配不到本组件内部的 img/div，抽组件后若样式还留在父级则 logo 失去尺寸约束、
   按原图（1080px）撑满整屏（57e10c6 品牌区抽组件时漏迁）。 */
.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.auth-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

/* 品牌名用 div 而非 h1——页面已有 h1（auth-title 的动作标题），
   两个 h1 会让读屏软件报出两个同级标题 */
.auth-brand-name {
  margin: 0;
  font-size: var(--font-size-page-title);
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
  text-align: center;
}
</style>
