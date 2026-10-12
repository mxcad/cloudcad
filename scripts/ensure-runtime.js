/**
 * 开发环境运行时自检脚本（package.json preinstall 钩子调用）
 *
 * 功能：
 *   - 检查本平台【产品二进制】是否就绪：
 *       Linux:   runtime/linux/mxcad/           （mxcad 图纸转换器）
 *       Windows: runtime/windows/mxcad/         （mxcad 图纸转换器）
 *                runtime/windows/mxversion/     （mxversion 版本工具）
 *                runtime/windows/postgresql/    （本地 PG，Windows 无官方安装源）
 *   - 缺失时自动从 GitHub Releases 下载对应平台×架构的包
 *   - 标准组件（node/postgres/redis/subversion）不走 Release：
 *       Linux:   检测本机系统安装（command -v + 端口），缺失则打印精确安装命令
 *       Windows: 调 scripts/build-windows-runtime.js 从官方源下载解压
 *   - 幂等：已就绪则直接跳过，零开销，不阻塞日常 pnpm install
 *
 * 使用方式：
 *   node scripts/ensure-runtime.js
 *
 * 说明：
 *   - 组件/平台/架构清单来自 scripts/pack-lib/mxcad-registry.json（产品二进制
 *     产物索引，upload-mxcad.js 生成）。postgresql 只有 windows 条目——
 *     Windows 无官方 PG 安装源（EDB 直链 403，见 build-windows-runtime.js 头注释），
 *     故随产品二进制通道分发；Linux 开发机用系统 postgres，registry 无对应条目。
 *   - 仅用于【开发环境】从源码 clone 后初始化。离线部署包内嵌完整 runtime，
 *     不联网（保持离线纯净，见 docs/git-workflow.md）。
 *   - 下载源可通过环境变量覆盖（私有化部署可指向内网镜像）：
 *       RUNTIME_DOWNLOAD_URLS 完整下载基地址列表，逗号或空格分隔，前者优先
 *       RUNTIME_DOWNLOAD_URL  单个基地址（等价于长度为 1 的列表）
 *       RUNTIME_RELEASE_TAG   mxcad Release 标签（默认 mxcad-stable）
 *       CLOUDCAD_SKIP_STD_RUNTIME=1 跳过标准组件拉取（技术用户自管）
 *       CLOUDCAD_AUTO_INSTALL=1     Linux 缺件时自动装系统包（需 root）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
// 下载临时文件落点（gitignore），与 build-windows-runtime.js 的约定一致
const CACHE_DIR = path.join(RUNTIME_DIR, 'cache');
const IS_WINDOWS = os.platform() === 'win32';
const IS_LINUX = os.platform() === 'linux';

const RUNTIME_RELEASE_TAG = process.env.RUNTIME_RELEASE_TAG || 'mxcad-stable';
// 产品二进制 Release 所在仓库（与 git remote origin 一致）
const GH_REPO = process.env.RUNTIME_RELEASE_REPO || 'mxcad/cloudcad';

// 技术用户自管标准组件时整体跳过自动拉取
const SKIP_STD_RUNTIME = process.env.CLOUDCAD_SKIP_STD_RUNTIME === '1';
// Linux 缺件默认只打印安装命令；显式开启才自动 apt/dnf/yum 装系统包（改系统包数据库是重副作用）
const AUTO_INSTALL = process.env.CLOUDCAD_AUTO_INSTALL === '1';

// 产品二进制产物索引（platform×arch×component → 资产名/哈希），upload-mxcad.js 生成
const REGISTRY_PATH = path.join(__dirname, 'pack-lib', 'mxcad-registry.json');
// 组件关键可执行文件单一事实源（避免"目录非空"误判部分解压为就绪）
const {
  LINUX_CRITICAL_FILES,
  WINDOWS_CRITICAL_FILES,
  PRODUCT_CRITICAL_FILES,
} = require('./pack-lib/components');
// 统一下载助手（多源有序回退 + 内置公开镜像 + 超时判定，见 ADR-0059 决策 9）
const { downloadFile, getUserBases } = require('./lib/download-sources');

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
 * 从产物索引自动发现本平台需要就绪的产品二进制。
 * mxcad-registry.json 由 scripts/upload-mxcad.js 生成，包含所有组件×平台×架构条目：
 *   {
 *     "mxcad-linux-x86_64": { component, platform, arch, hash, asset },
 *     "mxversion-windows-x64": { ... },
 *     "postgresql-windows-x64": { ... }   // Windows 本地 PG（EDB 直链 403，随产品通道分发）
 *   }
 * 脚本按【当前平台×当前架构】过滤。postgresql 只有 windows 条目，故 Linux 侧
 * 天然不会被纳入——Linux 开发机用系统 postgres，无需 300MB 本地包。
 *
 * @returns {Array<{rel:string; component:string; assetPrefix:string; asset:string}>}
 */
function requiredProductDirs() {
  const arch = getArchSuffix();
  const platform = IS_WINDOWS ? 'windows' : 'linux';
  const result = [];

  try {
    if (!fs.existsSync(REGISTRY_PATH)) {
      error(`产物索引不存在: ${path.relative(PROJECT_ROOT, REGISTRY_PATH)}（请运行 scripts/upload-mxcad.js 生成）`);
      return result;
    }
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    for (const key of Object.keys(registry || {})) {
      const entry = registry[key];
      if (!entry || entry.platform !== platform || entry.arch !== arch) continue;
      result.push({
        rel: path.join('runtime', platform, entry.component),
        component: entry.component,
        assetPrefix: `${entry.component}-${platform}-${arch}-`,
        asset: entry.asset,
      });
    }
  } catch (e) {
    error(`读取产物索引失败: ${e.message}`);
  }
  return result;
}

/**
 * 组件目录是否就绪：关键可执行文件存在（而非仅目录非空）。
 * 下载中断的部分解压会留下非空目录，"目录非空"判定会把残缺误判为就绪，
 * 导致 preinstall 报"已就绪"而实际无法运行。
 * @param {string} component
 * @param {string} absDir  组件目录绝对路径
 * @returns {boolean}
 */
function isComponentReady(component, absDir) {
  const crit = PRODUCT_CRITICAL_FILES[component]
    ? PRODUCT_CRITICAL_FILES[component][IS_WINDOWS ? 'windows' : 'linux']
    : IS_WINDOWS
      ? WINDOWS_CRITICAL_FILES[component]
      : LINUX_CRITICAL_FILES[component];
  if (!crit) return dirHasContent(absDir);
  return fs.existsSync(path.join(absDir, crit));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 确保标准组件（node/redis/subversion；postgresql 见产品二进制循环）就绪。
 * 标准组件不走 GitHub Release 资产包，按平台分派：
 *   - Windows：调 scripts/build-windows-runtime.js 从官方源下载解压 node/redis
 *     到 runtime/windows/。全程只写 runtime/windows/，零系统副作用。
 *   - Linux：检测本机系统安装（command -v）。开发机通常已有，且
 *     pg-manager.js / redis-manager.js / mxpath.js 均已内置系统 PATH 回退；
 *     缺失时打印按发行版适配的安装命令。
 * @returns {Promise<boolean>} 是否就绪（含已就绪跳过 / opt-out 跳过）
 */
async function ensureStandardComponents() {
  if (SKIP_STD_RUNTIME) {
    log('CLOUDCAD_SKIP_STD_RUNTIME=1，跳过标准组件自动拉取（技术用户自管 node/redis/svn）');
    return true;
  }
  if (IS_WINDOWS) return ensureWindowsStandardComponents();
  if (IS_LINUX) return ensureLinuxStandardComponents();
  log(`未识别平台 ${os.platform()}，跳过标准组件检测`);
  return true;
}

/**
 * Windows 标准组件：node / redis 从官方源下载解压到 runtime/windows/。
 * 调用顺序有约束——postgresql 必须先由产品二进制循环下载完成，因为
 * build-windows-runtime.js 的出口断言包含 postgresql，缺它会抛错退出。
 * @returns {boolean}
 */
function ensureWindowsStandardComponents() {
  const platformDir = path.join(RUNTIME_DIR, 'windows');
  const names = Object.keys(WINDOWS_CRITICAL_FILES).filter((name) => name !== 'postgresql');
  const missing = names.filter((name) => !isComponentReady(name, path.join(platformDir, name)));
  if (missing.length === 0) {
    log('✓ 标准组件已就绪: runtime/windows/（node/redis）');
    return true;
  }
  log(`标准组件缺失（${missing.join(', ')}），从官方源下载解压到 runtime/windows/...`);
  const script = path.join(PROJECT_ROOT, 'scripts', 'build-windows-runtime.js');
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (r.error) {
    error(`标准组件下载启动失败: ${r.error.message}`);
    return false;
  }
  const stillMissing = missing.filter((name) => !isComponentReady(name, path.join(platformDir, name)));
  if (r.status !== 0 || stillMissing.length > 0) {
    const detail = stillMissing.length > 0 ? stillMissing.join(', ') : `exit ${r.status}`;
    error(`标准组件未就绪（${detail}）。手动补齐: node scripts/build-windows-runtime.js --force`);
    return false;
  }
  log(`✓ 标准组件就绪: runtime/windows/（${missing.join(', ')}）`);
  return true;
}

// Linux 标准组件检测项：bin=PATH 探测名，apt/yum 为对应包名
const LINUX_STD_COMPONENTS = [
  { bin: 'psql', apt: 'postgresql-15', yum: 'postgresql15-server' },
  { bin: 'redis-server', apt: 'redis-server', yum: 'redis' },
  { bin: 'svn', apt: 'subversion', yum: 'subversion' },
];

/**
 * Linux 标准组件：检测本机系统安装。缺失时打印按发行版适配的安装命令。
 * 默认不自动装系统包——pnpm install 阶段静默改系统包数据库（apt/dnf）是重副作用；
 * CLOUDCAD_AUTO_INSTALL=1 显式开启才自动装。
 * @returns {boolean}
 */
function ensureLinuxStandardComponents() {
  const missing = LINUX_STD_COMPONENTS.filter((c) => !commandExists(c.bin));
  if (missing.length === 0) {
    log('✓ 标准组件已就绪: 系统 psql/redis-server/svn 均已安装（走系统 PATH）');
    return true;
  }

  const pkgMgr = detectPackageManager();
  const pkgs = missing.map((c) => (pkgMgr === 'apt' ? c.apt : c.yum)).join(' ');
  const cmd = pkgMgr === 'apt' ? `sudo apt-get install -y ${pkgs}` : `sudo ${pkgMgr} install -y ${pkgs}`;

  log(`标准组件缺失: ${missing.map((c) => c.bin).join(', ')}（系统未安装）`);
  log(`  安装命令: ${cmd}`);
  if (pkgMgr !== 'apt') {
    log(`  提示: ${pkgMgr} 需先配 PGDG 源才能装 postgresql15-server，否则先装 redis/subversion`);
  }
  log('  装好后可选: sudo node scripts/extract-linux-runtime.js（提取到 runtime/linux/，供打包复用）');

  if (!AUTO_INSTALL) return false;

  const extractScript = path.join(PROJECT_ROOT, 'scripts', 'extract-linux-runtime.js');
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const tty = !!process.stdout.isTTY;
  if (!isRoot && !tty) {
    log('  非 root 且无 TTY，无法交互输入 sudo 密码；请手动执行: sudo node scripts/extract-linux-runtime.js');
    return false;
  }
  log('CLOUDCAD_AUTO_INSTALL=1，自动安装并提取到 runtime/linux/...');
  const r = isRoot
    ? spawnSync(process.execPath, [extractScript], { stdio: 'inherit' })
    : spawnSync('sudo', [process.execPath, extractScript], { stdio: 'inherit' });
  if (r.error) {
    error(`自动安装启动失败: ${r.error.message}`);
    return false;
  }
  if (r.status !== 0) {
    error(`自动安装失败（exit ${r.status}）。请手动执行: sudo node scripts/extract-linux-runtime.js`);
    return false;
  }
  log('✓ 标准组件已安装并提取到 runtime/linux/');
  return true;
}

/**
 * 检测包管理器：apt（debian/ubuntu）优先，其次 dnf，最后 yum。
 * @returns {string} 'apt' | 'dnf' | 'yum'
 */
function detectPackageManager() {
  return commandExists('apt-get') ? 'apt' : commandExists('dnf') ? 'dnf' : 'yum';
}

/**
 * 命令是否存在于 PATH
 * @param {string} bin
 * @returns {boolean}
 */
function commandExists(bin) {
  try {
    execSync(IS_WINDOWS ? `where ${bin}` : `command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 Release 下载并解压某个产品二进制到目标目录。
 * 资产名优先取产物索引登记的 asset，其次环境变量 <COMPONENT>_ASSET，
 * 最后回退 GitHub API 解析（用于索引未登记 asset 的情况）。
 * 下载经 downloadFile（用户源 → GitHub 直链 → 内置镜像的多源回退 + 超时）。
 * @param {{component:string; asset?:string; assetPrefix:string}} item
 * @param {string} targetDir  解压目标目录
 * @returns {boolean}
 */
async function downloadProduct(item, targetDir) {
  const { component, assetPrefix } = item;
  const forced = process.env[`${component.toUpperCase()}_ASSET`];
  const asset = forced || item.asset || (await resolveAssetName(component, assetPrefix));
  if (!asset) {
    error(`无法确定 ${component} 的资产名。请设 ${component.toUpperCase()}_ASSET=<资产名> 指定`);
    return false;
  }

  // canonical = GitHub Release 直链；downloadFile 会自动在其前面叠加用户源与镜像
  const canonicalUrl = `https://github.com/${GH_REPO}/releases/download/${RUNTIME_RELEASE_TAG}/${asset}`;
  // 临时文件必须保留原始扩展名：PowerShell Expand-Archive 按扩展名判断格式，
  // 无扩展名会报「不是支持的存档文件格式」——下载成功、解压必失败（实测复现）。
  // runtime/cache/ 被 gitignore，干净 clone 下不存在；downloadFile 不负责建目录。
  ensureDir(CACHE_DIR);
  const tmpFile = path.join(CACHE_DIR, `${component}-${Date.now()}${path.extname(asset).toLowerCase()}`);
  try {
    log(`下载 ${component} (${asset}) ...`);
    const { url, bytes } = await downloadFile(canonicalUrl, tmpFile, {
      onTry: (src) => log(`  尝试源: ${src.label}`),
    });
    log(`已下载 (${(bytes / 1024 / 1024).toFixed(1)} MB) 自 ${url}，解压中...`);

    ensureDir(targetDir);
    const lower = asset.toLowerCase();
    if (lower.endsWith('.zip')) extractZip(tmpFile, targetDir);
    else if (lower.endsWith('.7z')) extract7z(tmpFile, targetDir);
    else extractTarGz(tmpFile, targetDir);
    flattenExtracted(targetDir);

    if (!isComponentReady(component, targetDir)) {
      error(`${component} 解压后未找到关键可执行文件，目录可能残缺: ${path.relative(PROJECT_ROOT, targetDir)}`);
      return false;
    }
    log(`✓ ${component} 就绪: ${path.relative(PROJECT_ROOT, targetDir)}`);
    return true;
  } catch (e) {
    error(`下载 ${component} 失败: ${e.message}`);
    return false;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * 提取后扁平化：部分 tar.gz 顶层是 .tmp-<name>/ 嵌套目录（upload-mxcad.js 打包结构），
 * 需把该嵌套层内容提升到目标根，否则关键二进制落在子目录而 isComponentReady 判定失败。
 * 对齐 .github/workflows/release.yml 的 .tmp-* 提升逻辑。
 * @param {string} targetDir
 */
function flattenExtracted(targetDir) {
  try {
    const nested = fs
      .readdirSync(targetDir)
      .find((e) => e.startsWith('.tmp-') && fs.statSync(path.join(targetDir, e)).isDirectory());
    if (!nested) return;
    const nestedDir = path.join(targetDir, nested);
    for (const e of fs.readdirSync(nestedDir)) {
      fs.renameSync(path.join(nestedDir, e), path.join(targetDir, e));
    }
    fs.rmdirSync(nestedDir);
  } catch (e) {
    error(`扁平化失败: ${e.message}`);
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
 * 通过 GitHub API 解析 Release 中匹配 assetPrefix 的资产名。
 * 产物索引已登记 asset 时不会走到这里，故此处是兜底路径。
 * 端点必须是 /releases/tags/{tag} 读 release.assets——
 * /releases/tags/{tag}/assets 不是合法端点，恒 404（upload-mxcad.js 同样走前者）。
 * @returns {Promise<string|null>}
 */
async function resolveAssetName(component, assetPrefix) {
  // 用户指定了自定义下载基地址（内网镜像）时，无法用 GitHub API 解析，
  // 返回 null 交由调用方提示用 <COMPONENT>_ASSET 显式指定资产名。
  if (getUserBases().length > 0) return null;

  try {
    const apiUrl = `https://api.github.com/repos/${GH_REPO}/releases/tags/${RUNTIME_RELEASE_TAG}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cloudcad-ensure-runtime' },
    });
    if (!res.ok) return null;
    const release = await res.json();
    const hit = (release.assets || []).find((a) => a.name.startsWith(assetPrefix));
    return hit ? hit.name : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  // 1. 产品二进制（mxcad / mxversion / Windows 本地 PG）
  const required = requiredProductDirs();
  const missing = [];
  for (const item of required) {
    const abs = path.join(PROJECT_ROOT, item.rel);
    if (isComponentReady(item.component, abs)) {
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
      const ok = await downloadProduct(item, abs);
      if (!ok) productOk = false;
    }
  }

  // 2. 标准组件（Windows: node/redis 本地解压；Linux: 检测系统安装）
  const stdOk = await ensureStandardComponents();

  if (!productOk || !stdOk) {
    log('');
    log('运行时未全部就绪，pnpm install 继续（不阻塞）。补齐方式：');
    log('  - 产品二进制: 手动放置到 runtime/<platform>/<component>/，');
    log('                或解压离线部署包（内嵌完整 runtime），');
    log('                或设 RUNTIME_DOWNLOAD_URLS 指向可访问镜像（逗号分隔，前者优先）');
    log('  - Windows 标准组件: node scripts/build-windows-runtime.js --force');
    log('  - Linux 标准组件:   按上方打印的安装命令装系统包，然后 sudo node scripts/extract-linux-runtime.js');
    log('');
    log(`下次 pnpm install 会自动重试。本次共检查 ${required.length} 个产品二进制条目。`);
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
  isComponentReady,
  dirHasContent,
  getArchSuffix,
  downloadProduct,
  resolveAssetName,
  ensureStandardComponents,
  detectLinuxTier,
  detectPackageManager,
  flattenExtracted,
};
