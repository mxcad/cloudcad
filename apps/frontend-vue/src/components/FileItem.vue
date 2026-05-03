<template>
  <v-card
    :class="[
      'file-item',
      isSelected ? 'file-item--selected' : '',
      isDropTarget ? 'file-item--drop-target' : '',
    ]"
    :variant="isSelected ? 'tonal' : 'outlined'"
    :color="isSelected ? 'primary' : undefined"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    draggable="true"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <v-card-text class="d-flex align-center pa-2">
      <v-checkbox
        v-if="isMultiSelectMode"
        :model-value="isSelected"
        density="compact"
        hide-details
        @click.stop
        @update:model-value="handleSelect"
      />

      <v-icon
        :icon="getFileIcon"
        :color="getIconColor"
        class="mr-2 flex-shrink-0"
      />

      <div class="flex-grow-1 min-width-0">
        <div class="text-body-2 text-truncate">{{ node.name }}</div>
        <div v-if="showDetails" class="text-caption text-disabled">
          {{ formatFileSize(node.size) }} · {{ formatDate(node.updatedAt) }}
        </div>
      </div>

      <v-menu v-if="showActions" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            icon="mdi-dots-vertical"
            variant="text"
            size="small"
            @click.stop
          />
        </template>
        <v-list density="compact" nav>
          <v-list-item
            v-if="onDownload"
            prepend-icon="mdi-download"
            :title="t('file.download')"
            @click.stop="onDownload?.(node)"
          />
          <v-list-item
            v-if="onRename"
            prepend-icon="mdi-pencil"
            :title="t('file.rename')"
            @click.stop="onRename?.(node)"
          />
          <v-list-item
            v-if="onMove"
            prepend-icon="mdi-folder-move"
            :title="t('file.move')"
            @click.stop="onMove?.(node)"
          />
          <v-list-item
            v-if="onCopy"
            prepend-icon="mdi-content-copy"
            :title="t('file.copy')"
            @click.stop="onCopy?.(node)"
          />
          <v-divider v-if="showDeleteAction" />
          <v-list-item
            v-if="onRestore"
            prepend-icon="mdi-restore"
            :title="t('file.restore')"
            @click.stop="onRestore?.(node)"
          />
          <v-list-item
            v-if="onPermanentlyDelete"
            prepend-icon="mdi-delete-forever"
            :title="t('file.permanentlyDelete')"
            class="text-error"
            @click.stop="onPermanentlyDelete?.(node)"
          />
          <v-list-item
            v-else-if="showDeleteAction && onDelete"
            prepend-icon="mdi-delete"
            :title="t('file.delete')"
            class="text-error"
            @click.stop="onDelete?.(node)"
          />
        </v-list>
      </v-menu>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FileSystemNode } from '@/composables/useFileSystemData';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  node: FileSystemNode;
  isSelected?: boolean;
  viewMode?: 'grid' | 'list';
  isMultiSelectMode?: boolean;
  isTrash?: boolean;
  isDropTarget?: boolean;
  showActions?: boolean;
  onSelect?: (node: FileSystemNode, event: MouseEvent, isShift: boolean) => void;
  onEnter?: (node: FileSystemNode) => void;
  onDownload?: (node: FileSystemNode) => void;
  onDelete?: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename?: (node: FileSystemNode) => void;
  onRestore?: (node: FileSystemNode) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onDragStart?: (e: DragEvent, node: FileSystemNode) => void;
  onDragOver?: (e: DragEvent, node: FileSystemNode) => void;
  onDragLeave?: (e: DragEvent, node: FileSystemNode) => void;
  onDrop?: (e: DragEvent, node: FileSystemNode) => void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  viewMode: 'list',
  isMultiSelectMode: false,
  isTrash: false,
  isDropTarget: false,
  showActions: true,
});

const showDetails = computed(() => props.viewMode === 'list');
const showDeleteAction = computed(() => !props.isTrash && props.onDelete);

const getFileIcon = computed(() => {
  if (props.node.isFolder) {
    return props.isTrash ? 'mdi-folder-outline' : 'mdi-folder';
  }

  const ext = props.node.extension?.toLowerCase();
  switch (ext) {
    case '.dwg':
    case '.dxf':
      return 'mdi-file-cad-box';
    case '.pdf':
      return 'mdi-file-pdf-box';
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.bmp':
      return 'mdi-file-image';
    case '.doc':
    case '.docx':
      return 'mdi-file-word';
    case '.xls':
    case '.xlsx':
      return 'mdi-file-excel';
    case '.ppt':
    case '.pptx':
      return 'mdi-file-powerpoint';
    case '.zip':
    case '.rar':
    case '.7z':
      return 'mdi-folder-zip';
    case '.txt':
    case '.md':
      return 'mdi-file-document';
    case '.json':
    case '.xml':
    case '.yaml':
    case '.yml':
      return 'mdi-file-code';
    default:
      return 'mdi-file';
  }
});

const getIconColor = computed(() => {
  if (props.node.isFolder) {
    return 'warning';
  }

  const ext = props.node.extension?.toLowerCase();
  switch (ext) {
    case '.dwg':
    case '.dxf':
      return 'primary';
    case '.pdf':
      return 'error';
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.bmp':
      return 'success';
    default:
      return 'grey';
  }
});

function formatFileSize(size?: number): string {
  if (!size) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let s = size;
  while (s >= 1024 && i < units.length - 1) {
    s /= 1024;
    i++;
  }
  return `${s.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
}

function handleClick(e: MouseEvent): void {
  const isShift = e.shiftKey;
  props.onSelect?.(props.node, e, isShift);
}

function handleDoubleClick(): void {
  props.onEnter?.(props.node);
}

function handleDragStart(e: DragEvent): void {
  props.onDragStart?.(e, props.node);
}

function handleDragOver(e: DragEvent): void {
  props.onDragOver?.(e, props.node);
}

function handleDragLeave(e: DragEvent): void {
  props.onDragLeave?.(e, props.node);
}

function handleDrop(e: DragEvent): void {
  props.onDrop?.(e, props.node);
}

function handleSelect(): void {
  props.onSelect?.(props.node, new MouseEvent('click'), false);
}
</script>

<style scoped>
.file-item {
  cursor: pointer;
  transition: all 0.2s;
}

.file-item:hover {
  transform: translateY(-2px);
}

.file-item--selected {
  border-color: rgb(var(--v-theme-primary));
}

.file-item--drop-target {
  border: 2px dashed rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.min-width-0 {
  min-width: 0;
}
</style>
