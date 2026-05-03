<template>
  <v-breadcrumbs :items="items" class="pa-0">
    <template #divider>
      <v-icon icon="mdi-chevron-right" size="small" />
    </template>
    <template #item="{ item, index }">
      <v-breadcrumbs-item
        :disabled="index === items.length - 1"
        @click="handleClick(item)"
      >
        {{ item.title }}
      </v-breadcrumbs-item>
    </template>
  </v-breadcrumbs>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot: boolean;
}

interface Props {
  breadcrumbs: BreadcrumbItem[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  navigate: [crumb: BreadcrumbItem];
}>();

const items = computed(() =>
  props.breadcrumbs.map((crumb) => ({
    title: crumb.name,
    ...crumb,
  }))
);

function handleClick(item: BreadcrumbItem & { title: string }): void {
  emit('navigate', {
    id: item.id,
    name: item.title,
    isRoot: item.isRoot,
  });
}
</script>

<style scoped>
.v-breadcrumbs {
  font-size: 14px;
}
</style>
