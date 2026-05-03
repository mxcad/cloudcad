<template>
  <v-dialog v-model="isOpen" max-width="500" persistent>
    <v-card>
      <v-card-title>{{ moveSourceNode ? t('file.moveTo') : t('file.copyTo') }}</v-card-title>
      <v-card-text>
        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-4"
        />
        <v-treeview
          v-if="!loading && folderTree.length > 0"
          v-model="selectedFolder"
          :items="folderTree"
          activatable
          item-children="children"
          item-value="id"
          return-object
          @update:activated="handleSelect"
        />
        <div v-if="!loading && folderTree.length === 0" class="text-center pa-4 text-medium-emphasis">
          {{ t('file.noFolders') }}
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="handleClose">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :disabled="!selectedFolder.length"
          @click="handleConfirm"
        >
          {{ t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { projectsApi } from '@/services/projectsApi';
import type { FileSystemNode } from '@/composables/useFileSystemData';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface FolderTreeItem {
  id: string;
  title: string;
  children?: FolderTreeItem[];
}

interface Props {
  isOpen: boolean;
  currentNodeId?: string;
  projectId?: string;
  moveSourceNode?: FileSystemNode | { id: 'batch' } | null;
  copySourceNode?: FileSystemNode | { id: 'batch' } | null;
}

const props = withDefaults(defineProps<Props>(), {
  currentNodeId: '',
  projectId: '',
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  confirm: [targetParentId: string];
}>();

const loading = ref(false);
const folderTree = ref<FolderTreeItem[]>([]);
const selectedFolder = ref<FolderTreeItem[]>([]);

watch(() => props.isOpen, async (val) => {
  if (val) {
    await loadFolders();
  }
});

async function loadFolders(): Promise<void> {
  if (!props.projectId) return;

  loading.value = true;
  try {
    const response = await projectsApi.getChildren(props.projectId, { limit: 1000 });
    const nodes = response.data?.nodes || [];

    folderTree.value = buildFolderTree(nodes);
  } catch (error) {
    console.error('加载文件夹失败:', error);
    folderTree.value = [];
  } finally {
    loading.value = false;
  }
}

function buildFolderTree(nodes: FileSystemNode[]): FolderTreeItem[] {
  return nodes
    .filter((node) => node.isFolder)
    .map((node) => ({
      id: node.id,
      title: node.name,
      children: [],
    }));
}

function handleSelect(items: FolderTreeItem[]): void {
  selectedFolder.value = items;
}

function handleClose(): void {
  selectedFolder.value = [];
  emit('update:isOpen', false);
}

function handleConfirm(): void {
  if (selectedFolder.value.length > 0) {
    emit('confirm', selectedFolder.value[0].id);
    handleClose();
  }
}
</script>
