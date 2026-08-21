import { handleError } from '@/utils/errorHandler';

/**
 * MxCAD 文件缓存清理（从 mxcadManagerCore.ts 拆分）
 *
 * - clearOldMxwebCache：清理 Service Worker 缓存中指定路径的旧版本 mxweb（按 ?t= 时间戳比较）
 * - clearFileCacheFromIndexedDB：清理 emscripten 文件系统（IndexedDB）中指定路径的缓存
 */

export async function clearOldMxwebCache(
  filePath: string,
  timestamp: number
): Promise<void> {
  try {
    const cache = await caches.open('mxcad-mxweb-cache');
    const keys = await cache.keys();
    for (const request of keys) {
      const url = new URL(request.url);
      if (
        url.pathname.includes(filePath) &&
        url.searchParams.has('t') &&
        parseInt(url.searchParams.get('t') || '0') < timestamp
      ) {
        await cache.delete(request);
      }
    }
  } catch (error) {
    handleError(error, 'mxcadManager: clearOldMxwebCache');
  }
}

export async function clearFileCacheFromIndexedDB(
  basePath: string
): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = db.transaction(['FILES'], 'readwrite');
    const objectStore = transaction.objectStore('FILES');
    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = objectStore.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    for (const key of allKeys) {
      if (typeof key === 'string') {
        if (key === basePath || key.startsWith(basePath + '?t=')) {
          objectStore.delete(key);
        }
      }
    }
  } catch (error) {
    handleError(error, 'mxcadManager: clearFileCacheFromIndexedDB');
  }
}

/**
 * 保存后写回 emscripten 文件系统缓存（IndexedDB）：
 * 先清旧缓存，再按带时间戳的新路径写入（两处逐字重复收编为一份）。
 * Uint8Array 统一转为 ArrayBuffer（与资源库路径既有行为一致）。
 */
export async function writeFileCacheToIndexedDB(
  basePath: string,
  newCachePath: string,
  data: ArrayBuffer | Uint8Array
): Promise<void> {
  await clearFileCacheFromIndexedDB(basePath);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('emscripten_filesystem', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = db.transaction(['FILES'], 'readwrite');
  const objectStore = transaction.objectStore('FILES');
  const arrayBufferData = data instanceof Uint8Array ? data.buffer : data;
  await new Promise<void>((resolve, reject) => {
    const request = objectStore.put(arrayBufferData, newCachePath);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
