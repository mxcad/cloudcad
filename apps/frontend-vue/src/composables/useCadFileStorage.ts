import { ref } from 'vue';
import { useProgress } from './useProgress';
import { mxcadApi } from '@/services/mxcadApi';

export function useCadFileStorage() {
  const progress = useProgress();

  async function calculateHash(file: File): Promise<string> {
    const { calculateFileHash } = await import('@/utils/hashUtils');
    return calculateFileHash(file);
  }

  function openEmscriptenDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('emscripten_filesystem', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getFromDb(db: IDBDatabase, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = db.transaction(['FILES'], 'readonly').objectStore('FILES').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function putToDb(db: IDBDatabase, key: string, data: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = db.transaction(['FILES'], 'readwrite').objectStore('FILES').put(data, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function openLocalMxwebFile(
    file: File,
    openFile: (url: string) => Promise<void>,
    setCurrentFileInfo: (info: any) => void,
  ): Promise<void> {
    const hash = await calculateHash(file);
    const virtualUrl = `/local-mxweb-cache/${hash}.mxweb`;

    const db = await openEmscriptenDb();
    const existing = await getFromDb(db, virtualUrl);
    if (!existing) {
      const buf = await file.arrayBuffer();
      await putToDb(db, virtualUrl, buf);
    }
    db.close();

    await openFile(virtualUrl);
    setCurrentFileInfo({
      fileId: '',
      parentId: null,
      projectId: null,
      name: file.name,
      personalSpaceId: null,
    });
  }

  function buildDownloadUrl(nodeId: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    const token = localStorage.getItem('accessToken');
    const q = new URLSearchParams(token ? { token } : {});
    return `${base}/api/file-system/nodes/${nodeId}/download?${q}`;
  }

  return {
    calculateHash,
    openEmscriptenDb,
    getFromDb,
    putToDb,
    openLocalMxwebFile,
    buildDownloadUrl,
  };
}