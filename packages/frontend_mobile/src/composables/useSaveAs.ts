import { ref, readonly } from 'vue';
import { useUser } from './useUser';
import { getMxwebBlob, saveAs } from '../services/saveService';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetPersonalSpace,
} from '../api-sdk';
import {
  processPendingImages,
  pendingImageCount,
} from '../services/pendingImageService';
import { showToast } from 'vant';

export type SaveTargetType = 'personal' | 'project' | 'library';
export type LibraryType = 'drawing' | 'block';
export type SaveFormat = 'dwg' | 'dxf' | 'pdf' | 'mxweb';

export const saveAsToCloudTrigger = ref(0);
export const saveLoginRequiredTrigger = ref(0);
export const saveToCloudTrigger = ref(0);

interface ProjectInfo {
  id: string;
  name: string;
}

export function useSaveAs() {
  const saving = ref(false);
  const projects = ref<ProjectInfo[]>([]);
  const personalSpaceId = ref<string | null>(null);
  const { isAuthenticated } = useUser();

  const fileName = ref('');
  const targetType = ref<SaveTargetType>('personal');
  const libraryType = ref<LibraryType>('drawing');
  const selectedProjectId = ref<string>('');
  const selectedParentId = ref<string>('');
  const format = ref<SaveFormat>('dwg');
  const canSaveToLibrary = ref(false);

  async function loadProjects() {
    try {
      const result = await fileSystemControllerGetProjects({
        query: { filter: 'all' },
      });
      if (result.error) throw result.error;
      const nodes =
        (
          result.data as unknown as {
            nodes: Array<{ id: string; name: string }>;
          }
        )?.nodes || [];
      projects.value = nodes.map((n) => ({ id: n.id, name: n.name }));
    } catch {
      projects.value = [];
    }
  }

  async function loadPersonalSpace() {
    try {
      const result = await fileSystemControllerGetPersonalSpace();
      if (result.error) throw result.error;
      const data = result.data as unknown as { id: string };
      personalSpaceId.value = data?.id || null;
    } catch {
      personalSpaceId.value = null;
    }
  }

  function setCanSaveToLibrary(val: boolean) {
    canSaveToLibrary.value = val;
  }

  async function init(fileName_?: string) {
    saving.value = false;
    targetType.value = 'personal';
    libraryType.value = 'drawing';
    selectedProjectId.value = '';
    selectedParentId.value = personalSpaceId.value || '';
    format.value = 'dwg';
    fileName.value = fileName_ || 'untitled';
  }

  async function executeSaveAs(params: {
    blob: Blob;
    targetType: SaveTargetType;
    libraryType?: LibraryType;
    selectedProjectId?: string;
    selectedParentId: string;
    format: SaveFormat;
    fileName: string;
  }): Promise<{ success: boolean; nodeId?: string; message?: string }> {
    saving.value = true;
    try {
      const safeFormat = params.format === 'pdf' ? 'mxweb' : params.format;
      const result = await saveAs({
        blob: params.blob,
        targetType: params.targetType,
        targetParentId: params.selectedParentId,
        fileName: `${params.fileName}.${safeFormat}`,
        projectId:
          params.targetType === 'project'
            ? params.selectedProjectId
            : undefined,
        libraryType:
          params.targetType === 'library' ? params.libraryType : undefined,
        commitMessage: `Save as: ${params.fileName}.${safeFormat}`,
      });
      if (pendingImageCount() > 0 && result.nodeId) {
        await processPendingImages(result.nodeId).catch(() => {});
      }
      saving.value = false;
      return { success: true, nodeId: result.nodeId };
    } catch (e: unknown) {
      saving.value = false;
      const message = e instanceof Error ? e.message : '保存失败';
      return { success: false, message };
    }
  }

  return {
    saving: readonly(saving),
    projects: readonly(projects),
    personalSpaceId: readonly(personalSpaceId),
    isAuthenticated,
    fileName,
    targetType,
    libraryType,
    selectedProjectId,
    selectedParentId,
    format,
    canSaveToLibrary,
    setCanSaveToLibrary,
    init,
    loadProjects,
    loadPersonalSpace,
    executeSaveAs,
  };
}
