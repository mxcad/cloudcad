<template>
  <v-main class="cad-editor-page">
    <v-progress-linear
      :active="progress.isActive.value" :model-value="progress.percent.value"
      :indeterminate="progress.percent.value === 0" color="primary" height="3"
      style="position: fixed; top: 0; left: 0; right: 0; z-index: 9999"
    />
    <v-snackbar
      v-if="progress.isActive.value" :model-value="!!progress.message.value" :timeout="-1"
      location="bottom center" color="surface" elevation="4" rounded="lg"
    >
      <div class="d-flex align-center ga-3">
        <v-progress-circular v-if="progress.percent.value === 0" indeterminate size="20" width="2" color="primary" />
        <v-icon v-else color="primary" size="20">mdi-upload</v-icon>
        <span class="text-body-2">{{ progress.message.value }}</span>
        <span v-if="progress.percent.value > 0" class="text-caption text-medium-emphasis ml-2">{{ progress.percent.value }}%</span>
      </div>
    </v-snackbar>

    <div ref="cadContainerRef" class="cad-container" :class="{ 'cad-container--hidden': !cad.isReady }" />

    <v-container v-if="!cad.isReady && !progress.isActive.value" class="fill-height d-flex align-center" fluid>
      <v-row justify="center"><v-col cols="12" sm="8" md="5" lg="4">
        <v-card rounded="lg" class="pa-8 text-center" elevation="2">
          <v-icon size="72" color="primary" class="mb-4">mdi-drawing</v-icon>
          <div class="text-h5 font-weight-bold mb-1">CloudCAD</div>
          <div class="text-body-2 text-medium-emphasis mb-6">{{ t('cadEditor.platform') }}</div>
          <v-divider class="mb-6" />
          <UploadManager :node-id="uploadNodeId" :button-text="t('cadEditor.uploadCadFile')" block class="mb-3"
            @success="onFileOpened" @error="onUploadError" />
          <v-file-input
            :show-size="false" accept=".dwg,.dxf,.mxweb,.mxw"
            :label="t('cadEditor.openLocalFile')" variant="outlined" prepend-icon="" append-icon="mdi-folder-open-outline"
            class="mb-3" @update:model-value="onLocalFileSelected"
          />
          <div class="text-caption text-medium-emphasis mt-4">{{ t('cadEditor.supportFormats') }}</div>
        </v-card>
      </v-col></v-row>
    </v-container>

    <v-dialog v-model="exitConfirmVisible" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-3 px-6 pt-5">
          <v-icon color="warning" size="28">mdi-alert-outline</v-icon><span class="text-h6">{{ t('cadEditor.unsavedChanges') }}</span>
        </v-card-title>
        <v-card-text class="px-6 pb-2">{{ t('cadEditor.saveBeforeExit') }}</v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer /><v-btn variant="text" @click="handleExit('cancel')">{{ t('common.cancel') }}</v-btn>
          <v-btn variant="text" color="error" @click="handleExit('discard')">{{ t('cadEditor.dontSave') }}</v-btn>
          <v-btn variant="flat" color="primary" @click="handleExit('save')">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="loginPromptVisible" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-item><template #title>{{ t('cadEditor.loginRequired') }}</template>
          <template #subtitle>{{ t('cadEditor.loginToContinue', { action: loginPromptAction }) }}</template>
        </v-card-item>
        <v-card-actions class="px-4 pb-4">
          <v-spacer /><v-btn variant="text" @click="loginPromptVisible = false">{{ t('cadEditor.later') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="goToLogin">{{ t('cadEditor.goToLogin') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SaveAsModal :show="saveAsVisible" :saving="saveAsSaving" @close="saveAsVisible = false" @save="onSaveAs" />
    <DownloadFormatModal :show="downloadVisible" :file-name="downloadFileName" :loading="downloadLoading"
      @close="downloadVisible = false" @download="onDownload" />
  </v-main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCadEngine } from '@/composables/useCadEngine';
import { useCadCommands } from '@/composables/useCadCommands';
import { useProgress } from '@/composables/useProgress';
import { useCadEvents } from '@/composables/useCadEvents';
import { useAuthStore } from '@/stores/auth.store';
import UploadManager from '@/components/UploadManager.vue';
import SaveAsModal from '@/components/SaveAsModal.vue';
import DownloadFormatModal from '@/components/DownloadFormatModal.vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const router = useRouter();
const auth = useAuthStore();
const cad = useCadEngine();
const progress = useProgress();
const events = useCadEvents();
useCadCommands();

const cadContainerRef = ref<HTMLElement | null>(null);
const exitConfirmVisible = ref(false);
const uploadNodeId = ref('');
const loginPromptVisible = ref(false);
const loginPromptAction = ref('');

const saveAsVisible = ref(false);
const saveAsSaving = ref(false);
const downloadVisible = ref(false);
const downloadLoading = ref(false);
const downloadFileName = ref('');
const downloadNodeId = ref('');

function onFileOpened(): void { cad.generateThumbnail(); }
function onUploadError(e: string): void { console.error('[CadEditorPage]', e); }

async function onLocalFileSelected(files: File | File[] | null): Promise<void> {
  const file = Array.isArray(files) ? files[0] : files;
  if (!file) return;
  progress.start(t('cadEditor.openingFile'));
  try {
    if (cad.isMxwebFile(file.name)) {
      await cad.openLocalMxwebFile(file);
    } else {
      const { useUpload } = await import('@/composables/useUpload');
      const up = useUpload();
      const cb = {
        onProgress: (m: string, p: number) => progress.update(m, p),
        onSuccess: () => onFileOpened(),
        onError: (e: string) => { progress.cancel(); onUploadError(e); },
      };
      auth.isAuthenticated ? up.uploadAuthenticated(file, cb) : up.uploadPublic(file, cb);
    }
  } finally {
    progress.finish();
  }
}

type ExitChoice = 'save' | 'discard' | 'cancel';
function handleExit(c: ExitChoice): void {
  exitConfirmVisible.value = false;
  if (c === 'cancel') return;
  if (c === 'save') cad.saveFile();
  cad.setDocumentModified(false);
}

function onSaveAs(): void { saveAsSaving.value = true; cad.saveFile(); setTimeout(() => { saveAsSaving.value = false; saveAsVisible.value = false; }, 1000); }

async function onDownload(format: string): Promise<void> {
  if (!downloadNodeId.value) return;
  downloadLoading.value = true;
  try {
    const blob = await cad.downloadFile(downloadNodeId.value, downloadFileName.value, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(downloadFileName.value || 'untitled').replace(/\.[^.]+$/, '')}.${format}`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    downloadVisible.value = false;
  }
  catch (error) { console.error('[CadEditorPage]', t('cadEditor.downloadFailed'), error); }
  finally { downloadLoading.value = false; }
}

function goToLogin(): void { loginPromptVisible.value = false; router.push('/login'); }

events.on('save-required', (p: { action: string }) => { loginPromptAction.value = p.action; loginPromptVisible.value = true; });
events.on('file-opened', (p: { fileId: string; parentId?: string }) => { if (p.fileId) router.replace({ query: { nodeId: p.fileId, ...(p.parentId && { parentId: p.parentId }) } }); });
events.on('save-as', (_p: { currentFileName: string }) => { saveAsVisible.value = true; });
events.on('export-file', (p: { fileId: string; fileName: string }) => { downloadNodeId.value = p.fileId; downloadFileName.value = p.fileName; downloadVisible.value = true; });

function beforeUnload(e: BeforeUnloadEvent): void { if (cad.isDocumentModified) e.preventDefault(); }

onMounted(async () => {
  if (!cadContainerRef.value) return;
  progress.start(t('cadEditor.initializingEngine'));
  try { await cad.initialize(cadContainerRef.value); progress.finish(); } catch { progress.update(t('cadEditor.engineInitFailed'), 0); }
  window.addEventListener('beforeunload', beforeUnload);
});
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<style scoped>
.cad-editor-page { position: relative; width: 100%; height: 100vh; overflow: hidden; }
.cad-container { position: absolute; inset: 0; width: 100%; height: 100%; }
.cad-container--hidden { visibility: hidden; pointer-events: none; }
</style>
