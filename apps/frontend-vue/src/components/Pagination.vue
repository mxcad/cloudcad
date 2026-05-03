<template>
  <div class="pagination-wrapper d-flex align-center justify-space-between flex-wrap ga-2">
    <div class="text-body-2 text-medium-emphasis">
      {{ t('common.paginationTotal', { total: meta.total }) }}
    </div>

    <div class="d-flex align-center ga-2">
      <v-select
        v-model="localPageSize"
        :items="pageSizeOptions"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 120px"
        @update:model-value="handlePageSizeChange"
      />

      <v-pagination
        v-model="localPage"
        :length="meta.totalPages"
        :total-visible="5"
        variant="text"
        density="compact"
        @update:model-value="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  showSizeChanger?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showSizeChanger: true,
});

const emit = defineEmits<{
  'page-change': [page: number];
  'page-size-change': [limit: number];
}>();

const pageSizeOptions = [20, 50, 100];

const localPage = ref(props.meta.page);
const localPageSize = ref(props.meta.limit);

watch(() => props.meta.page, (val) => {
  localPage.value = val;
});

watch(() => props.meta.limit, (val) => {
  localPageSize.value = val;
});

function handlePageChange(page: number): void {
  emit('page-change', page);
}

function handlePageSizeChange(limit: number): void {
  emit('page-size-change', limit);
}
</script>

<style scoped>
.pagination-wrapper {
  padding: 8px 0;
}
</style>
