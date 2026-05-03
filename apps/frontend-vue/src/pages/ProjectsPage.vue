<template>
  <v-container fluid class="pa-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header Card -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="mb-6 pa-4"
      >
        <!-- Back button and Breadcrumb -->
        <div class="d-flex align-center ga-3 mb-4">
          <v-btn
            icon="mdi-arrow-left"
            variant="text"
            size="small"
            @click="handleBackNavigation"
          />

          <BreadcrumbNavigation
            :breadcrumbs="breadcrumbs"
            class="flex-grow-1"
            @navigate="handleBreadcrumbNavigate"
          />

          <div class="d-flex align-center ga-2">
            <v-btn
              icon="mdi-refresh"
              variant="text"
              size="small"
              :loading="loading"
              @click="handleRefresh"
            />

            <v-btn
              v-if="!isProjectRootMode"
              :variant="isTrashView ? 'flat' : 'text'"
              :color="isTrashView ? 'primary' : undefined"
              size="small"
              @click="handleToggleTrashView"
            >
              <v-icon start size="16">mdi-delete</v-icon>
              文件回收站
            </v-btn>

            <template v-if="isProjectRootMode">
              <v-btn
                v-if="canCreateProject && !isProjectTrashView"
                icon="mdi-folder-plus"
                variant="text"
                size="small"
                @click="handleOpenCreateProject"
              />
            </template>

            <template v-else>
              <template v-if="!isTrashView">
                <v-btn
                  icon="mdi-folder-plus"
                  variant="text"
                  size="small"
                  :disabled="loading"
                  @click="() => crud.showCreateFolderModal.value = true"
                />

                <v-btn
                  icon="mdi-upload"
                  variant="text"
                  size="small"
                  :disabled="loading"
                  @click="handleUpload"
                />
              </template>
            </template>
          </div>
        </div>

        <!-- Project Filter Tabs -->
        <v-tabs
          v-if="isProjectRootMode"
          v-model="projectFilter"
          density="compact"
          class="mb-4"
        >
          <v-tab value="all">全部</v-tab>
          <v-tab value="owned">我创建的</v-tab>
          <v-tab value="joined">我加入的</v-tab>
        </v-tabs>

        <!-- Toolbar -->
        <FileSystemToolbar
          :search-term="searchQuery"
          :view-mode="viewMode"
          :is-multi-select-mode="isMultiSelectMode"
          :selected-nodes="selectedNodes"
          :nodes-count="displayNodes.length"
          :is-at-root="isProjectRootMode"
          :loading="loading"
          :is-trash-view="isTrashView"
          @update:search-term="handleSearchChange"
          @search-submit="handleSearchSubmit"
          @update:view-mode="viewMode = $event"
          @update:is-multi-select-mode="isMultiSelectMode = $event"
          @select-all="handleSelectAll"
        />
      </v-card>

      <!-- Content Card -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="min-h-[400px]"
      >
        <!-- Loading State -->
        <div v-if="loading && displayNodes.length === 0" class="d-flex flex-column align-center justify-center py-16">
          <v-progress-circular indeterminate color="primary" size="48" />
          <p class="mt-4 text-medium-emphasis">加载中...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error && displayNodes.length === 0" class="d-flex flex-column align-center justify-center py-16">
          <v-icon icon="mdi-alert-circle" color="error" size="48" class="mb-4" />
          <p class="text-error mb-4">{{ error }}</p>
          <v-btn variant="outlined" @click="handleRefresh">
            <v-icon start>mdi-refresh</v-icon>
            重试
          </v-btn>
        </div>

        <!-- Empty State -->
        <div v-else-if="displayNodes.length === 0" class="d-flex flex-column align-center justify-center py-16">
          <v-icon
            :icon="isProjectTrashView || isTrashView ? 'mdi-delete-empty' : 'mdi-folder-open-outline'"
            size="80"
            color="grey-lighten-1"
            class="mb-6"
          />
          <h3 class="text-h6 mb-2">
            {{ isProjectTrashView || isTrashView ? '回收站是空的' : displayNodes.length === 0 && searchQuery ? '没有找到匹配的内容' : '暂无项目' }}
          </h3>
          <p class="text-body-2 text-medium-emphasis mb-6">
            {{ isProjectTrashView ? '删除的项目会出现在这里' : isTrashView ? '删除的文件和文件夹会出现在这里' : searchQuery ? '没有找到匹配的内容' : '开始创建您的第一个项目' }}
          </p>
          <v-btn
            v-if="canCreateProject && !isProjectTrashView && !isTrashView && isProjectRootMode"
            variant="outlined"
            @click="handleOpenCreateProject"
          >
            <v-icon start>mdi-folder-plus</v-icon>
            创建项目
          </v-btn>
        </div>

        <!-- File List -->
        <v-list
          v-else
          :lines="viewMode === 'list' ? 'two-line' : undefined"
          :density="viewMode === 'grid' ? 'compact' : undefined"
          :class="viewMode === 'grid' ? 'd-flex flex-wrap pa-2' : 'pa-0'"
        >
          <template v-for="node in displayNodes" :key="node.id">
            <FileItem
              v-if="viewMode === 'list'"
              :node="node"
              :is-selected="selectedNodes.has(node.id)"
              :view-mode="viewMode"
              :is-multi-select-mode="isMultiSelectMode"
              :is-trash="isTrashView || isProjectTrashView"
              :is-drop-target="dropTargetId === node.id"
              @click="handleNodeSelect(node, $event)"
              @dblclick="handleNodeEnter(node)"
              @select="handleNodeSelect(node, $event, false)"
              @delete="handleDeleteNode"
              @rename="handleOpenRename"
              @restore="handleRestoreNode"
              @move="handleMove"
              @copy="handleCopy"
              @drag-start="handleDragStart"
              @drag-over="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop(node, $event)"
            />

            <v-col
              v-else
              cols="12"
              sm="6"
              md="4"
              lg="3"
              xl="2"
            >
              <FileItem
                :node="node"
                :is-selected="selectedNodes.has(node.id)"
                :view-mode="viewMode"
                :is-multi-select-mode="isMultiSelectMode"
                :is-trash="isTrashView || isProjectTrashView"
                :is-drop-target="dropTargetId === node.id"
                @click="handleNodeSelect(node, $event)"
                @dblclick="handleNodeEnter(node)"
                @select="handleNodeSelect(node, $event, false)"
                @delete="handleDeleteNode"
                @rename="handleOpenRename"
                @restore="handleRestoreNode"
                @move="handleMove"
                @copy="handleCopy"
                @drag-start="handleDragStart"
                @drag-over="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDrop(node, $event)"
              />
            </v-col>
          </template>
        </v-list>

        <!-- Pagination -->
        <div v-if="displayNodes.length > 0" class="px-6 py-4 border-t">
          <Pagination
            :meta="paginationMeta || { total: 0, page: 1, limit: 20, totalPages: 1 }"
            @page-change="handlePageChange"
            @page-size-change="handlePageSizeChange"
          />
        </div>
      </v-card>

      <!-- Batch Actions Bar -->
      <v-card
        v-if="isMultiSelectMode && selectedNodes.size > 0"
        rounded="pill"
        class="fixed-bottom-center pa-4"
        elevation="8"
      >
        <div class="d-flex align-center ga-4">
          <span class="text-body-2">已选中 {{ selectedNodes.size }} 项</span>

          <v-divider vertical />

          <template v-if="isTrashView || isProjectTrashView">
            <v-btn variant="text" color="success" @click="handleBatchRestore">
              恢复
            </v-btn>
            <v-btn variant="text" color="error" @click="() => handleBatchDelete(true)">
              彻底删除
            </v-btn>
          </template>

          <template v-else>
            <v-btn variant="text" @click="handleBatchMove">
              移动
            </v-btn>
            <v-btn variant="text" @click="handleBatchCopy">
              复制
            </v-btn>
            <v-btn variant="text" color="error" @click="() => handleBatchDelete(false)">
              删除
            </v-btn>
          </template>

          <v-divider vertical />

          <v-btn variant="text" @click="handleCancelSelection">
            取消
          </v-btn>
        </div>
      </v-card>
    </div>

    <!-- Toast Notifications -->
    <v-snackbar
      v-for="toast in toasts"
      :key="toast.id"
      v-model="showToastMap[toast.id]"
      :color="getToastColor(toast.type)"
      :timeout="5000"
      location="top-right"
    >
      {{ toast.message }}
      <template #actions>
        <v-btn variant="text" @click="showToastMap[toast.id] = false">
          关闭
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      :is-open="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText || '确定'"
      :type="confirmDialog.type || 'warning'"
      @update:is-open="confirmDialog.isOpen = $event"
      @confirm="confirmDialog.onConfirm"
    />

    <!-- Create Folder Modal -->
    <CreateFolderModal
      :is-open="crud.showCreateFolderModal.value"
      :folder-name="crud.folderName.value"
      :loading="loading"
      @update:is-open="crud.showCreateFolderModal.value = $event"
      @update:folder-name="crud.folderName.value = $event"
      @create="handleCreateFolder"
    />

    <!-- Rename Modal -->
    <RenameModal
      :is-open="crud.showRenameModal.value"
      :editing-node="crud.editingNode.value"
      :new-name="crud.folderName.value"
      :loading="loading"
      @update:is-open="crud.showRenameModal.value = $event"
      @update:new-name="crud.folderName.value = $event"
      @confirm="handleRename"
    />

    <!-- Project Modal -->
    <ProjectModal
      :is-open="projectManagement.isModalOpen.value"
      :editing-project="projectManagement.editingProject.value"
      :form-data="projectManagement.formData.value"
      :loading="projectManagement.loading.value"
      @update:is-open="projectManagement.isModalOpen.value = $event"
      @update:form-data="projectManagement.setFormData($event)"
      @submit="handleSubmitProject"
    />

    <!-- Select Folder Modal -->
    <SelectFolderModal
      :is-open="showSelectFolderModal"
      :current-node-id="moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch' ? '' : moveSourceNode?.id || copySourceNode?.id || ''"
      :project-id="urlProjectId"
      :move-source-node="moveSourceNode"
      :copy-source-node="copySourceNode"
      @update:is-open="showSelectFolderModal = $event"
      @confirm="handleConfirmMoveOrCopy"
    />

    <!-- Download Format Modal -->
    <v-dialog v-model="showDownloadFormatModal" max-width="400">
      <v-card>
        <v-card-title>选择下载格式</v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item
              v-for="format in downloadFormats"
              :key="format.value"
              :title="format.title"
              @click="handleDownloadWithFormat(format.value)"
            />
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDownloadFormatModal = false">取消</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useFileSystemData, type FileSystemNode } from '@/composables/useFileSystemData';
import { useFileSystemUI } from '@/composables/useFileSystemUI';
import { useFileSystemCRUD } from '@/composables/useFileSystemCRUD';
import { useFileSystemSelection } from '@/composables/useFileSystemSelection';
import { useFileSystemNavigation } from '@/composables/useFileSystemNavigation';
import { useFileSystemDragDrop } from '@/composables/useFileSystemDragDrop';
import { useProjectManagement } from '@/composables/useProjectManagement';
import { projectsApi } from '@/services/projectsApi';
import BreadcrumbNavigation from '@/components/BreadcrumbNavigation.vue';
import FileSystemToolbar from '@/components/FileSystemToolbar.vue';
import FileItem from '@/components/FileItem.vue';
import Pagination from '@/components/Pagination.vue';
import CreateFolderModal from '@/components/CreateFolderModal.vue';
import RenameModal from '@/components/RenameModal.vue';
import ProjectModal from '@/components/ProjectModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import SelectFolderModal from '@/components/SelectFolderModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUIStore();

useDocumentTitle(computed(() => isPersonalSpaceMode.value ? '我的图纸' : '项目管理'));

const mode = computed(() => {
  const path = route.path;
  if (path.includes('personal-space')) return 'personal-space' as const;
  return 'project' as const;
});

const isPersonalSpaceMode = computed(() => mode.value === 'personal-space');
const projectFilter = ref<'all' | 'owned' | 'joined'>('all');

const { toasts, confirmDialog, showToast } = useFileSystemUI();

const {
  nodes,
  currentNode,
  breadcrumbs,
  loading,
  error,
  paginationMeta,
  isTrashView,
  isProjectTrashView,
  pagination,
  searchQuery,
  urlProjectId,
  urlNodeId,
  isProjectRootMode,
  loadData,
  setSearch,
  handlePageChange,
  handlePageSizeChange,
  setTrashView,
} = useFileSystemData({
  mode: mode.value,
  projectFilter: projectFilter.value,
});

const selectedNodes = ref<Set<string>>(new Set());
const isMultiSelectMode = ref(false);
const viewMode = ref<'grid' | 'list'>('list');

const isAtRoot = computed(() => isProjectRootMode.value);

const displayNodes = computed(() => Array.isArray(nodes.value) ? nodes.value : []);

const canCreateProject = true;

const crud = useFileSystemCRUD({
  urlProjectId: urlProjectId.value,
  currentNode: currentNode.value,
  loadData,
  showToast,
  showConfirm: (title, message, onConfirm, type, confirmText) => {
    confirmDialog.value = {
      isOpen: true,
      title,
      message,
      confirmText,
      type,
      onConfirm: () => {
        onConfirm();
        confirmDialog.value.isOpen = false;
      },
    };
  },
  selectedNodes: selectedNodes.value,
  nodes: displayNodes.value,
  clearSelection: () => { selectedNodes.value = new Set(); },
  isProjectTrashViewRef: { value: isProjectTrashView.value },
  mode: mode.value,
});

const projectManagement = useProjectManagement({
  onProjectCreated: loadData,
  onProjectUpdated: loadData,
  onProjectDeleted: loadData,
  showToast,
});

const {
  showDownloadFormatModal,
  downloadingNode,
  handleGoBack,
  handleFileOpen,
  handleDownload,
  handleDownloadWithFormat: navDownloadWithFormat,
} = useFileSystemNavigation({
  urlProjectId: urlProjectId.value,
  currentNode: currentNode.value,
  showToast,
  mode: mode.value,
});

const {
  draggedNodes,
  dropTargetId,
  handleDragStart: dragDropHandleDragStart,
  handleDragOver: dragDropHandleDragOver,
  handleDragLeave: dragDropHandleDragLeave,
  handleDrop: dragDropHandleDrop,
} = useFileSystemDragDrop();

const moveSourceNode = ref<FileSystemNode | { id: 'batch' } | null>(null);
const copySourceNode = ref<FileSystemNode | { id: 'batch' } | null>(null);
const showSelectFolderModal = ref(false);

const downloadFormats = [
  { value: 'dwg', title: 'DWG 格式' },
  { value: 'dxf', title: 'DXF 格式' },
  { value: 'mxweb', title: 'MXWeb 格式' },
  { value: 'pdf', title: 'PDF 格式' },
];

const showToastMap = ref<Record<string, boolean>>({});

watch(() => toasts.value, (newToasts) => {
  newToasts.forEach((toast) => {
    if (showToastMap.value[toast.id] === undefined) {
      showToastMap.value[toast.id] = true;
    }
  });
}, { immediate: true, deep: true });

watch(projectFilter, () => {
  loadData();
});

function handleBackNavigation(): void {
  if (isPersonalSpaceMode.value) {
    if (isAtRoot.value) {
      router.push('/personal-space');
    } else {
      handleGoBack();
    }
  } else {
    if (isAtRoot.value) {
      router.push('/projects');
    } else {
      handleGoBack();
    }
  }
}

function handleBreadcrumbNavigate(crumb: { id: string; name: string; isRoot: boolean }): void {
  if (isPersonalSpaceMode.value) {
    if (crumb.isRoot) {
      router.push('/personal-space');
    } else {
      router.push(`/personal-space/${crumb.id}`);
    }
  } else {
    if (crumb.isRoot) {
      router.push(`/projects/${crumb.id}/files`);
    } else {
      router.push(`/projects/${urlProjectId.value}/files/${crumb.id}`);
    }
  }
}

function handleRefresh(): void {
  loadData();
}

function handleToggleTrashView(): void {
  setTrashView(!isTrashView.value);
}

function handleOpenCreateProject(): void {
  projectManagement.openCreateModal();
}

function handleSearchChange(query: string): void {
  setSearch(query);
}

function handleSearchSubmit(): void {
  loadData();
}

function handleNodeSelect(node: FileSystemNode, event: MouseEvent, isShift = false): void {
  const nodeId = node.id;

  if (isMultiSelectMode.value) {
    const newSet = new Set(selectedNodes.value);
    if (isShift && selectedNodes.value.size > 0) {
      const lastSelectedId = Array.from(selectedNodes.value).pop();
      if (lastSelectedId) {
        const lastIndex = displayNodes.value.findIndex(n => n.id === lastSelectedId);
        const currentIndex = displayNodes.value.findIndex(n => n.id === nodeId);
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        for (let i = start; i <= end; i++) {
          newSet.add(displayNodes.value[i].id);
        }
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
    } else {
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
    }
    selectedNodes.value = newSet;
  } else {
    if (event.ctrlKey || event.metaKey || isShift) {
      const newSet = new Set(selectedNodes.value);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      selectedNodes.value = newSet;
    } else {
      selectedNodes.value = new Set([nodeId]);
    }
  }
}

function handleSelectAll(): void {
  if (selectedNodes.value.size === displayNodes.value.length) {
    selectedNodes.value = new Set();
  } else {
    selectedNodes.value = new Set(displayNodes.value.map(n => n.id));
  }
}

function handleNodeEnter(node: FileSystemNode): void {
  handleFileOpen(node);
}

function handleDeleteNode(node: FileSystemNode): void {
  crud.handleDelete(node, false);
}

function handleOpenRename(node: FileSystemNode): void {
  crud.handleOpenRename(node);
}

function handleRestoreNode(node: FileSystemNode): void {
  crud.handleRestoreNode(node);
}

function handleMove(node: FileSystemNode): void {
  moveSourceNode.value = node;
  copySourceNode.value = null;
  showSelectFolderModal.value = true;
}

function handleCopy(node: FileSystemNode): void {
  copySourceNode.value = node;
  moveSourceNode.value = null;
  showSelectFolderModal.value = true;
}

function handleBatchMove(): void {
  moveSourceNode.value = { id: 'batch' };
  copySourceNode.value = null;
  showSelectFolderModal.value = true;
}

function handleBatchCopy(): void {
  copySourceNode.value = { id: 'batch' };
  moveSourceNode.value = null;
  showSelectFolderModal.value = true;
}

function handleBatchDelete(permanently: boolean): void {
  crud.handleBatchDelete(permanently);
}

function handleBatchRestore(): void {
  crud.handleBatchRestore();
}

function handleCancelSelection(): void {
  selectedNodes.value = new Set();
  isMultiSelectMode.value = false;
}

async function handleCreateFolder(): Promise<void> {
  await crud.handleCreateFolder();
}

async function handleRename(): Promise<void> {
  await crud.handleRename();
}

async function handleSubmitProject(): Promise<void> {
  if (projectManagement.editingProject.value) {
    await projectManagement.handleUpdate(async (id, data) => {
      await projectsApi.updateNode(id, {
        name: data.name ?? undefined,
        description: data.description,
      });
    });
  } else {
    await projectManagement.handleCreate(async (name, description) => {
      await projectsApi.create({ name, description });
    });
  }
}

async function handleConfirmMoveOrCopy(targetParentId: string): Promise<void> {
  try {
    if (isMultiSelectMode.value && selectedNodes.value.size > 0) {
      const nodeIds = Array.from(selectedNodes.value) as string[];
      for (const nodeId of nodeIds) {
        if (moveSourceNode.value) {
          await projectsApi.moveNode(nodeId, targetParentId);
        } else {
          await projectsApi.copyNode(nodeId, targetParentId);
        }
      }
    } else if (moveSourceNode.value) {
      await projectsApi.moveNode(moveSourceNode.value.id, targetParentId);
    } else if (copySourceNode.value) {
      await projectsApi.copyNode(copySourceNode.value.id, targetParentId);
    }
    loadData();
    showSelectFolderModal.value = false;
    moveSourceNode.value = null;
    copySourceNode.value = null;
  } catch (error) {
    showToast((error as Error).message || '操作失败，请重试', 'error');
  }
}

function handleDragStart(e: DragEvent, node: FileSystemNode): void {
  if (node.isRoot) {
    e.preventDefault();
    return;
  }
  dragDropHandleDragStart(e, node);
}

function handleDragOver(e: DragEvent, node: FileSystemNode): void {
  dragDropHandleDragOver(e, node);
}

function handleDragLeave(e: DragEvent, node: FileSystemNode): void {
  dragDropHandleDragLeave(e, node);
}

async function handleDrop(node: FileSystemNode, e: DragEvent): Promise<void> {
  await dragDropHandleDrop(
    e,
    node,
    async (draggedNodeId, targetParentId) => {
      await projectsApi.moveNode(draggedNodeId, targetParentId);
    },
    async (draggedNodeId, targetParentId) => {
      await projectsApi.copyNode(draggedNodeId, targetParentId);
    },
    loadData,
    showToast
  );
}

function handleUpload(): void {
  if (!urlProjectId.value) {
    showToast('请先选择一个项目再上传文件', 'warning');
    return;
  }
  showToast('上传功能已集成到 CAD 编辑器中', 'info');
}

function handleDownloadWithFormat(format: string): void {
  navDownloadWithFormat(format as 'dwg' | 'dxf' | 'mxweb' | 'pdf');
}

function getToastColor(type: string): string {
  switch (type) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.max-w-7xl {
  max-width: 80rem;
}

.mx-auto {
  margin-left: auto;
  margin-right: auto;
}

.fixed-bottom-center {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.border-t {
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
}
</style>
