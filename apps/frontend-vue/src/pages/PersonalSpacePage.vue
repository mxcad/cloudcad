<template>
  <v-main class="personal-space-page">
    <v-container fluid class="pa-6">
      <div class="d-flex align-center ga-3 mb-6">
        <v-btn
          v-if="!isPersonalSpaceRoot"
          variant="text"
          size="small"
          icon="mdi-arrow-left"
          class="mr-2"
          @click="handleGoBack"
        />
        <v-icon size="28" icon="mdi-file-document-outline" color="primary" />
        <div class="text-h5 font-weight-bold">{{ t('personalSpace.title') }}</div>
        <v-spacer />
        <v-btn
          v-if="!isPersonalSpaceRoot && !isTrashView"
          variant="outlined"
          color="primary"
          size="small"
          prepend-icon="mdi-folder-plus"
          :loading="loading"
          @click="showCreateFolderModal = true"
        >
          {{ t('personalSpace.newFolder') }}
        </v-btn>
      </div>

      <v-card rounded="lg" elevation="0" class="file-system-card">
        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          height="2"
        />

        <v-container v-if="error" class="text-center py-16">
          <v-icon size="64" color="error" class="mb-4">mdi-alert-circle-outline</v-icon>
          <div class="text-body-1 text-error mb-4">{{ error }}</div>
          <v-btn variant="outlined" color="primary" @click="loadData">
            {{ t('common.retry') }}
          </v-btn>
        </v-container>

        <template v-else>
          <div v-if="nodes.length === 0" class="text-center py-16">
            <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-folder-open-outline</v-icon>
            <div class="text-h6 text-medium-emphasis mb-2">
              {{ isTrashView ? t('personalSpace.trashEmpty') : t('personalSpace.folderEmpty') }}
            </div>
            <div class="text-body-2 text-disabled mb-4">
              {{ isTrashView ? t('personalSpace.deletedFilesHere') : t('personalSpace.uploadOrCreate') }}
            </div>
          </div>

          <v-list v-else lines="two" class="pa-0">
            <template v-for="(node, index) in nodes" :key="node.id">
              <v-list-item
                :class="{ 'bg-blue-lighten-5': selectedNodes.has(node.id) }"
                @click="handleNodeSelect(node)"
                @dblclick="handleFileOpen(node)"
              >
                <template #prepend>
                  <v-icon :color="node.isFolder ? 'primary' : 'grey'">
                    {{ node.isFolder ? 'mdi-folder' : 'mdi-file-document-outline' }}
                  </v-icon>
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ node.name }}
                </v-list-item-title>

                <v-list-item-subtitle v-if="node.size">
                  {{ formatFileSize(node.size) }}
                </v-list-item-subtitle>

                <template #append>
                  <v-menu>
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        variant="text"
                        size="small"
                        icon="mdi-dots-vertical"
                        @click.stop
                      />
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        v-if="node.isFolder && !isTrashView"
                        prepend-icon="mdi-pencil"
                        :title="t('common.rename')"
                        @click="handleRename(node)"
                      />
                      <v-list-item
                        v-if="!isTrashView"
                        prepend-icon="mdi-delete"
                        :title="t('common.delete')"
                        class="text-error"
                        @click="handleDelete(node)"
                      />
                      <v-list-item
                        v-if="isTrashView"
                        prepend-icon="mdi-delete-restore"
                        :title="t('common.restore')"
                        @click="handleRestore(node)"
                      />
                      <v-list-item
                        v-if="isTrashView"
                        prepend-icon="mdi-delete-forever"
                        :title="t('common.permanentDelete')"
                        class="text-error"
                        @click="handlePermanentDelete(node)"
                      />
                    </v-list>
                  </v-menu>
                </template>
              </v-list-item>

              <v-divider v-if="index < nodes.length - 1" />
            </template>
          </v-list>

          <div v-if="paginationMeta && paginationMeta.totalPages > 1" class="pa-4">
            <v-pagination
              v-model="currentPage"
              :length="paginationMeta.totalPages"
              :total-visible="7"
              rounded="lg"
              @update:model-value="handlePageChange"
            />
          </div>
        </template>
      </v-card>
    </v-container>

    <v-dialog v-model="showCreateFolderModal" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-title>{{ t('personalSpace.newFolder') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newFolderName"
            :label="t('personalSpace.folderName')"
            variant="outlined"
            autofocus
            @keyup.enter="createFolder"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateFolderModal = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="loading" @click="createFolder">
            {{ t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showRenameModal" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-title>{{ t('common.rename') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameValue"
            :label="t('personalSpace.newName')"
            variant="outlined"
            autofocus
            @keyup.enter="confirmRename"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showRenameModal = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="loading" @click="confirmRename">
            {{ t('common.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteConfirm" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-item>
          <template #title>
            <div class="d-flex align-center ga-2">
              <v-icon color="error" size="24">mdi-alert-outline</v-icon>
              <span>{{ t('common.confirmDelete') }}</span>
            </div>
          </template>
          <template #subtitle>
            {{ t('personalSpace.deletedToTrash') }}
          </template>
        </v-card-item>
        <v-card-text class="pt-4">
          <div class="text-body-2">{{ t('personalSpace.confirmDeleteFile', { name: nodeToDelete?.name }) }}</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="loading" @click="showDeleteConfirm = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="loading" @click="confirmDelete">{{ t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>
  </v-main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFileSystemData, type FileSystemNode } from '@/composables/useFileSystemData';
import { useFileSystemSelection } from '@/composables/useFileSystemSelection';
import { useFileSystemNavigation } from '@/composables/useFileSystemNavigation';
import { useFileSystemCRUD } from '@/composables/useFileSystemCRUD';
import { projectsApi } from '@/services/projectsApi';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const {
  nodes,
  loading,
  error,
  paginationMeta,
  isTrashView,
  loadData,
  handlePageChange: fsHandlePageChange,
  setTrashView,
} = useFileSystemData({ mode: 'personal-space' });

const { selectedNodes, handleNodeSelect } = useFileSystemSelection();

const { handleGoBack, handleFileOpen } = useFileSystemNavigation({
  mode: computed(() => 'personal-space'),
  currentNode: ref(null),
  urlProjectId: computed(() => ''),
  isProjectRootMode: computed(() => false),
  isTrashView,
  isPersonalSpaceMode: computed(() => true),
  isFolderMode: computed(() => true),
});

const { createNode, deleteNode, renameNode, restoreNode } = useFileSystemCRUD({
  mode: 'personal-space',
  projectId: computed(() => ''),
});

const currentPage = ref(1);
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
});

const showCreateFolderModal = ref(false);
const newFolderName = ref('');

const showRenameModal = ref(false);
const renamingNode = ref<FileSystemNode | null>(null);
const renameValue = ref('');

const showDeleteConfirm = ref(false);
const nodeToDelete = ref<FileSystemNode | null>(null);

const isPersonalSpaceRoot = computed(() => {
  return !route.path.match(/\/personal-space\/([^/]+)/);
});

function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning') {
  snackbar.value = {
    show: true,
    message,
    color: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success',
  };
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

async function createFolder() {
  if (!newFolderName.value.trim()) return;
  try {
    await createNode(newFolderName.value.trim());
    newFolderName.value = '';
    showCreateFolderModal.value = false;
    loadData();
    showToast(t('personalSpace.folderCreated'), 'success');
  } catch (error) {
    showToast(t('personalSpace.folderCreateFailed'), 'error');
  }
}

function handleRename(node: FileSystemNode) {
  renamingNode.value = node;
  renameValue.value = node.name;
  showRenameModal.value = true;
}

async function confirmRename() {
  if (!renamingNode.value || !renameValue.value.trim()) return;
  try {
    await renameNode(renamingNode.value.id, renameValue.value.trim());
    showRenameModal.value = false;
    renamingNode.value = null;
    renameValue.value = '';
    loadData();
    showToast(t('personalSpace.renameSuccess'), 'success');
  } catch (error) {
    showToast(t('personalSpace.renameFailed'), 'error');
  }
}

function handleDelete(node: FileSystemNode) {
  nodeToDelete.value = node;
  showDeleteConfirm.value = true;
}

async function confirmDelete() {
  if (!nodeToDelete.value) return;
  try {
    await deleteNode(nodeToDelete.value.id);
    showDeleteConfirm.value = false;
    nodeToDelete.value = null;
    loadData();
    showToast(t('personalSpace.deleteSuccess'), 'success');
  } catch (error) {
    showToast(t('personalSpace.deleteFailed'), 'error');
  }
}

async function handleRestore(node: FileSystemNode) {
  try {
    await restoreNode(node.id);
    loadData();
    showToast(t('personalSpace.restoreSuccess'), 'success');
  } catch (error) {
    showToast(t('personalSpace.restoreFailed'), 'error');
  }
}

async function handlePermanentDelete(node: FileSystemNode) {
  try {
    await projectsApi.permanentlyDelete([node.id]);
    loadData();
    showToast(t('personalSpace.permanentDeleteSuccess'), 'success');
  } catch (error) {
    showToast(t('personalSpace.permanentDeleteFailed'), 'error');
  }
}

function handlePageChange(page: number) {
  currentPage.value = page;
  fsHandlePageChange(page);
}

watch(() => route.path, () => {
  currentPage.value = 1;
  loadData();
}, { immediate: true });

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.personal-space-page {
  background-color: rgb(var(--v-theme-background));
  min-height: 100vh;
}

.file-system-card {
  border: 1px solid rgba(var(--v-border-color), 0.12);
}
</style>
