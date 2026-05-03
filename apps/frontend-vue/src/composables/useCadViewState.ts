import { ref } from 'vue';

export function useCadViewState() {
  const currentFileInfo = ref<any>(null);
  const currentFileName = ref('');
  const documentModified = ref(false);

  function setCurrentFileInfo(info: any): void {
    currentFileInfo.value = info;
  }

  function clearCurrentFileInfo(): void {
    currentFileInfo.value = null;
  }

  function setDocumentModified(modified: boolean): void {
    documentModified.value = modified;
  }

  function setCurrentFileName(name: string): void {
    currentFileName.value = name;
  }

  return {
    currentFileInfo,
    currentFileName,
    documentModified,
    setCurrentFileInfo,
    clearCurrentFileInfo,
    setDocumentModified,
    setCurrentFileName,
  };
}