<script setup lang="ts">
/**
 * 项目图标 - 移植自 PC 端 folderIcons.tsx
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
    <!-- 建筑屋顶 -->
    <path
      d="M32 6L10 22V54C10 56.2091 11.7909 58 14 58H50C52.2091 58 54 56.2091 54 54V22L32 6Z"
      fill="#0891B2"
      stroke="#06B6D4"
      stroke-width="2"
    />
    <!-- 建筑正立面 -->
    <rect
      x="16"
      y="28"
      width="32"
      height="24"
      rx="1"
      fill="white"
      fill-opacity="0.9"
    />
    <!-- 门 -->
    <rect x="26" y="38" width="12" height="14" rx="1" fill="#06B6D4" />
    <!-- 窗户 -->
    <rect x="20" y="32" width="8" height="6" rx="1" fill="#0891B2" />
    <rect x="36" y="32" width="8" height="6" rx="1" fill="#0891B2" />
    <!-- 项目标签 -->
    <text
      x="32"
      y="18"
      font-size="10"
      fill="white"
      text-anchor="middle"
      font-weight="bold"
    >
      PROJ
    </text>
  </svg>
</template>
