<script setup lang="ts">
/**
 * 通用文件图标 - 移植自 PC 端 docFileIcons.tsx（灰色，兜底所有未匹配扩展名）
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
      fill="#F1F5F9"
      stroke="#64748B"
      stroke-width="2"
    />
    <!-- 文件折角 -->
    <path
      d="M40 4V16H52"
      fill="#E2E8F0"
      stroke="#64748B"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- 文件内容线 -->
    <line x1="16" y1="26" x2="36" y2="26" stroke="#64748B" stroke-width="2" stroke-linecap="round" />
    <line x1="16" y1="34" x2="40" y2="34" stroke="#64748B" stroke-width="2" stroke-linecap="round" />
    <line x1="16" y1="42" x2="32" y2="42" stroke="#64748B" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
