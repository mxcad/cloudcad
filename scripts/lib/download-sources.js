/**
 * 统一下载助手：多源有序回退（双形态 + 内置公开镜像 + 用户自定义源）
 *
 * 背景（ADR-0059 决策 9）：
 *   国内访问 GitHub 不稳定，且未来需支持自定义下载地址（自己服务器快速下载）。
 *   所有从 GitHub Release / 外部源下载二进制/资产的点（dev preinstall、CI、
 *   Windows 标准组件）统一走本助手，行为一致、单一事实源。
 *
 * 两种镜像形态：
 *   ① 基地址替换（base-replacement）：`<base>/<asset>` —— 自己服务器 / rsync 镜像用，
 *      现有 `RUNTIME_DOWNLOAD_URL` 语义（base 替换 GitHub release 基地址，asset 名不变）。
 *   ② 前缀代理（prefix-proxy）：`<prefix>/https://github.com/...` —— ghproxy 类公开加速用，
 *      把完整 GitHub URL 拼在镜像前缀后。
 *
 * 回退顺序（resolveSourceList 产出）：
 *   [ ...用户自定义源（RUNTIME_DOWNLOAD_URLS / RUNTIME_DOWNLOAD_URL，base 形态，最高优先）,
 *     GitHub 直链（canonical，主源）,
 *     ...内置公开镜像（BUILTIN_MIRRORS，prefix 形态，兜底） ]
 *   用户配 RUNTIME_DOWNLOAD_URLS → 自己服务器放最前=优先；仍保留 GitHub + 内置镜像作回退兜底。
 *
 * 回退判定 = 超时 + 状态码双判：
 *   每源设连接/读取超时（RUNTIME_DOWNLOAD_TIMEOUT_MS，默认 60s），超时或 HTTP 非 2xx 即切下一源；
 *   全部失败才抛错。必须判超时——国内 GitHub 典型症状是「TCP 能连但传输极慢/卡死」，
 *   仅判状态码会卡在慢速源上。
 *
 * 环境变量：
 *   RUNTIME_DOWNLOAD_URLS       有序列表（逗号/空格分隔），每项为 base 形态基地址，最高优先
 *   RUNTIME_DOWNLOAD_URL        单一 base 形态基地址（向后兼容，等价列表长度 1）
 *   RUNTIME_DOWNLOAD_TIMEOUT_MS 每源超时（毫秒，默认 60000）
 *   RUNTIME_DISABLE_BUILTIN_MIRRORS=1  禁用内置公开镜像（只走用户源 + GitHub 直链）
 *
 * 使用：
 *   const { downloadFile } = require('./lib/download-sources');
 *   const { url, bytes } = await downloadFile(canonicalGithubUrl, destPath);
 */

// 内置公开 GitHub 加速镜像（前缀代理形态：`<prefix>/https://github.com/...`）。
// 社区服务、无 SLA、随时可能挂——仅作回退兜底，不是主源。
// 清单易腐：镜像失效/更换时只改这里（单一事实源）。生产/内网场景推荐自己服务器
// （经 RUNTIME_DOWNLOAD_URLS 前插，见 ADR-0059）。
const BUILTIN_MIRRORS = [
  'https://ghproxy.com/',
  'https://mirror.ghproxy.com/',
  'https://gh-proxy.com/',
];

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * 取每源超时（毫秒）。
 */
function getTimeoutMs() {
  const raw = process.env.RUNTIME_DOWNLOAD_TIMEOUT_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * 解析用户自定义源列表（base 形态）。
 * @returns {string[]} base 形态基地址列表（已 trim、去空）
 */
function getUserBases() {
  const listRaw = process.env.RUNTIME_DOWNLOAD_URLS;
  const single = process.env.RUNTIME_DOWNLOAD_URL;
  let bases = [];
  if (listRaw && listRaw.trim()) {
    bases = listRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  } else if (single && single.trim()) {
    bases = [single.trim()];
  }
  // 规范化：去尾部斜杠（拼接时统一加），去重保序
  const seen = new Set();
  const norm = [];
  for (const b of bases) {
    const key = b.replace(/\/+$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      norm.push(key);
    }
  }
  return norm;
}

/**
 * 取 asset 文件名（canonical URL 的最后一段路径）。
 * @param {string} canonicalUrl
 */
function assetNameOf(canonicalUrl) {
  const idx = canonicalUrl.lastIndexOf('/');
  return idx >= 0 ? canonicalUrl.slice(idx + 1) : canonicalUrl;
}

/**
 * 判断一个 URL 是否 GitHub Release 下载直链（用于决定前缀代理是否适用）。
 * 仅对 github.com / raw.githubusercontent.com 的直链套前缀代理。
 * @param {string} url
 */
function isGitHubUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname === 'github.com' ||
      u.hostname === 'raw.githubusercontent.com' ||
      u.hostname === 'objects.githubusercontent.com'
    );
  } catch {
    return false;
  }
}

/**
 * 解析有序回退源列表。
 * @param {string} canonicalUrl GitHub Release 下载直链（主源）
 * @returns {Array<{url:string; label:string; form:'user-base'|'direct'|'prefix'}>}
 */
function resolveSourceList(canonicalUrl) {
  const sources = [];
  const asset = assetNameOf(canonicalUrl);

  // 1. 用户自定义源（base 形态，最高优先）
  for (const base of getUserBases()) {
    sources.push({ url: `${base}/${asset}`, label: `user-base ${base}`, form: 'user-base' });
  }

  // 2. GitHub 直链（主源）
  sources.push({ url: canonicalUrl, label: 'github direct', form: 'direct' });

  // 3. 内置公开镜像（prefix 形态，兜底）——仅对 GitHub 直链适用
  if (process.env.RUNTIME_DISABLE_BUILTIN_MIRRORS !== '1' && isGitHubUrl(canonicalUrl)) {
    for (const prefix of BUILTIN_MIRRORS) {
      sources.push({ url: `${prefix}${canonicalUrl}`, label: `prefix ${prefix}`, form: 'prefix' });
    }
  }

  return sources;
}

/**
 * 从单个源下载文件到 destPath（带超时）。
 * @param {string} url
 * @param {string} destPath
 * @param {number} timeoutMs
 * @returns {Promise<number>} 写入字节数
 * @throws 超时 / HTTP 非 2xx / 网络错误
 */
async function fetchFromSource(url, destPath, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  require('fs').writeFileSync(destPath, buf);
  return buf.length;
}

/**
 * 多源有序回退下载。
 * @param {string} canonicalUrl GitHub Release 下载直链（主源）
 * @param {string} destPath 落盘路径
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] 每源超时（默认 getTimeoutMs()）
 * @param {Function} [opts.onTry] 回调 (source, attempt) => void（日志用）
 * @returns {Promise<{url:string; label:string; bytes:number}>} 成功源的 URL/标签/字节数
 * @throws 所有源均失败时抛错（含各源失败原因）
 */
async function downloadFile(canonicalUrl, destPath, opts = {}) {
  const timeoutMs = opts.timeoutMs || getTimeoutMs();
  const sources = resolveSourceList(canonicalUrl);
  const errors = [];

  for (const src of sources) {
    if (opts.onTry) opts.onTry(src, sources.length);
    try {
      const bytes = await fetchFromSource(src.url, destPath, timeoutMs);
      return { url: src.url, label: src.label, bytes };
    } catch (e) {
      errors.push(`${src.label} → ${e.message}`);
      // 切下一源
    }
  }

  throw new Error(
    `所有下载源均失败（${canonicalUrl}）：\n  ${errors.join('\n  ')}\n` +
      `修复方式：\n` +
      `  - 设置 RUNTIME_DOWNLOAD_URLS 指向可用镜像/自己服务器（逗号分隔，前者优先）\n` +
      `  - 或手动下载 ${canonicalUrl} 放置到目标目录\n` +
      `  - 内网环境设 RUNTIME_DOWNLOAD_URLS 指向内网镜像`
  );
}

module.exports = {
  BUILTIN_MIRRORS,
  DEFAULT_TIMEOUT_MS,
  getTimeoutMs,
  getUserBases,
  assetNameOf,
  isGitHubUrl,
  resolveSourceList,
  fetchFromSource,
  downloadFile,
};
