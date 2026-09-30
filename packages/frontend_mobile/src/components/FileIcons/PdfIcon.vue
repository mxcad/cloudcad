<script setup lang="ts">
/**
 * PDF 文件图标 - 移植自 PC 端 docFileIcons.tsx（红色文档标识）
 */
withDefaults(
  defineProps<{
    size?: number | string
  }>(),
  { size: 24 }
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- 文件背景 -->
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#FEE2E2"
      stroke="#DC2626"
      stroke-width="2"
    />
    <!-- 文件折角 -->
    <path
      d="M40 4V16H52"
      fill="#FECACA"
      stroke="#DC2626"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- PDF 标识 - 文档图标 -->
    <rect x="14" y="20" width="24" height="28" rx="2" fill="#DC2626" />
    <rect x="16" y="22" width="20" height="24" rx="1" fill="#FEE2E2" />
    <!-- PDF 文字 -->
    <text x="26" y="34" font-size="8" fill="#DC2626" text-anchor="middle" font-weight="bold">
      PDF
    </text>
    <!-- 线条示意 -->
    <line x1="18" y1="40" x2="34" y2="40" stroke="#DC2626" stroke-width="2" stroke-linecap="round" />
    <line x1="18" y1="44" x2="30" y2="44" stroke="#DC2626" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
