<template>
  <v-app>
    <!-- UI 异常捕获：显示 ErrorFallback -->
    <ErrorFallback
      v-if="capturedError"
      :error="capturedError"
      @retry="capturedError = null"
    />
    <template v-else>
      <component :is="layoutComponent">
        <router-view />
      </component>
    </template>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onErrorCaptured, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';
import ErrorFallback from '@/components/ErrorFallback.vue';

const route = useRoute();

// 根据路由 meta.layout 选择布局
const layoutComponent = computed(() => {
  const layout = route.meta.layout as string | undefined;

  switch (layout) {
    case 'auth':
      return AuthLayout;
    case 'app':
      return AppLayout;
    case 'bare':
    default:
      return 'div';
  }
});

// ===== UI 异常捕获 =====
const capturedError = ref<unknown>(null);

onErrorCaptured((err) => {
  capturedError.value = err;
  return false;
});
</script>
