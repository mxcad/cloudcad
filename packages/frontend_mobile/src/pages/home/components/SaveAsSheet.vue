<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '@/languages';
import { useSaveAs, type SaveTargetType, type LibraryType, type SaveFormat } from '../../../composables/useSaveAs';
import { useUser } from '../../../composables/useUser';
import { getMxwebBlob } from '../../../services/saveService';
import { showToast } from 'vant';
import type { FileSystemNodeDto } from '../../../api-sdk';
import FloatingPopup from "../../../components/FloatingPopup.vue"

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
  const options: Array<{ label: string; value: SaveTargetType }> = [
    { label: t('我的图纸'), value: 'personal' },
    { label: t('项目文件夹'), value: 'project' },
  ];
  if (hasLibraryPermission.value) {
    options.push({ label: t('公开资源库'), value: 'library' });
  }
  return options;
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
  saveAs.selectedParentId.value = '';
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

  if (saveAs.format.value === 'pdf') {
    error.value = t('云图保存不支持 PDF 格式，请选择其他格式或使用"另存为到本地"');
    return;
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

async function handleSaveLocal() {
  try {
    const fmt = saveAs.format.value;
    if (fmt === 'mxweb') {
      const blob = await getMxwebBlob();
      const name = `${saveAs.fileName.value || 'drawing'}.mxweb`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('已下载到本地'));
    } else if (fmt === 'pdf') {
      const { exportDrawing: exportAndDownload } = await import('../../../services/exportService');
      const { showPdfOptionsDialog: showPdfOpts } = await import('../../../services/exportService');
      const pdfOptions = await showPdfOpts();
      if (pdfOptions) {
        await exportAndDownload('pdf', saveAs.fileName.value || 'drawing', pdfOptions);
      } else {
        return;
      }
    } else {
      const { exportDrawing: exportAndDownload } = await import('../../../services/exportService');
      await exportAndDownload(fmt, saveAs.fileName.value || 'drawing');
    }
    emit('close');
  } catch {
    showToast(t('下载失败'));
  }
}

async function openFolderPicker() {
  folderPath.value = [];
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
      return;
    }
  }

  folderNodes.value = await loadFolderChildren(rootId);
  folderLoading.value = false;
}

async function loadFolderChildren(parentId: string): Promise<FolderNode[]> {
  if (!parentId) return [];
  try {
    const { fileSystemControllerGetChildren } = await import('../../../api-sdk');
    const result = await fileSystemControllerGetChildren({ path: { nodeId: parentId }, query: { filter: 'folder' } as any });
    if (result.error) return [];
    const data = result.data as unknown as { nodes: FileSystemNodeDto[] };
    return (data?.nodes || []).map(n => ({
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

function goUp() {
  if (folderPath.value.length === 0) return;
  folderPath.value.pop();
  const parentId = folderPath.value.length > 0
    ? folderPath.value[folderPath.value.length - 1].id
    : (saveAs.targetType.value === 'personal' ? saveAs.personalSpaceId.value : saveAs.selectedProjectId.value);

  if (parentId) {
    folderLoading.value = true;
    loadFolderChildren(parentId).then(nodes => {
      folderNodes.value = nodes;
      folderLoading.value = false;
    });
  }
}

function selectFolder(nodeId: string) {
  saveAs.selectedParentId.value = nodeId;
  step.value = 'form';
}

function onClose() {
  emit('close');
}
</script>

<template>
  <FloatingPopup
    :show="show"
    :title="step === 'form' ? t('另存为') : t('选择文件夹')"
    @open="init"
    @close="onClose"
    @update:show="onClose"
  >
    <!-- Folder Picker View -->
    <template v-if="step === 'folder'">
      <div class="folder-breadcrumb">
        <span class="folder-breadcrumb-item" @click="goUp">{{ t('根目录') }}</span>
        <template v-for="(p, i) in folderPath" :key="p.id">
          <span class="folder-breadcrumb-sep">/</span>
          <span class="folder-breadcrumb-item" @click="folderPath.splice(i + 1); enterFolder(p.id, p.name)">{{ p.name }}</span>
        </template>
      </div>
      <van-loading v-if="folderLoading" class="loading-state" />
      <van-cell-group v-else>
        <van-cell
          v-for="node in folderNodes"
          :key="node.id"
          :title="node.name"
          is-link
          @click="enterFolder(node.id, node.name)"
        />
        <van-empty v-if="folderNodes.length === 0" :description="t('无子文件夹')" />
        <van-button
          v-if="folderPath.length > 0"
          type="primary"
          block
          class="select-folder-btn"
          @click="selectFolder(folderPath[folderPath.length - 1].id)"
        >
          {{ t('选择当前文件夹') }}
        </van-button>
      </van-cell-group>
    </template>

    <!-- Main Form View -->
    <template v-else>
      <div class="sheet-body">
        <div v-if="error" class="sheet-error">{{ error }}</div>

        <div class="sheet-field">
          <label class="sheet-label">{{ t('文件名') }}</label>
          <van-field
            v-model="saveAs.fileName.value"
            :placeholder="t('请输入文件名')"
            :disabled="saveAs.saving.value"
            clearable
          />
        </div>

        <div class="sheet-field">
          <label class="sheet-label">{{ t('保存到') }}</label>
          <van-radio-group v-model="saveAs.targetType.value" direction="horizontal">
            <van-radio
              v-for="opt in saveAsOptions"
              :key="opt.value"
              :name="opt.value"
              :disabled="saveAs.saving.value"
            >
              {{ opt.label }}
            </van-radio>
          </van-radio-group>
        </div>

        <div v-if="saveAs.targetType.value === 'project'" class="sheet-field">
          <label class="sheet-label">{{ t('选择项目') }}</label>
          <van-field
            :model-value="selectedProjectName || t('请选择项目')"
            is-link
            readonly
            :disabled="saveAs.saving.value"
            @click="showProjectPicker = true"
          />
        </div>

        <div v-if="saveAs.targetType.value === 'library'" class="sheet-field">
          <label class="sheet-label">{{ t('选择资源库') }}</label>
          <van-radio-group v-model="saveAs.libraryType.value" direction="horizontal">
            <van-radio name="drawing" :disabled="saveAs.saving.value">{{ t('图纸库') }}</van-radio>
            <van-radio name="block" :disabled="saveAs.saving.value">{{ t('图块库') }}</van-radio>
          </van-radio-group>
        </div>

        <div class="sheet-field">
          <label class="sheet-label">{{ t('保存位置') }}</label>
          <van-button
            size="small"
            type="default"
            @click="openFolderPicker"
            :disabled="saveAs.saving.value || (saveAs.targetType.value === 'project' && !saveAs.selectedProjectId.value)"
          >
            {{ saveAs.selectedParentId.value ? t('已选择文件夹') : t('点击选择文件夹') }}
          </van-button>
        </div>

        <div class="sheet-field">
          <label class="sheet-label">{{ t('保存格式') }}</label>
          <van-radio-group v-model="saveAs.format.value" direction="horizontal">
            <van-radio name="dwg" :disabled="saveAs.saving.value">DWG</van-radio>
            <van-radio name="dxf" :disabled="saveAs.saving.value">DXF</van-radio>
            <van-radio name="pdf" :disabled="saveAs.saving.value">PDF</van-radio>
            <van-radio name="mxweb" :disabled="saveAs.saving.value">MXWEB</van-radio>
          </van-radio-group>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="step === 'form'">
        <van-button
          type="default"
          @click="handleSaveLocal"
          :disabled="saveAs.saving.value"
          class="footer-btn"
        >
          {{ t('另存为到本地') }}
        </van-button>
        <van-button
          type="primary"
          @click="handleSave"
          :loading="saveAs.saving.value"
          class="footer-btn"
        >
          {{ t('保存') }}
        </van-button>
      </template>
    </template>
  </FloatingPopup>

  <!-- Project Picker Popup -->
  <FloatingPopup
    v-model:show="showProjectPicker"
    :title="t('选择项目')"
  >
    <van-picker
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    />
  </FloatingPopup>
</template>

<style scoped lang="scss">
.loading-state {
  margin-top: 40px;
}

.sheet-body {
  padding: var(--space-lg);
}

.sheet-field {
  margin-bottom: var(--space-xl);
}

.sheet-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  margin-bottom: var(--space-sm);
  color: var(--text-tertiary);
}

.sheet-error {
  padding: 10px var(--space-lg);
  background: rgba(255, 68, 68, 0.1);
  color: var(--danger);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-lg);
  font-size: var(--font-size-sm);
}

.footer-btn {
  flex: 1;
}

.folder-breadcrumb {
  padding: var(--space-sm) var(--space-lg);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
}

.folder-breadcrumb-item {
  color: var(--primary);
  cursor: pointer;
}

.folder-breadcrumb-sep {
  color: var(--text-muted);
}

.select-folder-btn {
  margin: var(--space-lg);
}
</style>
