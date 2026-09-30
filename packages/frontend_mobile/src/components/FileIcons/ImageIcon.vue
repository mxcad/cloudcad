<script setup lang="ts">
/**
 * 图片文件图标 - 移植自 PC 端 docFileIcons.tsx（蓝色 + 山峰/太阳/相机）
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
      fill="#DBEAFE"
      stroke="#2563EB"
      stroke-width="2"
    />
    <!-- 文件折角 -->
    <path
      d="M40 4V16H52"
      fill="#93C5FD"
      stroke="#2563EB"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- 图片内容 -->
    <rect x="14" y="20" width="24" height="24" rx="2" fill="#2563EB" fill-opacity="0.2" />
    <!-- 山峰和太阳 -->
    <path
      d="M14 44L22 32L28 40L34 28L44 44"
      stroke="#2563EB"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
    <circle cx="32" cy="26" r="4" fill="#FCD34D" />
    <!-- 相机图标 -->
    <circle cx="28" cy="48" r="4" stroke="#2563EB" stroke-width="1.5" fill="none" />
    <circle cx="28" cy="48" r="1.5" fill="#2563EB" />
    <path d="M26 48L24 50" stroke="#2563EB" stroke-width="1" stroke-linecap="round" />
  </svg>
</template>
