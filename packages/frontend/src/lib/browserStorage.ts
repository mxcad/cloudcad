/**
 * 浏览器持久化存储（localStorage / sessionStorage）的唯一出口。
 *
 * 此前散在 38 文件 / 129 调用点的 5 套互不相同容错策略收敛到此处：
 * 内联 try/catch、模块级包装、只判 `globalThis.localStorage` 存在性（配额满仍抛）、
 * 完全裸露（隐私模式 / SSR 下直接崩）、`catch {}` 静默吞。
 *
 * 统一容错语义：
 *  - 隐私模式 / SSR / 存储被禁用 → `localStorage` 可能为 undefined，且访问属性本身
 *    可能抛（旧版 Safari 隐私模式）→ 全部操作安全降级，绝不向业务侧抛错；
 *  - 配额满（QuotaExceededError）/ 序列化或反序列化异常 → 读返回 null、写返回 false、
 *    删静默。
 *
 * 业务侧只消费返回值，禁止各自 try/catch、禁止各自判 `typeof localStorage`、
 * 禁止直接 `localStorage.getItem/setItem/removeItem`。
 * 需要「多键要么全成要么全无」的原子写入（如 auth 三键）不在此层解决，
 * 见 lib/authState.ts（带行为变更，单独评审）。
 */

export type StorageKind = 'local' | 'session';

function resolveStorage(kind: StorageKind): Storage | null {
  try {
    const s =
      kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    return s != null ? s : null;
  } catch {
    // 访问属性本身可能抛（旧版 Safari 隐私模式）
    return null;
  }
}

/** 存储是否可用（存在且可访问）。SSR / 隐私模式下为 false。 */
export function isStorageAvailable(kind: StorageKind = 'local'): boolean {
  return resolveStorage(kind) !== null;
}

/** 读字符串值；存储不可用 / 键不存在 / 读取抛错 → null。 */
export function read(key: string, kind: StorageKind = 'local'): string | null {
  const s = resolveStorage(kind);
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/** 写字符串值；存储不可用 / 写入抛错（配额满）→ false，成功 → true。 */
export function write(
  key: string,
  value: string,
  kind: StorageKind = 'local'
): boolean {
  const s = resolveStorage(kind);
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 删键；存储不可用 / 抛错 → 静默（删除失败不应阻断登出 / 清理流程）。 */
export function erase(key: string, kind: StorageKind = 'local'): void {
  const s = resolveStorage(kind);
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    // 静默
  }
}

/** 读并 JSON.parse；存储不可用 / 键不存在 / 解析失败 → null。 */
export function readJson<T>(key: string, kind: StorageKind = 'local'): T | null {
  const raw = read(key, kind);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** JSON.stringify 后写；序列化失败 / 存储不可用 / 写入抛错 → false。 */
export function writeJson(
  key: string,
  value: unknown,
  kind: StorageKind = 'local'
): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  return write(key, serialized, kind);
}
