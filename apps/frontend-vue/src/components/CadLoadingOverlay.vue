<template>
  <Teleport to="body">
    <v-overlay
      :model-value="isActive"
      persistent
      class="align-center justify-center"
    >
      <v-card min-width="360" max-width="480" rounded="lg" class="pa-6">
        <!-- 不确定进度（无百分比） -->
        <v-progress-linear
          v-if="percent === 0"
          indeterminate
          color="primary"
          rounded
          class="mb-4"
        />

        <!-- 确定性进度 -->
        <v-progress-linear
          v-else
          :model-value="percent"
          color="primary"
          rounded
          height="6"
          class="mb-4"
        />

        <div class="text-body-2 font-weight-medium mt-2">
          {{ message }}
        </div>
      </v-card>
    </v-overlay>
  </Teleport>
</template>

<script setup lang="ts">
import { useProgress } from '@/composables/useProgress';

const progress = useProgress();
const isActive = progress.isActive;
const message = progress.message;
const percent = progress.percent;
</script>
