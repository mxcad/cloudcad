<script setup lang="ts">
/**
 * 文件夹图标 - 移植自 PC 端 folderIcons.tsx
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
    <!-- 文件夹背部 -->
    <path
      d="M4 16C4 12.6863 6.68629 10 10 10H26L30 14H54C57.3137 14 60 16.6863 60 20V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V16Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      stroke-width="2"
    />
    <!-- 文件夹前盖 -->
    <path
      d="M4 22C4 18.6863 6.68629 16 10 16H26L30 20H54C57.3137 20 60 22.6863 60 26V52C60 55.3137 57.3137 58 54 58H10C6.68629 58 4 55.3137 4 52V22Z"
      fill="#FEF3C7"
      stroke="#F59E0B"
      stroke-width="2"
    />
    <!-- 文件夹标签 -->
    <path
      d="M4 16V20C4 20.5523 4.44772 21 5 21H25L30 16H5C4.44772 16 4 16.4477 4 16Z"
      fill="#FCD34D"
      stroke="#F59E0B"
      stroke-width="2"
    />
    <!-- 高光效果 -->
    <path
      d="M12 20V50C12 51.1046 12.8954 52 14 52H50C51.1046 52 52 51.1046 52 50V22C52 20.8954 51.1046 20 50 20H14C12.8954 20 12 20.8954 12 22V20Z"
      fill="url(#folderGradient)"
      fill-opacity="0.5"
    />
    <defs>
      <linearGradient
        id="folderGradient"
        x1="12"
        y1="20"
        x2="52"
        y2="52"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="white" stop-opacity="0.6" />
        <stop offset="1" stop-color="white" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>
</template>
