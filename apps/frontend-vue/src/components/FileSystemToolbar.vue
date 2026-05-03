<template>
  <div class="file-system-toolbar">
    <v-row dense class="align-center">
      <v-col cols="12" sm="6" md="4">
        <v-text-field
          v-model="localSearchTerm"
          :placeholder="t('file.searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          @keyup.enter="handleSearchSubmit"
          @click:clear="handleClearSearch"
        />
      </v-col>

      <v-col cols="12" sm="6" md="8" class="d-flex justify-start justify-sm-end align-center ga-2">
        <v-btn-toggle v-model="localViewMode" mandatory density="compact" variant="outlined">
          <v-btn value="grid" size="small">
            <v-icon size="18">mdi-view-grid</v-icon>
          </v-btn>
          <v-btn value="list" size="small">
            <v-icon size="18">mdi-view-list</v-icon>
          </v-btn>
        </v-btn-toggle>

        <v-btn
          v-if="!isAtRoot"
          :variant="isMultiSelectMode ? 'flat' : 'outlined'"
          :color="isMultiSelectMode ? 'primary' : undefined"
          size="small"
          @click="handleToggleMultiSelect"
        >
          <v-icon size="18">mdi-checkbox-multiple-marked-outline</v-icon>
          <span v-if="selectedNodes.size > 0" class="ml-1">({{ selectedNodes.size }})</span>
        </v-btn>

        <v-btn
          v-if="isMultiSelectMode && selectedNodes.size > 0 && nodesCount > 0"
          variant="outlined"
          size="small"
          @click="onSelectAll"
        >
          {{ selectedNodes.size === nodesCount ? t('common.deselectAll') : t('common.selectAll') }}
        </v-btn>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  searchTerm: string;
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  selectedNodes: Set<string>;
  nodesCount: number;
  isAtRoot: boolean;
  loading?: boolean;
  isTrashView?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  isTrashView: false,
});

const emit = defineEmits<{
  'update:searchTerm': [value: string];
  'search-submit': [];
  'update:viewMode': [value: 'grid' | 'list'];
  'update:isMultiSelectMode': [value: boolean];
  'select-all': [];
  'clear-trash': [];
}>();

const localSearchTerm = ref(props.searchTerm);
const localViewMode = ref(props.viewMode);
const localIsMultiSelectMode = ref(props.isMultiSelectMode);

watch(() => props.searchTerm, (val) => {
  localSearchTerm.value = val;
});

watch(() => props.viewMode, (val) => {
  localViewMode.value = val;
});

watch(() => props.isMultiSelectMode, (val) => {
  localIsMultiSelectMode.value = val;
});

watch(localSearchTerm, (val) => {
  emit('update:searchTerm', val);
});

watch(localViewMode, (val) => {
  emit('update:viewMode', val);
});

function handleSearchSubmit(): void {
  emit('search-submit');
}

function handleClearSearch(): void {
  emit('update:searchTerm', '');
  emit('search-submit');
}

function handleToggleMultiSelect(): void {
  const newValue = !localIsMultiSelectMode.value;
  emit('update:isMultiSelectMode', newValue);
}

function onSelectAll(): void {
  emit('select-all');
}
</script>

<style scoped>
.file-system-toolbar {
  padding: 8px 0;
}
</style>
