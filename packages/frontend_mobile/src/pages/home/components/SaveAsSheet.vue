<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '@/languages';
import { useSaveAs, type SaveTargetType, type LibraryType, type SaveFormat } from '../../../composables/useSaveAs';
import { useUser } from '../../../composables/useUser';
import { getMxwebBlob } from '../../../services/saveService';
import { showToast } from 'vant';
import type { FileSystemNodeDto } from '../../../api-sdk';
import FloatingPopup from '../../../components/FloatingPopup.vue';

interface FolderNode {
  id: string;
  name: string;
  isFolder: boolean;
  children?: FolderNode[];
}

const props = defineProps<{
  show: boolean;
  currentFileName?: string;
  canManageLibrary?: boolean;
  currentNodeId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', result: { nodeId: string; fileName: string }): void;
  (e: 'login-required'): void;
}>();

const saveAs = useSaveAs();
const { isAuthenticated } = useUser();
const error = ref<string | null>(null);
const step = ref<'form' | 'folder'>('form');
const showProjectPicker = ref(false);

const folderPath = ref<Array<{ id: string; name: string }>>([]);
const folderNodes = ref<FolderNode[]>([]);
const folderLoading = ref(false);
const lastFolderPath = ref<Array<{ id: string; name: string }>>([]);

const invalidChars = /[\x00-\x1F\x7F\\/:*?"<>|]/;

const projectColumns = computed(() =>
  saveAs.projects.value.map(p => ({ text: p.name, value: p.id }))
);

const selectedProjectName = computed(() => {
  const p = saveAs.projects.value.find(p => p.id === saveAs.selectedProjectId.value);
  return p ? p.name : '';
});

const hasLibraryPermission = computed(() => {
  return props.canManageLibrary === true;
});

const saveAsOptions = computed(() => {
  const options: Array<{ label: string; value: SaveTargetType; icon: string }> = [
    { label: t('我的图纸'), value: 'personal', icon: 'home-o' },
    { label: t('项目文件夹'), value: 'project', icon: 'orders-o' },
  ];
  if (hasLibraryPermission.value) {
    options.push({ label: t('公开资源库'), value: 'library', icon: 'apps-o' });
  }
  return options;
});

const formatOptions = computed(() => {
  const formats: Array<{ label: string; value: SaveFormat; desc: string }> = [
    { label: 'DWG', value: 'dwg', desc: t('标准图纸格式') },
    { label: 'DXF', value: 'dxf', desc: t('通用交换格式') },
    { label: 'MXWEB', value: 'mxweb', desc: t('原生格式') },
  ];
  return formats;
});

const displayFileName = computed(() => {
  const name = saveAs.fileName.value || '';
  return name.replace(/\.[^/.]+$/, '');
});

const folderDisplayText = computed(() => {
  if (!saveAs.selectedParentId.value) return t('点击选择文件夹');
  if (folderPath.value.length > 0) {
    return folderPath.value.map(p => p.name).join(' / ');
  }
  if (saveAs.targetType.value === 'personal') {
    return t('我的图纸');
  }
  if (saveAs.targetType.value === 'library') {
    return saveAs.libraryType.value === 'drawing' ? t('图纸库') : t('图块库');
  }
  const p = saveAs.projects.value.find(p => p.id === saveAs.selectedParentId.value);
  return p ? p.name : t('根目录');
});

async function init() {
  error.value = null;
  step.value = 'form';
  const baseName = props.currentFileName?.replace(/\.[^/.]+$/, '') || 'untitled';
  await saveAs.loadPersonalSpace();
  await saveAs.loadProjects();
  saveAs.init(baseName);
}

function onProjectConfirm({ selectedValues }: { selectedValues: string[] }) {
  saveAs.selectedProjectId.value = selectedValues[0];
  saveAs.selectedParentId.value = selectedValues[0] || '';
  folderPath.value = [];
  showProjectPicker.value = false;
}

async function handleSave() {
  if (!isAuthenticated.value) {
    emit('login-required');
    return;
  }
  if (!(saveAs.fileName.value || '').trim()) {
    error.value = t('请输入文件名');
    return;
  }
  if (invalidChars.test(saveAs.fileName.value)) {
    error.value = t('文件名不能包含以下字符: \\ / : * ? " < > |');
    return;
  }
  if (!saveAs.selectedParentId.value) {
    if (saveAs.targetType.value === 'personal') {
      saveAs.selectedParentId.value = saveAs.personalSpaceId.value || '';
      if (!saveAs.selectedParentId.value) {
        error.value = t('无法获取个人空间');
        return;
      }
    } else if (saveAs.targetType.value === 'project') {
      if (!saveAs.selectedProjectId.value) {
        error.value = t('请先选择项目');
        return;
      }
      saveAs.selectedParentId.value = saveAs.selectedProjectId.value;
    } else if (saveAs.targetType.value === 'library') {
      error.value = t('请先选择文件夹');
      return;
    }
  }

  error.value = null;

  try {
    const blob = await getMxwebBlob();
    const result = await saveAs.executeSaveAs({
      blob,
      targetType: saveAs.targetType.value,
      libraryType: saveAs.targetType.value === 'library' ? saveAs.libraryType.value : undefined,
      selectedProjectId: saveAs.targetType.value === 'project' ? saveAs.selectedProjectId.value : undefined,
      selectedParentId: saveAs.selectedParentId.value,
      format: saveAs.format.value,
      fileName: saveAs.fileName.value,
    });

    if (result.success) {
      showToast(t('保存成功'));
      emit('success', { nodeId: result.nodeId || '', fileName: saveAs.fileName.value });
      emit('close');
    } else {
      error.value = result.message || t('保存失败');
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('保存失败，请稍后重试');
  }
}

async function openFolderPicker() {
  folderLoading.value = true;
  step.value = 'folder';

  let rootId = '';
  if (saveAs.targetType.value === 'personal') {
    rootId = saveAs.personalSpaceId.value || '';
  } else if (saveAs.targetType.value === 'project') {
    rootId = saveAs.selectedProjectId.value;
    if (!rootId) {
      showToast(t('请先选择项目'));
      step.value = 'form';
      folderLoading.value = false;
      return;
    }
  } else if (saveAs.targetType.value === 'library') {
    rootId = saveAs.libraryRootId.value || '';
    if (!rootId) {
      await saveAs.loadLibraryRoot(saveAs.libraryType.value);
      rootId = saveAs.libraryRootId.value || '';
    }
    if (!rootId) {
      showToast(t('无法加载资源库'));
      step.value = 'form';
      folderLoading.value = false;
      return;
    }
  }

  if (lastFolderPath.value.length > 0) {
    folderPath.value = [...lastFolderPath.value];
    const leaf = folderPath.value[folderPath.value.length - 1];
    folderNodes.value = await loadFolderChildren(leaf.id);
  } else {
    folderPath.value = [];
    folderNodes.value = await loadFolderChildren(rootId);
  }
  folderLoading.value = false;
}

async function loadFolderChildren(parentId: string): Promise<FolderNode[]> {
  if (!parentId) return [];
  try {
    if (saveAs.targetType.value === 'library') {
      const { libraryControllerGetDrawingChildren, libraryControllerGetBlockChildren } = await import('../../../api-sdk');
      const apiFn: (options: { path: { nodeId: string }; query?: { nodeType?: 'folder' | 'file' } }) => Promise<{ error?: unknown; data?: unknown }> =
        saveAs.libraryType.value === 'drawing'
          ? libraryControllerGetDrawingChildren
          : libraryControllerGetBlockChildren;
      const result = await apiFn({ path: { nodeId: parentId }, query: { nodeType: 'folder' } });
      if (result.error) return [];
      const data = result.data as unknown as { nodes: FileSystemNodeDto[] };
      return (data?.nodes || [])
        .filter(n => n.isFolder && n.id !== props.currentNodeId)
        .map(n => ({
          id: n.id,
          name: n.name,
          isFolder: n.isFolder,
        }));
    }
    const { nodeControllerGetChildren } = await import('../../../api-sdk');
    const result = await nodeControllerGetChildren({ path: { nodeId: parentId }, query: { nodeType: 'folder' } });
    if (result.error) return [];
    const data = result.data as unknown as { nodes: FileSystemNodeDto[] };
    return (data?.nodes || [])
      .filter(n => n.id !== props.currentNodeId)
      .map(n => ({
        id: n.id,
        name: n.name,
        isFolder: n.isFolder,
      }));
  } catch {
    return [];
  }
}

async function enterFolder(nodeId: string, nodeName: string) {
  folderPath.value.push({ id: nodeId, name: nodeName });
  folderLoading.value = true;
  folderNodes.value = await loadFolderChildren(nodeId);
  folderLoading.value = false;
}

async function goToRoot() {
  folderPath.value = [];
  await loadRootChildren();
}

async function navigateToBreadcrumb(index: number) {
  if (index === folderPath.value.length - 1) return;
  const target = folderPath.value[index];
  if (!target) {
    await goToRoot();
    return;
  }
  folderPath.value = folderPath.value.slice(0, index + 1);
  folderLoading.value = true;
  folderNodes.value = await loadFolderChildren(target.id);
  folderLoading.value = false;
}

async function loadRootChildren() {
  let rootId = '';
  if (saveAs.targetType.value === 'personal') {
    rootId = saveAs.personalSpaceId.value || '';
  } else if (saveAs.targetType.value === 'project') {
    rootId = saveAs.selectedProjectId.value;
  } else if (saveAs.targetType.value === 'library') {
    rootId = saveAs.libraryRootId.value || '';
  }
  if (rootId) {
    folderLoading.value = true;
    folderNodes.value = await loadFolderChildren(rootId);
    folderLoading.value = false;
  }
}

async function goUp() {
  if (folderPath.value.length === 0) return;
  folderPath.value.pop();
  let parentId = '';
  if (folderPath.value.length > 0) {
    parentId = folderPath.value[folderPath.value.length - 1].id;
  } else if (saveAs.targetType.value === 'personal') {
    parentId = saveAs.personalSpaceId.value || '';
  } else if (saveAs.targetType.value === 'project') {
    parentId = saveAs.selectedProjectId.value;
  } else if (saveAs.targetType.value === 'library') {
    parentId = saveAs.libraryRootId.value || '';
  }

  if (parentId) {
    folderLoading.value = true;
    folderNodes.value = await loadFolderChildren(parentId);
    folderLoading.value = false;
  }
}

function selectFolder(nodeId: string) {
  saveAs.selectedParentId.value = nodeId;
  lastFolderPath.value = [...folderPath.value];
  step.value = 'form';
}

function handleBeforeClose(): boolean | void {
  if (step.value === 'folder') {
    step.value = 'form';
    return false;
  }
}

function onClose() {
  emit('close');
}

function goBack() {
  if (step.value === 'folder') {
    step.value = 'form';
  }
}

function getRootName(): string {
  if (saveAs.targetType.value === 'personal') {
    return t('我的图纸');
  } else if (saveAs.targetType.value === 'project') {
    const p = saveAs.projects.value.find(p => p.id === saveAs.selectedProjectId.value);
    return p ? p.name : '';
  } else if (saveAs.targetType.value === 'library') {
    return saveAs.libraryType.value === 'drawing' ? t('图纸库') : t('图块库');
  }
  return '';
}

function selectRootFolder() {
  let rootId = '';
  if (saveAs.targetType.value === 'personal') {
    rootId = saveAs.personalSpaceId.value || '';
  } else if (saveAs.targetType.value === 'project') {
    rootId = saveAs.selectedProjectId.value;
  } else if (saveAs.targetType.value === 'library') {
    rootId = saveAs.libraryRootId.value || '';
  }
  if (rootId) {
    saveAs.selectedParentId.value = rootId;
    lastFolderPath.value = [];
    step.value = 'form';
  }
}

async function onLibraryTypeChange(newType: LibraryType) {
  saveAs.libraryType.value = newType;
  saveAs.selectedParentId.value = '';
  folderPath.value = [];
  await saveAs.loadLibraryRoot(newType);
  saveAs.selectedParentId.value = saveAs.libraryRootId.value || '';
}

async function onTargetTypeChange(newType: SaveTargetType) {
  saveAs.targetType.value = newType;
  saveAs.selectedParentId.value = '';
  folderPath.value = [];
  if (newType === 'personal') {
    saveAs.selectedParentId.value = saveAs.personalSpaceId.value || '';
  } else if (newType === 'project') {
    saveAs.selectedParentId.value = saveAs.selectedProjectId.value || '';
  } else if (newType === 'library') {
    await saveAs.loadLibraryRoot(saveAs.libraryType.value);
    saveAs.selectedParentId.value = saveAs.libraryRootId.value || '';
  }
}
</script>

<template>
  <FloatingPopup
    :show="show"
    :title="step === 'form' ? t('另存为') : t('选择文件夹')"
    :anchors="[0.85, 0.95]"
    :before-close="handleBeforeClose"
    @open="init"
    @close="onClose"
    @update:show="onClose"
  >
    <!-- Folder Picker View -->
    <template v-if="step === 'folder'">
      <div class="folder-picker">
        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <button class="breadcrumb-home" @click="goToRoot">
            <van-icon name="home-o" size="16" />
          </button>
          <van-icon name="arrow" size="12" class="breadcrumb-arrow" />
          <button
            class="breadcrumb-item breadcrumb-root"
            :class="{ active: folderPath.length === 0 }"
            @click="goToRoot"
          >
            {{ getRootName() }}
          </button>
          <template v-for="(p, i) in folderPath" :key="p.id">
            <van-icon name="arrow" size="12" class="breadcrumb-arrow" />
            <button
              class="breadcrumb-item"
              :class="{ active: i === folderPath.length - 1 }"
              @click="navigateToBreadcrumb(i)"
            >
              {{ p.name }}
            </button>
          </template>
        </div>

        <!-- Loading -->
        <van-loading v-if="folderLoading" class="folder-loading" />

        <!-- Folder List -->
        <div v-else class="folder-list">
          <button
            v-for="node in folderNodes"
            :key="node.id"
            class="folder-item"
            @click="enterFolder(node.id, node.name)"
          >
            <div class="folder-item-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span class="folder-item-name">{{ node.name }}</span>
            <van-icon name="arrow" size="16" class="folder-item-arrow" />
          </button>

          <div v-if="folderNodes.length === 0" class="folder-empty">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted)">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <p>{{ t('无子文件夹') }}</p>
          </div>
        </div>

        <!-- Library root hint -->
        <div
          v-if="folderPath.length === 0 && saveAs.targetType.value === 'library'"
          class="root-hint"
        >
          <van-icon name="info-o" size="16" />
          <span>{{ t('当前为资源库根目录，请选择子文件夹') }}</span>
        </div>
      </div>
    </template>

    <!-- Main Form View -->
    <template v-else>
      <div class="save-form">
        <!-- Error -->
        <Transition name="fade">
          <div v-if="error" class="form-error">
            <van-icon name="warning-o" size="16" />
            <span>{{ error }}</span>
          </div>
        </Transition>

        <!-- File Name -->
        <div class="form-section">
          <label class="form-label">{{ t('文件名') }}</label>
          <div class="filename-input-wrap">
            <van-field
              v-model="saveAs.fileName.value"
              :placeholder="t('请输入文件名')"
              :disabled="saveAs.saving.value"
              class="filename-input"
              clearable
            />
          </div>
        </div>

        <!-- Save Location -->
        <div class="form-section">
          <label class="form-label">{{ t('保存到') }}</label>
          <div class="location-tabs">
            <button
              v-for="opt in saveAsOptions"
              :key="opt.value"
              class="location-tab"
              :class="{ active: saveAs.targetType.value === opt.value }"
              :disabled="saveAs.saving.value"
              @click="onTargetTypeChange(opt.value)"
            >
              <van-icon :name="opt.icon" size="18" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>

        <!-- Project Picker (when project selected) -->
        <Transition name="slide-fade">
          <div v-if="saveAs.targetType.value === 'project'" class="form-section">
            <label class="form-label">{{ t('选择项目') }}</label>
            <button class="select-input" @click="showProjectPicker = true">
              <span :class="{ placeholder: !selectedProjectName }">
                {{ selectedProjectName || t('请选择项目') }}
              </span>
              <van-icon name="arrow" size="16" />
            </button>
          </div>
        </Transition>

        <!-- Library Type (when library selected) -->
        <Transition name="slide-fade">
          <div v-if="saveAs.targetType.value === 'library'" class="form-section">
            <label class="form-label">{{ t('选择资源库') }}</label>
            <div class="library-tabs">
              <button
                class="library-tab"
                :class="{ active: saveAs.libraryType.value === 'drawing' }"
                :disabled="saveAs.saving.value"
                @click="onLibraryTypeChange('drawing')"
              >
                <van-icon name="description" size="18" />
                <span>{{ t('图纸库') }}</span>
              </button>
              <button
                class="library-tab"
                :class="{ active: saveAs.libraryType.value === 'block' }"
                :disabled="saveAs.saving.value"
                @click="onLibraryTypeChange('block')"
              >
                <van-icon name="apps-o" size="18" />
                <span>{{ t('图块库') }}</span>
              </button>
            </div>
          </div>
        </Transition>

        <!-- Folder Picker -->
        <div class="form-section">
          <label class="form-label">{{ t('保存位置') }}</label>
          <button
            class="select-input folder-select"
            @click="openFolderPicker"
            :disabled="saveAs.saving.value || (saveAs.targetType.value === 'project' && !saveAs.selectedProjectId.value)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="folder-icon" style="flex-shrink:0">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="folder-text">{{ folderDisplayText }}</span>
            <van-icon name="arrow" size="16" />
          </button>
        </div>

        <!-- Format -->
        <div class="form-section">
          <label class="form-label">{{ t('保存格式') }}</label>
          <div class="format-grid">
            <button
              v-for="fmt in formatOptions"
              :key="fmt.value"
              class="format-card"
              :class="{ active: saveAs.format.value === fmt.value }"
              :disabled="saveAs.saving.value"
              @click="saveAs.format.value = fmt.value"
            >
              <span class="format-label">{{ fmt.label }}</span>
              <span class="format-desc">{{ fmt.desc }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Footer -->
    <template #footer>
      <template v-if="step === 'form'">
        <button class="footer-btn footer-btn--primary" @click="handleSave" :loading="saveAs.saving.value">
          <van-icon name="cloud-o" size="18" />
          {{ t('保存到云图') }}
        </button>
      </template>
      <template v-else-if="step === 'folder'">
        <button
          v-if="folderPath.length === 0 && saveAs.targetType.value !== 'library'"
          class="footer-btn footer-btn--primary"
          @click="selectRootFolder"
        >
          <van-icon name="success" size="18" />
          {{ t('保存到根目录') }}
        </button>
        <button
          v-else-if="folderPath.length > 0"
          class="footer-btn footer-btn--primary"
          @click="selectFolder(folderPath[folderPath.length - 1].id)"
        >
          <van-icon name="success" size="18" />
          {{ t('保存到当前文件夹') }}
        </button>
      </template>
    </template>
  </FloatingPopup>

  <!-- Project Picker Popup -->
  <van-popup
    v-model:show="showProjectPicker"
    position="bottom"
    round
    teleport="body"
    :style="{ zIndex: 2100 }"
  >
    <van-picker
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
      class="project-picker"
    />
  </van-popup>
</template>

<style scoped lang="scss">
// === Form Container ===
.save-form {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

// === Error ===
.form-error {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: var(--radius-lg);
  color: var(--danger);
  font-size: var(--font-size-caption);
}

// === Form Section ===
.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-label {
  font-size: var(--font-size-caption);
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// === Filename Input ===
.filename-input-wrap {
  background: var(--popup-card-bg);
  border-radius: var(--radius-lg);
  border: var(--popup-card-border);
  overflow: hidden;
}

.filename-input {
  background: transparent;
  font-size: var(--font-size-body);
}

// === Location Tabs ===
.location-tabs {
  display: flex;
  gap: var(--space-sm);
}

.location-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-sm);
  background: var(--popup-card-bg);
  border: var(--popup-card-border);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.97);
  }

  &.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--popup-card-bg));
    color: var(--primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .van-icon {
    font-size: 22px;
  }
}

// === Select Input ===
.select-input {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--popup-card-bg);
  border: var(--popup-card-border);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: var(--font-size-body);
  transition: all 0.2s ease;

  &:active {
    border-color: var(--primary);
  }

  &:disabled {
    opacity: 0.5;
  }

  .placeholder {
    color: var(--text-muted);
  }

  .van-icon:last-child {
    margin-left: auto;
    color: var(--text-muted);
  }
}

.folder-select {
  .folder-icon {
    color: var(--accent);
  }

  .folder-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
}

// === Library Tabs ===
.library-tabs {
  display: flex;
  gap: var(--space-sm);
}

.library-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--popup-card-bg);
  border: var(--popup-card-border);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.97);
  }

  &.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--popup-card-bg));
    color: var(--primary);
  }
}

// === Format Grid ===
.format-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
}

.format-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-md) var(--space-sm);
  background: var(--popup-card-bg);
  border: var(--popup-card-border);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.97);
  }

  &.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--popup-card-bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .format-label {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-primary);
  }

  .format-desc {
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
  }

  &.active .format-label {
    color: var(--primary);
  }
}

// === Folder Picker ===
.folder-picker {
  display: flex;
  flex-direction: column;
  min-height: 300px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-lg);
  border-bottom: var(--border-light);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.breadcrumb-home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.breadcrumb-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

.breadcrumb-item {
  font-size: var(--font-size-sm);
  color: var(--primary);
  white-space: nowrap;
  flex-shrink: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);

  &:active {
    background: var(--bg-tertiary);
  }

  &.active {
    font-weight: 600;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }
}

.breadcrumb-root {
  color: var(--text-secondary);

  &.active {
    color: var(--primary);
  }
}

.folder-loading {
  align-self: center;
  margin-top: 60px;
}

.folder-list {
  flex: 1;
  padding: var(--space-sm) 0;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  transition: background 0.15s ease;

  &:active {
    background: var(--bg-tertiary);
  }

  .folder-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    flex-shrink: 0;
  }

  .folder-item-name {
    flex: 1;
    font-size: var(--font-size-body);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .folder-item-arrow {
    color: var(--text-muted);
    flex-shrink: 0;
  }
}

.folder-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl) 0;
  color: var(--text-muted);

  p {
    margin: 0;
    font-size: var(--font-size-sm);
  }
}

.root-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin: var(--space-md) var(--space-lg);
  padding: var(--space-md);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
}

// === Footer Button ===
.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-body);
  font-weight: 500;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
  }

  &--primary {
    background: var(--primary);
    color: #fff;
    border: none;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 40%, transparent);
  }
}

// === Transitions ===
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// === Project Picker ===
.project-picker {
  min-height: 200px;

  :deep(.van-picker__toolbar) {
    button {
      background: none;
      border: none;
    }
  }

  :deep(.van-picker__confirm) {
    font-weight: 600;
  }
}
</style>
