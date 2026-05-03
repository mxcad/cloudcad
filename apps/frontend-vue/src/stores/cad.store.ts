import { defineStore } from 'pinia';
import { ref, readonly } from 'vue';

/** 当前打开文件的信息 */
export interface CadFileInfo {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  name: string;
  path?: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  fromPlatform?: boolean;
  updatedAt?: string;
}

/**
 * CAD 编辑器全局状态
 *
 * 从 React mxcadManager.ts 的模块级变量迁移到 Pinia。
 * 单一数据源，useCadEngine / useCadCommands / useCadEvents 共享此 store。
 */
export const useCadStore = defineStore('cad', () => {
  // ===== 引擎状态 =====
  const isReady = ref(false);
  const isInitializing = ref(false);
  const documentModified = ref(false);

  // ===== 文件信息 =====
  const currentFileInfo = ref<CadFileInfo | null>(null);
  const currentFileName = ref<string | null>(null);
  const currentMxwebUrl = ref<string | null>(null);

  // ===== 操作方法 =====

  function setReady(ready: boolean): void {
    isReady.value = ready;
  }

  function setInitializing(init: boolean): void {
    isInitializing.value = init;
  }

  function setDocumentModified(modified: boolean): void {
    documentModified.value = modified;
  }

  function setCurrentFileInfo(info: CadFileInfo | null): void {
    currentFileInfo.value = info;
    currentFileName.value = info?.name ?? null;
  }

  function clearCurrentFileInfo(): void {
    currentFileInfo.value = null;
    currentFileName.value = null;
    currentMxwebUrl.value = null;
  }

  function setCurrentMxwebUrl(url: string | null): void {
    currentMxwebUrl.value = url;
  }

  function resetState(): void {
    isReady.value = false;
    isInitializing.value = false;
    documentModified.value = false;
    clearCurrentFileInfo();
  }

  return {
    isReady: readonly(isReady),
    isInitializing: readonly(isInitializing),
    documentModified: readonly(documentModified),
    currentFileInfo: readonly(currentFileInfo),
    currentFileName: readonly(currentFileName),
    currentMxwebUrl: readonly(currentMxwebUrl),

    setReady,
    setInitializing,
    setDocumentModified,
    setCurrentFileInfo,
    clearCurrentFileInfo,
    setCurrentMxwebUrl,
    resetState,
  };
});
