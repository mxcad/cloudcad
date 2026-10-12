const DB_NAME = 'emscripten_filesystem';
const DB_VERSION = 1;
const STORE_NAME = 'FILES';
const CACHE_PREFIX = 'local';

function getCacheKey(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  return `${CACHE_PREFIX}/${cleanPath}`;
}

/**
 * 缓存键的「文件路径基」：`local/<path>?t=<ts>` → `local/<path>`。
 * 入参是调用方经 buildCacheKey 拼好的完整键（未经 local/ 前缀处理）。
 */
export function cacheKeyBase(cacheKey: string): string {
  const key = getCacheKey(cacheKey);
  const queryIndex = key.indexOf('?');
  return queryIndex === -1 ? key : key.slice(0, queryIndex);
}

/** 该键是否属于 base 指向的同一份文件：裸键或任意 `?t=` 版本 */
export function isCacheKeyOf(key: IDBValidKey, base: string): boolean {
  if (typeof key !== 'string') return false;
  return key === base || key.startsWith(base + '?t=');
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedMxwebData(cacheKey: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(getCacheKey(cacheKey));
      request.onsuccess = () => {
        const data = request.result as ArrayBuffer | undefined;
        resolve(data || null);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function setMxwebCache(cacheKey: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, getCacheKey(cacheKey));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
  }
}

export async function clearMxwebCache(cacheKey: string): Promise<void> {
  try {
    const db = await openDB();
    const base = cacheKeyBase(cacheKey);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        // 必须扫掉该文件的全部 ?t= 版本：精确键是 put 之后才存在的新版本键，
        // 只删精确键等于删了个空，旧版本永久驻留、每次打开/保存净增一条
        for (const key of keysRequest.result) {
          if (isCacheKeyOf(key, base)) store.delete(key);
        }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
  }
}

/**
 * 构建缓存 key。
 * @param filePath 文件路径
 * @param versionOrTimestamp 版本号或 updatedAt 时间戳（毫秒）
 *   - 传入数字：作为 updatedAt 时间戳 → `{path}?t={ts}`
 *   - 传入字符串（数字格式）：同上
 *   - undefined：最新版本 → `{path}?t=latest`
 */
export function buildCacheKey(filePath: string, versionOrTimestamp?: number | string): string {
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  if (versionOrTimestamp === undefined) {
    return `${cleanPath}?t=latest`;
  }
  return `${cleanPath}?t=${versionOrTimestamp}`;
}
