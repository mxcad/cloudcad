<script setup lang="ts">
/**
 * DWG 文件图标 - 移植自 PC 端 cadFileIcons.tsx（工程蓝 + 建筑平面图）
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
    <!-- 文件背景 - 工程蓝 -->
    <path
      d="M10 4C7.79086 4 6 5.79086 6 8V56C6 58.2091 7.79086 60 10 60H48C50.2091 60 52 58.2091 52 56V16L40 4H10Z"
      fill="#1E40AF"
      stroke="#3B82F6"
      stroke-width="2"
    />
    <!-- 文件折角 -->
    <path
      d="M40 4V16H52"
      fill="#60A5FA"
      stroke="#3B82F6"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- CAD 图案 - 建筑平面图风格 -->
    <rect x="16" y="20" width="32" height="28" rx="2" fill="none" stroke="white" stroke-width="2" />
    <path d="M16 32H48" stroke="white" stroke-width="1.5" stroke-dasharray="4 2" />
    <path d="M32 20V48" stroke="white" stroke-width="1.5" stroke-dasharray="4 2" />
    <!-- 门符号 -->
    <path d="M44 32L48 28" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" />
    <path d="M44 32L48 36" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" />
    <!-- 标注线 -->
    <path d="M14 18L10 18" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" />
    <path d="M50 18L54 18" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" />
    <path d="M32 18V16M32 48V50" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" />
    <!-- DWG 标签 -->
    <rect x="16" y="49" width="20" height="7" rx="1" fill="#3B82F6" />
    <text x="26" y="54.5" font-size="7" fill="white" text-anchor="middle" font-weight="bold">
      DWG
    </text>
  </svg>
</template>
