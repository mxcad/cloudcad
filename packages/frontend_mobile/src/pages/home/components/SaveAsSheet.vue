<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSaveAs, type SaveTargetType, type LibraryType, type SaveFormat } from '../../../composables/useSaveAs';
import { getMxwebBlob } from '../../../services/saveService';
import { showToast } from 'vant';

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
}>();

const saveAs = useSaveAs();
const error = ref<string | null>(null);
const step = ref<'form' | 'folder'>('form');
const showProjectPicker = ref(false);

const folderPickerTitle = ref('');
const folderNodes = ref<FolderNode[]>([]);
const folderLoading = ref(false);

const invalidChars = /[\\/:*?"<>|]/;

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
    { label: '我的图纸', value: 'personal' },
    { label: '项目文件夹', value: 'project' },
  ];
  if (hasLibraryPermission.value) {
    options.push({ label: '公开资源库', value: 'library' });
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
  if (!(saveAs.fileName.value || '').trim()) {
    error.value = '请输入文件名';
    return;
  }
  if (invalidChars.test(saveAs.fileName.value)) {
    error.value = '文件名不能包含以下字符: \\ / : * ? " < > |';
    return;
  }
  if (!saveAs.selectedParentId.value) {
    if (saveAs.targetType.value === 'personal') {
      saveAs.selectedParentId.value = saveAs.personalSpaceId.value || '';
      if (!saveAs.selectedParentId.value) {
        error.value = '无法获取个人空间';
        return;
      }
    } else if (saveAs.targetType.value === 'project') {
      if (!saveAs.selectedProjectId.value) {
        error.value = '请先选择项目';
        return;
      }
      saveAs.selectedParentId.value = saveAs.selectedProjectId.value;
    } else if (saveAs.targetType.value === 'library') {
      error.value = '请先选择文件夹';
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
      showToast('保存成功');
      emit('success', { nodeId: result.nodeId || '', fileName: saveAs.fileName.value });
      emit('close');
    } else {
      error.value = result.message || '保存失败';
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '保存失败，请稍后重试';
  }
}

async function handleSaveLocal() {
  try {
    const blob = await getMxwebBlob();
    const ext = saveAs.format.value === 'mxweb' ? 'mxweb' : saveAs.format.value;
    const name = `${saveAs.fileName.value || 'drawing'}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已下载到本地');
    emit('close');
  } catch {
    showToast('下载失败');
  }
}

async function openFolderPicker() {
  folderPickerTitle.value = saveAs.targetType.value === 'personal' ? '我的图纸' : '选择文件夹';
  folderLoading.value = true;
  step.value = 'folder';

  let rootId = '';
  if (saveAs.targetType.value === 'personal') {
    rootId = saveAs.personalSpaceId.value || '';
  } else if (saveAs.targetType.value === 'project') {
    rootId = saveAs.selectedProjectId.value;
    if (!rootId) {
      showToast('请先选择项目');
      step.value = 'form';
      return;
    }
  }

  folderNodes.value = await loadFolderChildren(rootId);
  folderLoading.value = false;
}

async function loadFolderChildren(parentId: string): Promise<FolderNode[]> {
  try {
    const { fileSystemControllerGetChildren } = await import('../../../api-sdk');
    const result = await fileSystemControllerGetChildren({
      path: { nodeId: parentId },
      query: { nodeType: 'folder' },
    });
    if (result.error) throw result.error;
    const data = result.data as unknown as { nodes: Array<{ id: string; name: string; isFolder: boolean }> };
    return (data?.nodes || []).map(n => ({
      id: n.id,
      name: n.name,
      isFolder: n.isFolder,
    }));
  } catch {
    return [];
  }
}

function selectFolder(nodeId: string) {
  saveAs.selectedParentId.value = nodeId;
  step.value = 'form';
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    :style="{ height: '85vh' }"
    @close="emit('close')"
    @opened="init"
  >
    <!-- Folder Picker View -->
    <template v-if="step === 'folder'">
      <div class="sheet-header">
        <button class="sheet-back" @click="step = 'form'">← 返回</button>
        <span class="sheet-title">{{ folderPickerTitle }}</span>
        <span class="sheet-spacer"></span>
      </div>
      <div class="sheet-body">
        <van-loading v-if="folderLoading" />
        <van-cell-group v-else>
          <van-cell
            v-for="node in folderNodes"
            :key="node.id"
            :title="node.name"
            is-link
            @click="selectFolder(node.id)"
          />
          <van-empty v-if="folderNodes.length === 0" description="无子文件夹" />
        </van-cell-group>
      </div>
    </template>

    <!-- Main Form View -->
    <template v-else>
      <div class="sheet-header">
        <span class="sheet-title">另存为</span>
        <button class="sheet-close" @click="emit('close')">✕</button>
      </div>

      <div class="sheet-body">
        <div v-if="error" class="sheet-error">{{ error }}</div>

        <!-- File Name -->
        <div class="sheet-field">
          <label class="sheet-label">文件名</label>
          <van-field
            v-model="saveAs.fileName.value"
            placeholder="请输入文件名"
            :disabled="saveAs.saving.value"
            clearable
          />
        </div>

        <!-- Destination Type -->
        <div class="sheet-field">
          <label class="sheet-label">保存到</label>
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

        <!-- Project Selector -->
        <div v-if="saveAs.targetType.value === 'project'" class="sheet-field">
          <label class="sheet-label">选择项目</label>
          <van-field
            :model-value="selectedProjectName || '请选择项目'"
            is-link
            readonly
            :disabled="saveAs.saving.value"
            @click="showProjectPicker = true"
          />
        </div>

        <!-- Library Type Selector -->
        <div v-if="saveAs.targetType.value === 'library'" class="sheet-field">
          <label class="sheet-label">选择资源库</label>
          <van-radio-group v-model="saveAs.libraryType.value" direction="horizontal">
            <van-radio name="drawing" :disabled="saveAs.saving.value">图纸库</van-radio>
            <van-radio name="block" :disabled="saveAs.saving.value">图块库</van-radio>
          </van-radio-group>
        </div>

        <!-- Folder Selector -->
        <div class="sheet-field">
          <label class="sheet-label">保存位置</label>
          <van-button
            size="small"
            type="default"
            @click="openFolderPicker"
            :disabled="saveAs.saving.value || (saveAs.targetType.value === 'project' && !saveAs.selectedProjectId.value)"
          >
            {{ saveAs.selectedParentId.value ? '已选择文件夹' : '点击选择文件夹' }}
          </van-button>
        </div>

        <!-- Format Selector -->
        <div class="sheet-field">
          <label class="sheet-label">保存格式</label>
          <van-radio-group v-model="saveAs.format.value" direction="horizontal">
            <van-radio name="dwg" :disabled="saveAs.saving.value">DWG</van-radio>
            <van-radio name="dxf" :disabled="saveAs.saving.value">DXF</van-radio>
            <van-radio name="pdf" :disabled="saveAs.saving.value">PDF</van-radio>
            <van-radio name="mxweb" :disabled="saveAs.saving.value">MXWEB</van-radio>
          </van-radio-group>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="sheet-footer">
        <van-button
          type="default"
          @click="handleSaveLocal"
          :disabled="saveAs.saving.value"
          class="footer-btn"
        >
          另存为到本地
        </van-button>
        <van-button
          type="primary"
          @click="handleSave"
          :loading="saveAs.saving.value"
          class="footer-btn"
        >
          保存
        </van-button>
      </div>
    </template>
  </van-popup>

  <!-- Project Picker Popup -->
  <van-popup
    v-model:show="showProjectPicker"
    position="bottom"
    round
  >
    <van-picker
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    />
  </van-popup>
</template>

<style scoped>
.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.sheet-title {
  font-size: 18px;
  font-weight: 600;
}

.sheet-close, .sheet-back {
  background: none;
  border: none;
  font-size: 16px;
  padding: 4px 8px;
}

.sheet-spacer {
  width: 40px;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.sheet-field {
  margin-bottom: 20px;
}

.sheet-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #666;
}

.sheet-error {
  padding: 10px 16px;
  background: #fff0f0;
  color: #ff4444;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.sheet-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #eee;
}

.footer-btn {
  flex: 1;
}
</style>
