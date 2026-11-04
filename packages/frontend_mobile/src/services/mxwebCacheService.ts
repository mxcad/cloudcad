const DB_NAME = 'emscripten_filesystem';
const DB_VERSION = 1;
const STORE_NAME = 'FILES';

/**
 * 缓存键 = 引擎 fetch 的完整 URL（与 openMxWeb 传入完全一致，如
 * `/api/v1/mxcad/filesData/...?t=<ts>`）。引擎的 emscripten_start_fetch 以 URL
 * 字符串为 emscripten_filesystem/FILES 的 IDB 键读取（raa），键**不带** local/
 * 前缀才能命中——此前 local/<path>?t=<ts> 是移动端自定命名空间，引擎读不到，
 * 只得走 blob URL 打开，而 blob URL 会破坏引擎对文件内 xref/自引用的相对解析
 * （解析成 blob:origin/<name>，该 blob 不存在 → ERR_FILE_NOT_FOUND，打开失败）。
 * 现键直接取引擎将要 fetch 的 URL，引擎按 URL 键读 IDB 即命中缓存。
 */
function getCacheKey(path: string): string {
  return path;
}

/**
 * 缓存键的「文件路径基」：`<url>?t=<ts>` → `<url>`（丢弃全部查询段）。
 * 入参是调用方传入的完整引擎 fetch URL。
 */
export function cacheKeyBase(cacheKey: string): string {
  const queryIndex = cacheKey.indexOf('?');
  return queryIndex === -1 ? cacheKey : cacheKey.slice(0, queryIndex);
}

/** 该键是否属于 base 指向的同一份文件：裸键或任意查询版本（?t= / ?v= / ?shareToken=） */
export function isCacheKeyOf(key: IDBValidKey, base: string): boolean {
  if (typeof key !== 'string') return false;
  return key === base || key.startsWith(base + '?');
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
