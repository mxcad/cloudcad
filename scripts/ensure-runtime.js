/**
 * 开发环境运行时自检脚本（package.json preinstall 钩子调用）
 *
 * 功能：
 *   - 检查本平台【产品二进制】是否就绪：
 *       Linux:   runtime/linux/mxcad/           （mxcad 图纸转换器）
 *       Windows: runtime/windows/mxcad/         （mxcad 图纸转换器）
 *                runtime/windows/mxversion/     （mxversion 版本工具）
 *   - 缺失时自动从 GitHub Releases 下载对应平台×架构的产品二进制包
 *   - 幂等：已就绪则直接跳过，零开销，不阻塞日常 pnpm install
 *
 * 使用方式：
 *   node scripts/ensure-runtime.js
 *
 * 说明：
 *   - 仅检查 mxcad / mxversion 这两个【产品二进制】。
 *     node / postgresql / redis / svn 等标准组件，开发环境通常本地已有，
 *     不一定需要离线版本，因此不强制下载。
 *   - postgresql 虽自 2026-08 起登记进 manifest.json（离线打包用，见
 *     build-windows-runtime.js 头注释），但被 DEV_SKIP_COMPONENTS 排除，
 *     开发环境 preinstall 不会下载它。
 *   - 仅用于【开发环境】从源码 clone 后初始化。离线部署包内嵌完整 runtime，
 *     不联网（保持离线纯净，见 docs/git-workflow.md）。
 *   - 下载源可通过环境变量覆盖（私有化部署可指向内网镜像）：
 *       RUNTIME_DOWNLOAD_URL  完整下载基地址（默认 GitHub Releases）
 *       RUNTIME_RELEASE_TAG   mxcad Release 标签（默认 mxcad-stable）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const IS_WINDOWS = os.platform() === 'win32';

const RUNTIME_DOWNLOAD_URL = process.env.RUNTIME_DOWNLOAD_URL || '';
const RUNTIME_RELEASE_TAG = process.env.RUNTIME_RELEASE_TAG || 'mxcad-stable';

// ADR-0059：标准组件（node/pg/redis/svn）从 runtime-deps 内容寻址包拉取（dev 机开箱即用）
// opt-out：CLOUDCAD_SKIP_STD_RUNTIME=1 整体跳过标准组件自动拉取（技术用户自管）
const SKIP_STD_RUNTIME = process.env.CLOUDCAD_SKIP_STD_RUNTIME === '1';
// runtime 依赖包 Release tag（与 .github/workflows/runtime-deps.yml 上传的 tag 一致）
const RUNTIME_DEPS_REPO = process.env.RUNTIME_DEPS_REPO || 'mxcad/cloudcad';
const RUNTIME_DEPS_TAG = process.env.RUNTIME_DEPS_TAG || 'runtime-deps';
// 组件版本指纹（与 scripts/pack-runtime-deps.js 的 COMPONENT_VERSIONS 单一事实源一致）
const COMPONENT_VERSIONS = { node: '20.19.5', postgres: '15', redis: '5' };
// 统一下载助手（多源有序回退 + 内置公开镜像 + 超时判定，见 ADR-0059 决策 9）
const { downloadFile } = require('./lib/download-sources');

function log(msg) {
  console.log(`[Ensure-Runtime] ${msg}`);
}
function error(msg) {
  console.error(`[Ensure-Runtime] ERROR: ${msg}`);
}

/**
 * 架构后缀，用于匹配 Release 附件名。
 * 与 scripts/upload-mxcad.js 的命名约定保持一致：
 *   - Windows: x64（mxcad-windows-x64-*）
 *   - Linux:   x86_64 / aarch64 / armv7l（mxcad-linux-<arch>-*）
 */
function getArchSuffix() {
  if (IS_WINDOWS) return 'x64';
  const archMap = { x64: 'x86_64', arm64: 'aarch64', arm: 'armv7l', ia32: 'i686' };
  return archMap[process.arch] || process.arch;
}

/**
 * 组件版本指纹（与 scripts/pack-runtime-deps.js 的 COMPONENT_VERSIONS 一致）：
 *   node20.19.5-pg15-redis5
 */
function versionFingerprint() {
  return `node${COMPONENT_VERSIONS.node}-pg${COMPONENT_VERSIONS.postgres}-redis${COMPONENT_VERSIONS.redis}`;
}

/**
 * runtime 依赖包资产名（确定性，与 pack-runtime-deps.js assetName 一致）。
 * @param {string} osTag  发行版 tier（centos7/ubuntu22/rocky9）或 windows
 * @param {string} arch   x86_64 / x64
 */
function runtimeDepsAssetName(osTag, arch) {
  return `cloudcad-runtime-deps-${osTag}-${arch}-${versionFingerprint()}.tar.gz`;
}

/**
 * 探测 Linux 发行版 → 映射到最近 tier（glibc 向后兼容：低 tier 二进制跑高 glibc 系统安全）。
 *   centos/rhel 7 → centos7；ubuntu → ubuntu22；rocky/rhel 8/9 → rocky9；debian → ubuntu22；
 *   未知/无法探测 → centos7（最安全：glibc 2.17 全系统可跑）。
 * 可用 CLOUDCAD_RUNTIME_TIER 显式覆盖（centos7/ubuntu22/rocky9）。
 * @returns {string|null} tier 名；Windows 返回 null
 */
function detectLinuxTier() {
  if (IS_WINDOWS) return null;
  if (process.env.CLOUDCAD_RUNTIME_TIER) return process.env.CLOUDCAD_RUNTIME_TIER;
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const get = (key) => {
      const m = osRelease.match(new RegExp(`^${key}=(.*)$`, 'm'));
      return m ? m[1].trim().replace(/^"|"$/g, '') : '';
    };
    const id = get('ID').toLowerCase();
    const idLike = get('ID_LIKE').toLowerCase();
    const versionId = get('VERSION_ID');
    const isRhelFamily = /rhel|fedora/.test(`${id} ${idLike}`);
    const isRocky = id.includes('rocky');
    const isCentos = id.includes('centos');
    const isUbuntu = id.includes('ubuntu');
    const isDebian = id.includes('debian');
    if (isCentos && versionId.startsWith('7')) return 'centos7';
    if (isRocky) return 'rocky9';
    if (isRhelFamily) {
      // RHEL 系：8/9 → rocky9；7 → centos7
      return versionId.startsWith('7') ? 'centos7' : 'rocky9';
    }
    if (isUbuntu) return 'ubuntu22';
    if (isDebian) return 'ubuntu22';
    return 'centos7'; // 未知发行版：用最安全 tier（glibc 2.17，全系统可跑）
  } catch {
    return 'centos7';
  }
}

/**
 * 目录是否非空
 * @param {string} dir
 * @returns {boolean}
 */
function dirHasContent(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 开发环境不自动下载的标准组件（即使出现在 manifest.json 中）。
 * postgresql 走产品二进制通道仅为离线打包服务（CI release.yml 下载），
 * 开发环境本地已有 PG，若不排除，preinstall 会在每次 pnpm install 拉 ~300MB 包。
 */
const DEV_SKIP_COMPONENTS = new Set(['postgresql']);

/**
 * 从 manifest.json 自动发现本平台需要就绪的产品二进制。
 * manifest 由 scripts/upload-mxcad.js 生成，包含所有组件×平台×架构条目：
 *   {
 *     "mxcad-linux-x86_64": { component, platform, arch, hash, asset },
 *     "mxversion-windows-x64": { ... },
 *     "postgresql-windows-x64": { ... }   // 打包专用，DEV_SKIP_COMPONENTS 排除
 *   }
 * 脚本按【当前平台×当前架构】过滤，并跳过 DEV_SKIP_COMPONENTS。
 *
 * @returns {Array<{rel:string; component:string; assetPrefix:string}>}
 */
function requiredProductDirs() {
  const arch = getArchSuffix();
  const platform = IS_WINDOWS ? 'windows' : 'linux';
  const prefix = `${platform}-${arch}`;

  const result = [];
  try {
    const manifestPath = path.join(PROJECT_ROOT, 'mxcad-dist', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const key of Object.keys(manifest || {})) {
        const entry = manifest[key];
        if (!entry || entry.platform !== platform || entry.arch !== arch) continue;
        if (DEV_SKIP_COMPONENTS.has(entry.component)) continue;
        result.push({
          rel: path.join('runtime', platform, entry.component),
          component: entry.component,
          assetPrefix: `${entry.component}-${platform}-${arch}-`,
        });
      }
      if (result.length > 0) return result;
    }
  } catch (e) {
    error(`读取 manifest.json 失败: ${e.message}`);
  }

  // 无 manifest 时的兜底：直接扫描 mxcad-dist/<platform>-<arch>/ 目录发现组件
  const distDir = path.join(PROJECT_ROOT, 'mxcad-dist', `${platform}-${arch}`);
  if (fs.existsSync(distDir)) {
    for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        const dot = entry.name.lastIndexOf('.');
        const component = dot > 0 ? entry.name.slice(0, dot) : entry.name;
        if (DEV_SKIP_COMPONENTS.has(component)) continue;
        result.push({
          rel: path.join('runtime', platform, component),
          component,
          assetPrefix: `${component}-${platform}-${arch}-`,
        });
      }
    }
  }
  return result;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 确保标准组件（node/pg/redis/svn）就绪：从 runtime-deps 内容寻址包下载解压到 runtime/<platform>/。
 * 幂等：runtime/<platform>/node 目录存在=包已解压，跳过（零开销）。
 * 多源回退：经 WP9 downloadFile（GitHub 主源 → 内置公开镜像 → 用户自定义源）。
 * @returns {Promise<boolean>} 是否就绪（含已就绪跳过 / opt-out 跳过）
 */
async function ensureStandardComponents() {
  if (SKIP_STD_RUNTIME) {
    log('CLOUDCAD_SKIP_STD_RUNTIME=1，跳过标准组件自动拉取（技术用户自管 node/pg/redis/svn）');
    return true;
  }
  const platform = IS_WINDOWS ? 'windows' : 'linux';
  const arch = getArchSuffix();
  const platformDir = path.join(RUNTIME_DIR, platform);
  const nodeDir = path.join(platformDir, 'node');

  // 幂等：node 目录存在=runtime-deps 包已解压
  if (dirHasContent(nodeDir)) {
    log(`✓ 标准组件已就绪: ${platform}/（runtime-deps 包已解压）`);
    return true;
  }

  // 构造 runtime-deps 包名 + 下载源
  const osTag = IS_WINDOWS ? 'windows' : detectLinuxTier();
  const asset = runtimeDepsAssetName(osTag, arch);
  const canonicalUrl = `https://github.com/${RUNTIME_DEPS_REPO}/releases/download/${RUNTIME_DEPS_TAG}/${asset}`;
  log(`标准组件缺失，下载 runtime-deps 包（tier=${osTag}, arch=${arch}）: ${asset}`);

  const tmpFile = path.join(PROJECT_ROOT, `runtime-deps-download-${Date.now()}.tar.gz`);
  try {
    const { url, bytes } = await downloadFile(canonicalUrl, tmpFile, {
      onTry: (src) => log(`  尝试源: ${src.label}`),
    });
    log(`✓ 已下载 (${(bytes / 1024 / 1024).toFixed(1)} MB) 自 ${url}`);
    ensureDir(platformDir);
    extractTarGz(tmpFile, platformDir);
    log(`✓ 标准组件就绪: ${platform}/（node/postgres/redis/subversion）`);
    return true;
  } catch (e) {
    error(`标准组件下载失败: ${e.message}`);
    return false;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * 从 Release 下载并解压某个产品二进制到目标目录
 * @param {string} component  组件名（mxcad / mxversion）
 * @param {string} assetPrefix 附件名前缀
 * @param {string} targetDir   解压目标目录
 * @returns {boolean}
 */
async function downloadProduct(component, assetPrefix, targetDir) {
  const asset = await resolveAssetName(component, assetPrefix);
  if (!asset) return false;

  const baseUrl =
    RUNTIME_DOWNLOAD_URL ||
    `https://github.com/mxcad/cloudcad/releases/download/${RUNTIME_RELEASE_TAG}`;
  const url = `${baseUrl}/${asset}`;

  log(`下载 ${component} (${asset}) 从：`);
  log(`  ${url}`);

  const tmpFile = path.join(PROJECT_ROOT, `${component}-download-${Date.now()}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      error(`下载失败 HTTP ${res.status}: ${url}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpFile, buf);
    log(`已下载 (${(buf.length / 1024 / 1024).toFixed(1)} MB)，解压中...`);

    ensureDir(targetDir);
    const lower = asset.toLowerCase();
    if (lower.endsWith('.zip')) {
      extractZip(tmpFile, targetDir);
    } else if (lower.endsWith('.7z')) {
      extract7z(tmpFile, targetDir);
    } else {
      extractTarGz(tmpFile, targetDir);
    }
    log(`✓ ${component} 就绪: ${targetDir}`);
    return true;
  } catch (e) {
    error(`下载 ${component} 失败: ${e.message}`);
    return false;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

function extractZip(zipPath, targetDir) {
  if (IS_WINDOWS) {
    const script = `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`;
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: 'inherit' });
  }
}

function extract7z(zipPath, targetDir) {
  execSync(`7z x -y "${zipPath}" -o"${targetDir}"`, { stdio: 'inherit' });
}

function extractTarGz(tarPath, targetDir) {
  execSync(`tar -xzf "${tarPath}" -C "${targetDir}"`, { stdio: 'inherit' });
}

/**
 * 解析 Release 中匹配 assetPrefix 的资产名
 * 优先从环境变量 RUNTIME_DOWNLOAD_ASSET 指定，否则查询 GitHub API
 * @returns {Promise<string|null>}
 */
async function resolveAssetName(component, assetPrefix) {
  const forced = process.env[`${component.toUpperCase()}_ASSET`];
  if (forced) return forced;

  // 无 gh CLI 时跳过自动解析，仅提示手动放置
  const baseUrl =
    RUNTIME_DOWNLOAD_URL ||
    `https://github.com/mxcad/cloudcad/releases/download/${RUNTIME_RELEASE_TAG}`;
  // 若用户提供了完整下载基地址（RUNTIME_DOWNLOAD_URL 不含 github.com），
  // 视为内网镜像，无法用 API 解析，返回 null 交由调用方提示。
  if (RUNTIME_DOWNLOAD_URL) return null;

  try {
    const apiUrl = `https://api.github.com/repos/mxcad/cloudcad/releases/tags/${RUNTIME_RELEASE_TAG}/assets`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cloudcad-ensure-runtime' },
    });
    if (!res.ok) return null;
    const assets = await res.json();
    const hit = (assets || []).find((a) => a.name.startsWith(assetPrefix));
    return hit ? hit.name : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  // 1. 产品二进制（mxcad / mxversion）
  const required = requiredProductDirs();
  const missing = [];
  for (const item of required) {
    const abs = path.join(PROJECT_ROOT, item.rel);
    if (dirHasContent(abs)) {
      log(`✓ ${item.component} 已就绪: ${item.rel}`);
    } else {
      missing.push(item);
    }
  }

  let productOk = true;
  if (missing.length === 0) {
    log('✓ 产品二进制全部就绪，无需下载');
  } else {
    log(`检测到 ${missing.length} 个产品二进制缺失，尝试下载...`);
    for (const item of missing) {
      const abs = path.join(PROJECT_ROOT, item.rel);
      const ok = await downloadProduct(item.component, item.assetPrefix, abs);
      if (!ok) productOk = false;
    }
    if (!productOk) {
      log('');
      log('提示：无法自动获取产品二进制。请通过以下任一方式补齐：');
      log('  1. 解压离线部署包（内嵌完整 mxcad/mxversion）');
      log('  2. 手动将产物放置到 runtime/对应目录');
      log('  3. 设置 RUNTIME_DOWNLOAD_URLS 指向可访问的镜像（逗号分隔，前者优先）');
    }
  }

  // 2. 标准组件（node/pg/redis/svn）——runtime-deps 内容寻址包
  const stdOk = await ensureStandardComponents();

  if (!productOk || !stdOk) {
    log('');
    log('部分运行时未就绪。手动补齐方式：');
    log('  - 产品二进制: 解压离线部署包 / 手动放置 runtime/ 对应目录 / 设 RUNTIME_DOWNLOAD_URLS');
    log('  - 标准组件:   手动放置 runtime/<platform>/{node,postgres,redis,subversion} / 设 CLOUDCAD_RUNTIME_TIER');
    return 1;
  }
  log('✓ 运行时全部就绪（产品二进制 + 标准组件）');
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = {
  requiredProductDirs,
  dirHasContent,
  getArchSuffix,
  downloadProduct,
  ensureStandardComponents,
  detectLinuxTier,
  runtimeDepsAssetName,
  versionFingerprint,
};
