import { useCadStore } from '@/stores/cad.store';
import { useProgress } from './useProgress';
import { useCadEngineInit } from './useCadEngineInit';
import { useCadFileOperations } from './useCadFileOperations';
import { useCadFileStorage } from './useCadFileStorage';
import { mxcadApi } from '@/services/mxcadApi';

const FILE_READY_MAX = 30;
const FILE_READY_INTERVAL = 2000;

export function useCadEngine() {
  const store = useCadStore();
  const progress = useProgress();

  const {
    initialize,
    getMxCADView,
    showMxCAD,
    syncFileName,
  } = useCadEngineInit();

  const {
    setupFileOpenListener,
    openFile,
    saveFile,
    exportFile,
    openUploadedFile,
    isMxwebFile,
    isCadFile,
    generateThumbnail,
    saveToBlob,
  } = useCadFileOperations();

  const {
    buildDownloadUrl,
    openLocalMxwebFile,
  } = useCadFileStorage();

  async function openLibraryDrawing(
    nodeId: string,
    name: string,
    key: 'drawing' | 'block' = 'drawing',
  ): Promise<void> {
    store.setCurrentFileInfo({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      name,
      libraryKey: key,
    });
    await openFile(buildDownloadUrl(nodeId));
    syncFileName();
  }

  async function openLibraryBlock(nodeId: string, name: string): Promise<void> {
    await openLibraryDrawing(nodeId, name, 'block');
  }

  async function waitForFileReady(nodeId: string): Promise<{
    fileHash: string;
    path: string;
    name: string;
    parentId: string;
  } | null> {
    const msgKey = 'file-ready-polling';
    progress.show({ key: msgKey, msg: '正在检查文件是否转换完成...' });
    const result = await mxcadApi.waitForFileReady(
      nodeId,
      FILE_READY_MAX,
      FILE_READY_INTERVAL,
    );
    if (result) {
      progress.update({ key: msgKey, msg: '文件转换完成，正在打开...' });
      progress.hide(msgKey);
      return result;
    }
    progress.hide(msgKey);
    return null;
  }

  async function openLocalFile(file: File): Promise<void> {
    await openLocalMxwebFile(
      file,
      openFile,
      (info) => store.setCurrentFileInfo(info),
    );
  }

  async function downloadFile(
    nodeId: string,
    fileName: string,
    format: string,
  ): Promise<Blob> {
    return mxcadApi.downloadFile(nodeId, format);
  }

  return {
    isReady: store.isReady,
    isInitializing: store.isInitializing,
    currentFileInfo: store.currentFileInfo,
    currentFileName: store.currentFileName,
    isDocumentModified: store.documentModified,
    initialize,
    openFile,
    saveFile,
    exportFile,
    openUploadedFile,
    openLibraryDrawing,
    openLibraryBlock,
    openLocalFile,
    showMxCAD,
    syncFileName,
    getMxCADView,
    waitForFileReady,
    isMxwebFile,
    isCadFile,
    setCurrentFileInfo: store.setCurrentFileInfo,
    clearCurrentFileInfo: store.clearCurrentFileInfo,
    setDocumentModified: store.setDocumentModified,
    generateThumbnail,
    downloadFile,
    saveToBlob,
  };
}